import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DUNGEONS } from '@game/shared';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { CompletedQuestRepository } from '../quest/quest.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import { TalentRepository } from '../talent/talent.repository';
import { ActivityRepository } from '../activity/activity.repository';
import { ActivityService } from '../activity/activity.service';
import { NoopActivityScheduler } from '../activity/activity.scheduler';
import { DungeonService } from './dungeon.service';

/**
 * Integrační test M5 dungeon smyčky nad pglite (bez Redisu, NoopScheduler).
 * Čas řídíme fake timers → deterministický předpočítaný combat.
 */
describe('M5 flow: dungeony & combat', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let invRepo: InventoryRepository;
  let dungeons: DungeonService;
  let activity: ActivityService;

  const RFC = DUNGEONS.ragefire_chasm!;
  const T0 = Date.UTC(2026, 5, 14, 12, 0, 0);

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    invRepo = new InventoryRepository(db);
    const invService = new InventoryService(charRepo, invRepo);
    const talentRepo = new TalentRepository(db);
    const activityRepo = new ActivityRepository(db);
    dungeons = new DungeonService(
      charRepo,
      invService,
      talentRepo,
      activityRepo,
      new NoopActivityScheduler(),
    );
    activity = new ActivityService(
      charRepo,
      activityRepo,
      new CompletedQuestRepository(db),
      invRepo,
      new NoopActivityScheduler(),
    );
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function newCharacter(username: string, name: string): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'orc', class: 'warrior' });
    return { accountId, id: char.id };
  }

  /** Silná postava: vysoký level + zbraň → deterministicky vyhraje ragefire. */
  async function strongCharacter(username: string, name: string): Promise<{ accountId: string; id: string }> {
    const c = await newCharacter(username, name);
    await charRepo.addRewards(c.id, 10_000_000, 0); // vysoký level (cap 60)
    await invRepo.addItem(c.id, 'crusader_blade');
    await invRepo.equip(c.id, 'main_hand', 'crusader_blade');
    return c;
  }

  it('listDungeons: lvl 1 vidí ragefire zamčený, vysoký lvl odemčený', async () => {
    const low = await newCharacter('d1', 'Lowbie');
    const list = await dungeons.listDungeons(low.accountId, low.id);
    const rfc = list.find((d) => d.id === 'ragefire_chasm');
    expect(rfc?.unlocked).toBe(false);
    expect(rfc?.bossName).toBe('Taragaman the Hungerer');

    const high = await strongCharacter('d2', 'Bigboss');
    const list2 = await dungeons.listDungeons(high.accountId, high.id);
    expect(list2.find((d) => d.id === 'ragefire_chasm')?.unlocked).toBe(true);
    expect(list2.find((d) => d.id === 'scarlet_monastery')?.unlocked).toBe(true);
  });

  it('vstup do zamčeného dungeonu selže', async () => {
    const low = await newCharacter('d3', 'Tooweak');
    await expect(dungeons.enter(low.accountId, low.id, 'ragefire_chasm')).rejects.toThrow();
  });

  it('neznámý dungeon selže', async () => {
    const c = await strongCharacter('d4', 'Hero');
    await expect(dungeons.enter(c.accountId, c.id, 'nonexistent')).rejects.toThrow();
  });

  it('enter založí běžící run, druhý enter je konflikt', async () => {
    const c = await strongCharacter('d5', 'Warlord');
    const view = await dungeons.enter(c.accountId, c.id, 'ragefire_chasm');
    expect(view.dungeonId).toBe('ragefire_chasm');
    expect(view.victory).toBeNull(); // ještě neskončilo
    expect(view.progress.completed).toBe(false);
    expect(view.events.length).toBeGreaterThan(0); // alespoň encounter_start
    expect(view.enemies.at(-1)?.isBoss).toBe(true);

    await expect(dungeons.enter(c.accountId, c.id, 'ragefire_chasm')).rejects.toThrow();
  });

  it('po uplynutí času je log kompletní a vítězný', async () => {
    const c = await strongCharacter('d6', 'Champion');
    const start = await dungeons.enter(c.accountId, c.id, 'ragefire_chasm');

    vi.setSystemTime(T0 + (start.durationSec + 1) * 1000);
    const log = await dungeons.getCombatLog(c.accountId, c.id);
    expect(log?.progress.completed).toBe(true);
    expect(log?.victory).toBe(true);
    expect(log?.events.at(-1)?.type).toBe('victory');
  });

  it('claim vítězného runu dá plné XP + loot do inventáře', async () => {
    const c = await strongCharacter('d7', 'Looter');
    const start = await dungeons.enter(c.accountId, c.id, 'ragefire_chasm');

    vi.setSystemTime(T0 + (start.durationSec + 1) * 1000);
    const result = await activity.claim(c.accountId, c.id);
    expect(result.reward.xp).toBe(RFC.baseXp);
    expect(result.reward.gold).toBeGreaterThan(0);

    // Loot (pokud padl) je v inventáři.
    const inv = await invRepo.listInventory(c.id);
    const lootCount = inv.reduce((s, r) => s + (r.itemId === 'crusader_blade' ? 0 : r.quantity), 0);
    expect(lootCount).toBe(result.items.length);

    // Aktivita je pryč → lze jít znovu.
    expect(await dungeons.getCombatLog(c.accountId, c.id)).toBeNull();
  });

  it('cizí účet nemůže do dungeonu ani číst log', async () => {
    const owner = await strongCharacter('d8a', 'Owner');
    const other = await newCharacter('d8b', 'Intruder');
    await dungeons.enter(owner.accountId, owner.id, 'ragefire_chasm');
    await expect(dungeons.enter(other.accountId, owner.id, 'ragefire_chasm')).rejects.toThrow();
    await expect(dungeons.getCombatLog(other.accountId, owner.id)).rejects.toThrow();
  });
});
