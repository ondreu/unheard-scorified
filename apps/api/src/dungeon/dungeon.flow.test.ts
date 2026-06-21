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
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import { CompletedQuestRepository } from '../quest/quest.repository';
import { makeGrant } from '../inventory/test-grant';
import { BuffRepository } from '../buff/buff.repository';
import { LockoutRepository } from '../lockout/lockout.repository';
import { ReputationRepository } from '../profession/profession.repository';
import { LevelUpRepository } from '../levelup/levelup.repository';
import { RotationService } from '../rotation/rotation.service';
import { RotationRepository } from '../rotation/rotation.repository';
import { HistoryRepository } from '../history/history.repository';
import { BestiaryService } from '../bestiary/bestiary.service';
import { BestiaryRepository } from '../bestiary/bestiary.repository';
import { PushRepository } from '../push/push.repository';
import { PushService } from '../push/push.service';
import { RaidRepository } from '../raid/raid.repository';
import { InMemoryRaidQueue } from '../raid/raid.matchmaking';
import { DungeonService } from './dungeon.service';

/**
 * Integrační test sjednoceného dungeon group-run modelu (M8.5-B) nad pglite
 * (bez Redisu — in-memory fronta). Čas řídíme fake timers → deterministický
 * reveal předpočítaného combatu.
 */
