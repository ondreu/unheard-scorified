import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RAIDS } from '@game/shared';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import { LockoutRepository } from '../lockout/lockout.repository';
import { TalentRepository } from '../talent/talent.repository';
import { CompletedQuestRepository } from '../quest/quest.repository';
import { PushRepository } from '../push/push.repository';
import { PushService } from '../push/push.service';
import { RaidRepository } from './raid.repository';
import { RaidEventsRelay } from './raid.events';
import { RaidService } from './raid.service';
import { InMemoryRaidQueue } from './raid.matchmaking';

/**
 * Integrační test M8 raidů nad pglite (bez Redisu — in-memory fronta, relay bez
 * WS serveru = no-op). Čas řídíme fake timers (deterministický reveal).
 */
describe('M8 flow: raids (MP PVE)', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let completed: CompletedQuestRepository;
  let raid: RaidService;

  const T0 = Date.UTC(2026, 5, 14, 12, 0, 0);

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    completed = new CompletedQuestRepository(db);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const invRepo = new InventoryRepository(db);
    const invService = new InventoryService(charRepo, invRepo);
    raid = new RaidService(
      charRepo,
      invService,
      invRepo,
      new TalentRepository(db),
      completed,
      new PushService(new PushRepository(db)),
      new RaidRepository(db),
      new RaidEventsRelay(),
      new LockoutRepository(db),
      new InMemoryRaidQueue(),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Postava na cap levelu; volitelně attuned (dokončený attunement quest). */
  async function raider(
    username: string,
    name: string,
    opts: { attune?: string; weapon?: string } = {},
  ): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'orc', class: 'warrior' });
    await charRepo.addRewards(char.id, 50_000_000, 0); // cap level
    if (opts.attune) await completed.markCompleted(char.id, opts.attune);
    if (opts.weapon) {
      const invRepo = new InventoryRepository(db);
      await invRepo.addItem(char.id, opts.weapon);
      await invRepo.equip(char.id, 'main_hand', opts.weapon);
    }
    return { accountId, id: char.id };
  }

  it('raid bez attunementu je zamčený a enter selže', async () => {
    const a = await raider('rd_lock', 'Lockedout');
    const list = await raid.listRaids(a.accountId, a.id);
    expect(list.find((r) => r.id === 'molten_core')?.unlocked).toBe(false);
    await expect(raid.enter(a.accountId, a.id, 'molten_core', 'dps')).rejects.toThrow();
  });

  it('attuned hráč spustí raid sólo (jen on sám, žádný NPC backfill) a dostane odměnu', async () => {
    const a = await raider('rd_solo', 'Soloist', { attune: 'tn_galak_ogres', weapon: 'ashkandi' });
    const list = await raid.listRaids(a.accountId, a.id);
    expect(list.find((r) => r.id === 'molten_core')?.unlocked).toBe(true);

    const run = await raid.enter(a.accountId, a.id, 'molten_core', 'dps');
    // Backfill odebrán: nikdo ve frontě → party = jen reálný hráč (boss se
    // škáluje velikostí party). Žádní NPC.
    expect(run.party).toHaveLength(1);
    expect(run.myRole).toBe('dps');
    expect(run.myReward).not.toBeNull();
    expect(run.myReward!.xp).toBeGreaterThan(0);

    const recent = await raid.recentRuns(a.accountId, a.id);
    expect(recent).toHaveLength(1);
    expect(recent[0]!.runId).toBe(run.runId);
  });

  it('weekly lockout: druhý clear v témže týdnu nedá odměnu (M8.6)', async () => {
    const a = await raider('rd_lock2', 'Lockme', { attune: 'tn_galak_ogres', weapon: 'ashkandi' });

    const first = await raid.enter(a.accountId, a.id, 'molten_core', 'dps');
    expect(first.myReward!.xp).toBeGreaterThan(0); // první clear → plná odměna
    expect(first.myLockedOut).toBe(false);
    const xpAfterFirst = (await charRepo.findById(a.id))!.totalXp;

    // Druhý vstup do stejného raidu týž týden (čas zamrzlý) → lockout.
    const second = await raid.enter(a.accountId, a.id, 'molten_core', 'dps');
    expect(second.myReward!.xp).toBe(0);
    expect(second.myReward!.gold).toBe(0);
    expect(second.myReward!.items).toHaveLength(0);
    expect(second.myLockedOut).toBe(true);
    // Žádné XP/gold/loot navíc.
    expect((await charRepo.findById(a.id))!.totalXp).toBe(xpAfterFirst);

    // getRun perspektiva také hlásí lockout.
    vi.setSystemTime(T0 + (second.durationSec + 1) * 1000);
    const replay = await raid.getRun(a.accountId, a.id, second.runId);
    expect(replay.victory).toBe(true);
    expect(replay.myLockedOut).toBe(true);
  });

  it('weekly lockout se resetuje dalším UTC týdnem (M8.6)', async () => {
    const a = await raider('rd_lock3', 'Weeklyreset', { attune: 'tn_galak_ogres', weapon: 'ashkandi' });

    const first = await raid.enter(a.accountId, a.id, 'molten_core', 'dps');
    expect(first.myReward!.xp).toBeGreaterThan(0);

    // Posuň čas o týden dopředu → nový lockout týden → odměna zase plná.
    vi.setSystemTime(T0 + 7 * 24 * 3600 * 1000);
    const nextWeek = await raid.enter(a.accountId, a.id, 'molten_core', 'dps');
    expect(nextWeek.myReward!.xp).toBeGreaterThan(0);
    expect(nextWeek.myLockedOut).toBe(false);
  });

  it('reveal odhaluje combat log podle času, výsledek po dokončení', async () => {
    const a = await raider('rd_watch', 'Watcher', { attune: 'tn_galak_ogres', weapon: 'ashkandi' });
    const run = await raid.enter(a.accountId, a.id, 'molten_core', 'tank');
    expect(run.victory).toBeNull();
    expect(run.events.length).toBeGreaterThan(0); // alespoň encounter_start

    vi.setSystemTime(T0 + (run.durationSec + 1) * 1000);
    const done = await raid.getRun(a.accountId, a.id, run.runId);
    expect(done.progress.completed).toBe(true);
    expect(typeof done.victory).toBe('boolean');
    expect(['victory', 'defeat']).toContain(done.events.at(-1)?.type);

    // Odměna odpovídá výsledku (M8.5-A): clear dává XP škálované wipy
    // (≤ baseXp, > 0), hard fail = nula (žádná útěcha).
    const raidDef = RAIDS.molten_core!;
    if (done.victory) {
      expect(done.myReward!.xp).toBeGreaterThan(0);
      expect(done.myReward!.xp).toBeLessThanOrEqual(raidDef.baseXp);
    } else {
      expect(done.myReward!.xp).toBe(0);
    }
  });

  it('iniciátor vytáhne čekajícího hráče z fronty do své party', async () => {
    const a = await raider('rd_init', 'Initiator', { attune: 'tn_galak_ogres' });
    const b = await raider('rd_pulled', 'Pulled', { attune: 'tn_galak_ogres' });

    const q = await raid.queueForRaid(b.accountId, b.id, 'molten_core', 'tank');
    expect(q.queued).toBe(true);
    expect((await raid.listRaids(b.accountId, b.id)).find((r) => r.id === 'molten_core')?.queuedRole).toBe('tank');

    const run = await raid.enter(a.accountId, a.id, 'molten_core', 'dps');
    // B (tank) byl vytažen → party = A (dps) + B (tank), žádní NPC.
    expect(run.party).toHaveLength(2);

    // B už nečeká ve frontě a má run ve své historii.
    expect((await raid.listRaids(b.accountId, b.id)).find((r) => r.id === 'molten_core')?.queuedRole).toBeNull();
    const recentB = await raid.recentRuns(b.accountId, b.id);
    expect(recentB).toHaveLength(1);
    expect(recentB[0]!.runId).toBe(run.runId);
    expect(recentB[0]!.role).toBe('tank');
  });

  it('leaveQueue vyřadí čekající postavu', async () => {
    const a = await raider('rd_leave', 'Leaver', { attune: 'tn_galak_ogres' });
    await raid.queueForRaid(a.accountId, a.id, 'molten_core', 'healer');
    const res = await raid.leaveQueue(a.accountId, a.id, 'molten_core');
    expect(res.left).toBe(true);
    expect((await raid.listRaids(a.accountId, a.id)).find((r) => r.id === 'molten_core')?.queuedRole).toBeNull();
  });

  it('cizí postava nemůže číst raid run', async () => {
    const a = await raider('rd_owner', 'Ownerz', { attune: 'tn_galak_ogres' });
    const run = await raid.enter(a.accountId, a.id, 'molten_core', 'dps');
    const intruder = await raider('rd_snoop', 'Snooperz', { attune: 'tn_galak_ogres' });
    await expect(raid.getRun(intruder.accountId, intruder.id, run.runId)).rejects.toThrow();
  });

  it('neplatná role je odmítnuta', async () => {
    const a = await raider('rd_role', 'Roler', { attune: 'tn_galak_ogres' });
    await expect(raid.enter(a.accountId, a.id, 'molten_core', 'bard')).rejects.toThrow();
  });

  it('10-player raid bez fronty → party jen iniciátor (žádný NPC backfill)', async () => {
    const a = await raider('rd_ten', 'Tenman', { attune: 'tn_galak_ogres', weapon: 'ashkandi' });
    const run = await raid.enter(a.accountId, a.id, 'molten_core', 'tank', 10, {
      tank: 2,
      healer: 3,
      dps: 5,
    });
    // Kompozice je jen cíl; bez čekajících hráčů běží sám (žádní NPC).
    expect(run.party).toHaveLength(1);
    expect(run.party[0]!.role).toBe('tank');
  });

  it('odmítne nepovolenou velikost a nesedící kompozici', async () => {
    const a = await raider('rd_bad', 'Badcomp', { attune: 'tn_galak_ogres' });
    await completed.markCompleted(a.id, 'al_drakefire_attunement'); // attune i pro BWL
    // 7 není povolená velikost molten_core.
    await expect(raid.enter(a.accountId, a.id, 'molten_core', 'dps', 7)).rejects.toThrow();
    // Kompozice nesedí na velikost 10.
    await expect(
      raid.enter(a.accountId, a.id, 'molten_core', 'dps', 10, { tank: 1, healer: 1, dps: 3 }),
    ).rejects.toThrow();
    // Blackwing Lair nepodporuje velikost 5 (přitom je attuned → padne na velikosti).
    await expect(raid.enter(a.accountId, a.id, 'blackwing_lair', 'dps', 5)).rejects.toThrow();
  });
});
