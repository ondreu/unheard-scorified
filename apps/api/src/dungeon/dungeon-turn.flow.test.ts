import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { DungeonTurnService, type DungeonTurnRunView } from './dungeon-turn.service';
import { DungeonTurnRepository } from './dungeon-turn.repository';

/**
 * Integrační test tahového (solo) dungeonu (dungeon overhaul Slice 2, ADR 0037)
 * nad pglite. Stav je perzistovaný JSON; tah po tahu přes service (jako Gauntlet).
 */
describe('Slice 2 flow: turn-based solo dungeon', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let invRepo: InventoryRepository;
  let completedRepo: CompletedQuestRepository;
  let turn: DungeonTurnService;

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
    const invService = new InventoryService(charRepo, invRepo, new BuffRepository(db));
    turn = new DungeonTurnService(
      charRepo,
      makeGrant(db, invRepo),
      new LockoutRepository(db),
      new ReputationRepository(db),
      completedRepo,
      new RotationService(charRepo, new LevelUpRepository(db), new RotationRepository(db), invService),
      new HistoryRepository(db),
      new DungeonTurnRepository(db),
    );
  });

  async function strongCharacter(username: string, name: string): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'half_orc', class: 'fighter' });
    await charRepo.addRewards(char.id, 50_000_000, 0); // cap level
    await invRepo.addItem(char.id, 'crusader_blade');
    await invRepo.equip(char.id, 'main_hand', 'crusader_blade');
    await completedRepo.markCompleted(char.id, 'ho_ragefire_attunement');
    return { accountId, id: char.id };
  }

  /** Pick první živý nepřítel. */
  function target(run: DungeonTurnRunView): number {
    const alive = run.enemies.find((e) => e.currentHealth > 0);
    return alive?.idx ?? 0;
  }

  /** Odehraje run základním útokem, dokud neskončí. */
  async function play(accountId: string, id: string, runId: string): Promise<DungeonTurnRunView> {
    let run = await turn.getRun(accountId, id, runId);
    let guard = 0;
    while (run.status === 'in_combat' && guard++ < 3000) {
      run = await turn.act(accountId, id, runId, 'basic_attack', target(run));
    }
    return run;
  }

  it('enter založí tahový run (encounter 0, nepřátelé, plné HP)', async () => {
    const c = await strongCharacter('t1', 'Tactician');
    const run = await turn.enter(c.accountId, c.id, 'ragefire_chasm');
    expect(run.dungeonId).toBe('ragefire_chasm');
    expect(run.status).toBe('in_combat');
    expect(run.encounterIndex).toBe(0);
    expect(run.encounterCount).toBeGreaterThan(0);
    expect(run.enemies.length).toBeGreaterThan(0);
    expect(run.player.currentHealth).toBe(run.player.maxHealth);
    expect(run.abilities.some((a) => a.id === 'basic_attack')).toBe(true);
  });

  it('jen jeden aktivní run; druhý enter selže', async () => {
    const c = await strongCharacter('t2', 'Solo');
    await turn.enter(c.accountId, c.id, 'ragefire_chasm');
    await expect(turn.enter(c.accountId, c.id, 'ragefire_chasm')).rejects.toThrow();
  });

  it('vstup do zamčeného/neznámého dungeonu selže', async () => {
    const c = await strongCharacter('t3', 'Picky');
    await expect(turn.enter(c.accountId, c.id, 'stratholme')).rejects.toThrow(); // bez attunementu/levelu? capped lvl ale bez attune
    await expect(turn.enter(c.accountId, c.id, 'nonexistent')).rejects.toThrow();
  });

  it('silná postava vyčistí dungeon tah po tahu → odměna + reputace', async () => {
    const c = await strongCharacter('t4', 'Clearer');
    const before = (await charRepo.findById(c.id))!.totalXp;
    const started = await turn.enter(c.accountId, c.id, 'ragefire_chasm');
    const done = await play(c.accountId, c.id, started.runId);

    expect(done.status).toBe('cleared');
    expect(done.encountersCleared).toBe(done.encounterCount);
    expect(done.reward!.xp).toBe(DUNGEONS_RFC_XP);
    const after = (await charRepo.findById(c.id))!.totalXp;
    expect(after).toBe(before + DUNGEONS_RFC_XP);
    // Reputace Explorers' Guild za clear.
    const standings = await new ReputationRepository(db).listStandings(c.id);
    expect(standings.find((s) => s.factionId === 'explorers_guild')?.standing).toBeGreaterThan(0);
  });

  it('abandon ukončí run bez odměny', async () => {
    const c = await strongCharacter('t5', 'Quitter');
    const before = (await charRepo.findById(c.id))!.totalXp;
    const started = await turn.enter(c.accountId, c.id, 'ragefire_chasm');
    const done = await turn.abandon(c.accountId, c.id, started.runId);
    expect(done.status).toBe('dead');
    expect(done.reward!.xp).toBe(0);
    expect((await charRepo.findById(c.id))!.totalXp).toBe(before);
    // Po abandonu lze začít znovu.
    await expect(turn.enter(c.accountId, c.id, 'ragefire_chasm')).resolves.toBeTruthy();
  });

  it('cizí účet nemůže číst/hrát cizí run', async () => {
    const owner = await strongCharacter('t6a', 'Owner');
    const intruder = await strongCharacter('t6b', 'Intruder');
    const run = await turn.enter(owner.accountId, owner.id, 'ragefire_chasm');
    await expect(turn.getRun(intruder.accountId, intruder.id, run.runId)).rejects.toThrow();
    await expect(turn.act(intruder.accountId, intruder.id, run.runId, 'basic_attack', 0)).rejects.toThrow();
  });
});

// RFC baseXp (z @game/shared) — drží se v jednom místě pro čitelnost testu.
const DUNGEONS_RFC_XP = 320;
