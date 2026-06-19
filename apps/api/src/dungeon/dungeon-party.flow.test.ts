import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
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
import { GroupRepository } from '../group/group.repository';
import { DungeonPartyService, type DungeonPartyRunView } from './dungeon-party.service';
import { DungeonPartyRepository } from './dungeon-party.repository';
import { DungeonPartyEventsRelay } from './dungeon-party.events';
import { NoopDungeonPartyScheduler } from './dungeon-party.scheduler';
import type { RaidRole } from '@game/shared';

/**
 * Integrační test živého MP tahového dungeonu (ADR 0038, Slice 4b) nad pglite.
 * Party reálných hráčů, každý posílá svou akci; kolo se vyhodnotí, až odešlou
 * všichni živí (nebo deadline → AI fallback).
 */
describe('Slice 4 flow: živé MP tahové dungeon sezení', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let invRepo: InventoryRepository;
  let completedRepo: CompletedQuestRepository;
  let groupRepo: GroupRepository;
  let party: DungeonPartyService;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    invRepo = new InventoryRepository(db);
    completedRepo = new CompletedQuestRepository(db);
    groupRepo = new GroupRepository(db);
  });

  beforeEach(() => {
    const invService = new InventoryService(charRepo, invRepo, new BuffRepository(db));
    party = new DungeonPartyService(
      charRepo,
      groupRepo,
      makeGrant(db, invRepo),
      new LockoutRepository(db),
      new ReputationRepository(db),
      completedRepo,
      new RotationService(charRepo, new LevelUpRepository(db), new RotationRepository(db), invService),
      new HistoryRepository(db),
      new DungeonPartyRepository(db),
      new DungeonPartyEventsRelay(),
      new NoopDungeonPartyScheduler(),
    );
  });

  /** Náhodný alfa suffix (jména postav musí být globálně unikátní). */
  function suffix(): string {
    return Array.from({ length: 5 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
  }

  async function hero(username: string, name: string): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'half_orc', class: 'fighter' });
    await charRepo.addRewards(char.id, 50_000_000, 0); // cap level
    await invRepo.addItem(char.id, 'crusader_blade');
    await invRepo.equip(char.id, 'main_hand', 'crusader_blade');
    await completedRepo.markCompleted(char.id, 'ho_ragefire_attunement');
    return { accountId, id: char.id };
  }

  /** Sestaví 3-člennou party (leader tank + healer + dps), všichni joined. */
  async function makeParty(): Promise<{ leader: { accountId: string; id: string }; ids: string[]; accounts: string[] }> {
    const leader = await hero(`l${suffix()}`, `Lead${suffix()}`);
    const h2 = await hero(`h${suffix()}`, `Mend${suffix()}`);
    const h3 = await hero(`d${suffix()}`, `Stab${suffix()}`);
    const group = await groupRepo.createGroup(leader.id);
    const roles: [string, RaidRole][] = [
      [leader.id, 'tank'],
      [h2.id, 'healer'],
      [h3.id, 'dps'],
    ];
    for (const [id, role] of roles) await groupRepo.addMember(group.id, id, role, 'joined');
    return { leader, ids: [leader.id, h2.id, h3.id], accounts: [leader.accountId, h2.accountId, h3.accountId] };
  }

  function aliveTarget(run: DungeonPartyRunView): number {
    return run.enemies.find((e) => e.currentHealth > 0)?.idx ?? 0;
  }

  it('leader spustí live run z party → 3 reální hráči, žádné AI', async () => {
    const p = await makeParty();
    const run = await party.launch(p.leader.accountId, p.leader.id, 'ragefire_chasm');
    expect(run.size).toBe(3);
    expect(run.members.length).toBe(3);
    expect(run.members.every((m) => !m.isAi)).toBe(true);
    expect(run.you?.role).toBe('tank');
    expect(run.status).toBe('in_combat');
  });

  it('jen leader smí spustit / jen členové smí číst', async () => {
    const p = await makeParty();
    // Ne-leader spustit nemůže.
    await expect(party.launch(p.accounts[1]!, p.ids[1]!, 'ragefire_chasm')).rejects.toThrow();
    const run = await party.launch(p.leader.accountId, p.leader.id, 'ragefire_chasm');
    const outsider = await hero('out1', 'Nosy');
    await expect(party.getRun(outsider.accountId, outsider.id, run.runId)).rejects.toThrow();
  });

  it('kolo se vyhodnotí až po akci všech živých; party vyčistí dungeon', async () => {
    const p = await makeParty();
    let run = await party.launch(p.leader.accountId, p.leader.id, 'ragefire_chasm');
    let guard = 0;
    while (run.status === 'in_combat' && guard++ < 4000) {
      // Každý živý člen pošle basic_attack na svého klienta.
      for (let i = 0; i < 3; i++) {
        const view = await party.getRun(p.accounts[i]!, p.ids[i]!, run.runId);
        if (view.status !== 'in_combat') break;
        if (view.you && view.you.currentHealth > 0 && !view.you.submitted) {
          run = await party.submit(p.accounts[i]!, p.ids[i]!, run.runId, 'basic_attack', aliveTarget(view));
        }
      }
    }
    expect(run.status).toBe('cleared');
    expect(run.encountersCleared).toBe(run.encounterCount);
  });

  it('AI fallback: prošlý deadline → kolo se vyhodnotí i bez akcí hráčů', async () => {
    const p = await makeParty();
    const launched = await party.launch(p.leader.accountId, p.leader.id, 'ragefire_chasm');
    const before = launched.enemies.reduce((n, e) => n + e.currentHealth, 0);
    // Simuluj vypršení deadlinu kola (nikdo nehraje).
    await db
      .update(schema.dungeonPartyRuns)
      .set({ roundDeadline: new Date(Date.now() - 1000) })
      .where(eq(schema.dungeonPartyRuns.id, launched.runId));
    // getRun dožene prošlé kolo (AI fallback za všechny).
    const after = await party.getRun(p.leader.accountId, p.leader.id, launched.runId);
    const afterHp = after.enemies.reduce((n, e) => n + e.currentHealth, 0);
    expect(afterHp).toBeLessThan(before); // AI fallback partu rozhýbal
    expect(after.events.some((e) => e.type === 'attack' || e.type === 'ability')).toBe(true);
  });

  it('reward: po clearu dostane každý účastník XP', async () => {
    const p = await makeParty();
    const before = await Promise.all(p.ids.map(async (id) => (await charRepo.findById(id))!.totalXp));
    let run = await party.launch(p.leader.accountId, p.leader.id, 'ragefire_chasm');
    let guard = 0;
    while (run.status === 'in_combat' && guard++ < 4000) {
      for (let i = 0; i < 3; i++) {
        const view = await party.getRun(p.accounts[i]!, p.ids[i]!, run.runId);
        if (view.status !== 'in_combat') break;
        if (view.you && view.you.currentHealth > 0 && !view.you.submitted) {
          run = await party.submit(p.accounts[i]!, p.ids[i]!, run.runId, 'basic_attack', aliveTarget(view));
        }
      }
    }
    expect(run.status).toBe('cleared');
    const after = await Promise.all(p.ids.map(async (id) => (await charRepo.findById(id))!.totalXp));
    for (let i = 0; i < 3; i++) expect(after[i]!).toBeGreaterThan(before[i]!);
  });
});