describe('M8.5 flow: dungeons (group PVE run)', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let invRepo: InventoryRepository;
  let completedRepo: CompletedQuestRepository;
  let dungeons: DungeonService;

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
    completedRepo = new CompletedQuestRepository(db);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const invService = new InventoryService(charRepo, invRepo, new BuffRepository(db));
    dungeons = new DungeonService(
      charRepo,
      invService,
      invRepo,
      makeGrant(db, invRepo),
      new PushService(new PushRepository(db)),
      new RaidRepository(db),
      new LockoutRepository(db),
      new ReputationRepository(db),
      new RotationService(charRepo, new LevelUpRepository(db), new RotationRepository(db), invService),
      completedRepo,
      new HistoryRepository(db),
      new BestiaryService(charRepo, new BestiaryRepository(db), null as never),
      new InMemoryRaidQueue(),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function newCharacter(username: string, name: string): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'half_orc', class: 'fighter' });
    // M9/M12: dungeony mají attunement questline → splň všechny pro testovací postavy
    // (gating dungeonů v těchto testech je vždy levelem, ne attunementem).
    for (const q of [
      'ho_ragefire_attunement',
      'ho_dm_attune_2', 'ho_wc_attune_2', 'ho_sfk_attune_2', 'ho_bfd_attune_2', 'ho_sm_attune_2',
      'ho_zf_attunement', 'ho_mar_attunement', 'ho_brd_attunement', 'ho_culling_stratholme',
    ]) {
      await completedRepo.markCompleted(char.id, q);
    }
    return { accountId, id: char.id };
  }

  /** Silná postava: vysoký level + zbraň → deterministicky vyčistí ragefire solo. */
  async function strongCharacter(username: string, name: string): Promise<{ accountId: string; id: string }> {
    const c = await newCharacter(username, name);
    await charRepo.addRewards(c.id, 50_000_000, 0); // cap level
    await invRepo.addItem(c.id, 'crusader_blade');
    await invRepo.equip(c.id, 'main_hand', 'crusader_blade');
    return c;
  }

  it('listDungeons: lvl 1 vidí ragefire zamčený, vysoký lvl odemčený; sizes 1/3/5', async () => {
    const low = await newCharacter('d1', 'Lowbie');
    const list = await dungeons.listDungeons(low.accountId, low.id);
    const rfc = list.find((d) => d.id === 'ragefire_chasm');
    expect(rfc?.unlocked).toBe(false);
    expect(rfc?.bossName).toBe('Tarrakal the Hungerer');
    expect(rfc?.sizes).toEqual([1, 3, 5]);

    const high = await strongCharacter('d2', 'Bigboss');
    const list2 = await dungeons.listDungeons(high.accountId, high.id);
    expect(list2.find((d) => d.id === 'ragefire_chasm')?.unlocked).toBe(true);
    expect(list2.find((d) => d.id === 'scarlet_monastery')?.unlocked).toBe(true);
  });

  it('vstup do zamčeného / neznámého dungeonu selže', async () => {
    const low = await newCharacter('d3', 'Tooweak');
    await expect(dungeons.enter(low.accountId, low.id, 'ragefire_chasm')).rejects.toThrow();
    const c = await strongCharacter('d4', 'Hero');
    await expect(dungeons.enter(c.accountId, c.id, 'nonexistent')).rejects.toThrow();
  });

  it('SP enter založí run (party 1 dps), reveal odhalí výsledek dle času', async () => {
    const c = await strongCharacter('d5', 'Warlord');
    const run = await dungeons.enter(c.accountId, c.id, 'ragefire_chasm');
    expect(run.dungeonId).toBe('ragefire_chasm');
    expect(run.size).toBe(1);
    expect(run.party).toHaveLength(1);
    expect(run.party[0]!.role).toBe('dps');
    expect(run.victory).toBeNull(); // ještě neproběhlo
    expect(run.events.length).toBeGreaterThan(0); // alespoň encounter_start
    expect(run.encounters.at(-1)?.isBoss).toBe(true);

    vi.setSystemTime(T0 + (run.durationSec + 1) * 1000);
    const done = await dungeons.getRun(c.accountId, c.id, run.runId);
    expect(done.progress.completed).toBe(true);
    expect(done.victory).toBe(true);
    expect(done.events.at(-1)?.type).toBe('victory');

    // M9 retrofit: clear dá standing Explorers' Guild (deterministicky z úrovně dungeonu).
    expect(done.repGain).toBeGreaterThan(0);
    expect(done.repFactionName).toBeTruthy();
    const standings = await new ReputationRepository(db).listStandings(c.id);
    expect(standings.find((s) => s.factionId === 'explorers_guild')?.standing).toBe(done.repGain);
  });

  it('SP clear udělí personal loot + plné XP rovnou (žádný separátní claim)', async () => {
    const c = await strongCharacter('d7', 'Looter');
    const before = (await charRepo.findById(c.id))!.totalXp;
    const run = await dungeons.enter(c.accountId, c.id, 'ragefire_chasm');

    // Run se vyřeší okamžitě (reward udělen rovnou); `victory` v náhledu se
    // odhaluje dle času (jako raid), proto se kontroluje odměna, ne flag.
    expect(run.myReward!.xp).toBe(RFC.baseXp); // 0 wipů → plná odměna
    expect(run.myReward!.gold).toBeGreaterThan(0);

    const after = (await charRepo.findById(c.id))!.totalXp;
    expect(after).toBe(before + RFC.baseXp);

    // Personal loot (pokud padl) je v inventáři.
    const inv = await invRepo.listInventory(c.id);
    const lootCount = inv.reduce((s, r) => s + (r.itemId === 'crusader_blade' ? 0 : r.quantity), 0);
    expect(lootCount).toBe(run.myReward!.items.length);
  });

  it('group enter (size 3) bez fronty → party jen iniciátor (žádný NPC backfill)', async () => {
    const c = await strongCharacter('d6', 'Leader');
    const run = await dungeons.enter(c.accountId, c.id, 'ragefire_chasm', 3);
    // Backfill odebrán: nikdo další ve frontě → běží sám, žádní NPC.
    expect(run.party).toHaveLength(1);
    expect(run.myReward).not.toBeNull();
  });

  it('fronta: čekající hráč je vytažen do party iniciátora (žádný NPC fill)', async () => {
    const waiter = await strongCharacter('d9', 'Waiter');
    const leader = await strongCharacter('d10', 'Puller');
    const q = await dungeons.queueForDungeon(waiter.accountId, waiter.id, 'ragefire_chasm', 'healer');
    expect(q.queued).toBe(true);

    const run = await dungeons.enter(leader.accountId, leader.id, 'ragefire_chasm', 3);
    expect(run.party).toHaveLength(2); // leader + vytažený waiter, žádný NPC
    // Waiter dostal vlastní participant řádek (personal loot).
    const recent = await dungeons.recentRuns(waiter.accountId, waiter.id);
    expect(recent[0]?.runId).toBe(run.runId);
    expect(recent[0]?.role).toBe('healer');
  });

  it('nižší dungeon (ragefire) NEpodléhá weekly lockoutu → farmitelný opakovaně', async () => {
    const c = await strongCharacter('d11', 'Farmer');
    const first = await dungeons.enter(c.accountId, c.id, 'ragefire_chasm');
    expect(first.myReward!.xp).toBe(RFC.baseXp);
    expect(first.myLockedOut).toBe(false);
    const second = await dungeons.enter(c.accountId, c.id, 'ragefire_chasm');
    expect(second.myReward!.xp).toBe(RFC.baseXp); // pořád plná odměna
    expect(second.myLockedOut).toBe(false);
  });

  it('vyšší dungeon (scarlet) má weekly lockout: druhý clear nedá odměnu (M8.6)', async () => {
    // Silná postava se zbraní → solo vyčistí scarlet deterministicky.
    const c = await newCharacter('d12', 'Inquisitor');
    await charRepo.addRewards(c.id, 50_000_000, 0);
    await invRepo.addItem(c.id, 'ashkandi');
    await invRepo.equip(c.id, 'main_hand', 'ashkandi');

    // Před clearem: scarlet má lockout, ale postava ještě není saved.
    const listBefore = await dungeons.listDungeons(c.accountId, c.id);
    const scarletBefore = listBefore.find((d) => d.id === 'scarlet_monastery')!;
    expect(scarletBefore.hasLockout).toBe(true);
    expect(scarletBefore.lockedOut).toBe(false);
    // Ragefire lockout nemá → vždy false.
    expect(listBefore.find((d) => d.id === 'ragefire_chasm')!.hasLockout).toBe(false);

    const first = await dungeons.enter(c.accountId, c.id, 'scarlet_monastery');
    expect(first.myReward!.xp).toBeGreaterThan(0);
    expect(first.myLockedOut).toBe(false);
    const xpAfterFirst = (await charRepo.findById(c.id))!.totalXp;

    // Po clearu se v seznamu objeví „saved this week".
    const listAfter = await dungeons.listDungeons(c.accountId, c.id);
    expect(listAfter.find((d) => d.id === 'scarlet_monastery')!.lockedOut).toBe(true);

    const second = await dungeons.enter(c.accountId, c.id, 'scarlet_monastery');
    expect(second.myReward!.xp).toBe(0);
    expect(second.myReward!.items).toHaveLength(0);
    expect(second.myLockedOut).toBe(true);
    expect((await charRepo.findById(c.id))!.totalXp).toBe(xpAfterFirst);
  });

  it('cizí účet nemůže do dungeonu ani číst cizí run', async () => {
    const owner = await strongCharacter('d8a', 'Owner');
    const intruder = await newCharacter('d8b', 'Intruder');
    const run = await dungeons.enter(owner.accountId, owner.id, 'ragefire_chasm');
    await expect(dungeons.enter(intruder.accountId, owner.id, 'ragefire_chasm')).rejects.toThrow();
    await expect(dungeons.getRun(intruder.accountId, intruder.id, run.runId)).rejects.toThrow();
  });
});
