import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import { BuffRepository } from '../buff/buff.repository';
import { LevelUpRepository } from '../levelup/levelup.repository';
import { RotationService } from '../rotation/rotation.service';
import { RotationRepository } from '../rotation/rotation.repository';
import { HistoryRepository } from '../history/history.repository';
import { PushRepository } from '../push/push.repository';
import { PushService } from '../push/push.service';
import { ArenaRepository } from './arena.repository';
import { ArenaEventsRelay } from './arena.events';
import { ArenaService } from './arena.service';
import { InMemoryMatchmakingQueue } from './arena.matchmaking';
import { InMemoryArenaLeaderboard } from './arena.leaderboard';

/**
 * Integrační test M7 arény nad pglite (bez Redisu — in-memory fronta + žebříček,
 * relay bez WS serveru = no-op). Čas řídíme fake timers (deterministický reveal).
 */
describe('M7 flow: arena PVP', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let arena: ArenaService;
  let arenaRepo: ArenaRepository;

  // T0 spadá do season-1 (2026-01-01 .. 2026-07-01).
  const T0 = Date.UTC(2026, 5, 14, 12, 0, 0);

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    arenaRepo = new ArenaRepository(db);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    // Čerstvá fronta + žebříček pro každý test (in-memory stav neteče mezi testy).
    const invService = new InventoryService(charRepo, new InventoryRepository(db), new BuffRepository(db));
    const levelup = new LevelUpRepository(db);
    const push = new PushService(new PushRepository(db));
    arena = new ArenaService(
      charRepo,
      invService,
      arenaRepo,
      push,
      new ArenaEventsRelay(),
      new RotationService(charRepo, levelup, new RotationRepository(db), invService),
      new HistoryRepository(db),
      new InMemoryMatchmakingQueue(),
      new InMemoryArenaLeaderboard(),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Postava na max levelu (cap), volitelně se zbraní. */
  async function fighter(
    username: string,
    name: string,
    weapon?: string,
  ): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'half_orc', class: 'fighter' });
    await charRepo.addRewards(char.id, 10_000_000, 0); // vysoký level → eligible
    if (weapon) {
      const invRepo = new InventoryRepository(db);
      await invRepo.addItem(char.id, weapon);
      await invRepo.equip(char.id, 'main_hand', weapon);
    }
    return { accountId, id: char.id };
  }

  it('lvl pod minimem nemůže do arény', async () => {
    const tokens = await auth.register('lowbie', 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name: 'Tinyrunt', race: 'half_orc', class: 'fighter' });
    await expect(arena.queue(accountId, char.id)).rejects.toThrow();
  });

  it('první hráč jde do fronty, druhý se okamžitě spáruje', async () => {
    const a = await fighter('ar_a1', 'Queuer');
    const b = await fighter('ar_b1', 'Challenger', 'crusader_blade');

    const first = await arena.queue(a.accountId, a.id);
    expect(first.status).toBe('queued');
    expect(first.matchId).toBeUndefined();
    expect(first.arena.queued).toBe(true);
    expect(first.arena.rating).toBe(1500);

    const second = await arena.queue(b.accountId, b.id);
    expect(second.status).toBe('matched');
    expect(second.matchId).toBeDefined();
    // Po spárování už nikdo nečeká ve frontě.
    expect(second.arena.queued).toBe(false);
  });

  it('zápas je zero-sum a zapíše W/L oběma stranám', async () => {
    const a = await fighter('ar_a2', 'Aaron');
    const b = await fighter('ar_b2', 'Bram', 'crusader_blade');
    await arena.queue(a.accountId, a.id);
    const matched = await arena.queue(b.accountId, b.id);

    const viewA = await arena.getArena(a.accountId, a.id);
    const viewB = await arena.getArena(b.accountId, b.id);

    // Rovný start (1500/1500) → vítěz 1516, poražený 1484 (Elo K=32).
    expect(viewA.rating + viewB.rating).toBe(3000);
    expect([viewA.rating, viewB.rating].sort()).toEqual([1484, 1516]);
    expect(viewA.wins + viewB.wins).toBe(1);
    expect(viewA.losses + viewB.losses).toBe(1);

    // Detail zápasu z perspektivy B; po uplynutí času výsledek.
    const before = await arena.getMatch(b.accountId, b.id, matched.matchId!);
    expect(before.me.name).toBe('Bram');
    expect(before.opponent.name).toBe('Aaron');
    expect(before.outcome).toBeNull();
    expect(before.events.length).toBeGreaterThan(0); // alespoň encounter_start

    vi.setSystemTime(T0 + (before.durationSec + 1) * 1000);
    const after = await arena.getMatch(b.accountId, b.id, matched.matchId!);
    expect(after.progress.completed).toBe(true);
    expect(['win', 'loss']).toContain(after.outcome);
    // Vítěz má kladnou deltu, poražený zápornou.
    expect(after.outcome === 'win' ? after.ratingDelta > 0 : after.ratingDelta < 0).toBe(true);
    expect(after.events.at(-1)?.type).toBe('victory');
  });

  it('žebříček řadí dle ratingu a vrací rank', async () => {
    const a = await fighter('ar_a3', 'Laddera');
    const b = await fighter('ar_b3', 'Ladderb', 'crusader_blade');
    await arena.queue(a.accountId, a.id);
    await arena.queue(b.accountId, b.id);

    const view = await arena.getArena(a.accountId, a.id);
    expect(view.leaderboard.length).toBe(2);
    expect(view.leaderboard[0]!.rank).toBe(1);
    expect(view.leaderboard[0]!.rating).toBe(1516);
    expect(view.leaderboard[1]!.rating).toBe(1484);
    // Self flag i rank dávají smysl.
    const selfRow = view.leaderboard.find((r) => r.isSelf);
    expect(selfRow).toBeDefined();
    expect(view.rank).toBe(view.leaderboard.findIndex((r) => r.isSelf) + 1);
  });

  it('leaveQueue vyřadí čekající postavu', async () => {
    const a = await fighter('ar_a4', 'Waiter');
    await arena.queue(a.accountId, a.id);
    expect((await arena.getArena(a.accountId, a.id)).queued).toBe(true);

    const res = await arena.leaveQueue(a.accountId, a.id);
    expect(res.left).toBe(true);
    expect((await arena.getArena(a.accountId, a.id)).queued).toBe(false);
  });

  it('cizí účet nemůže číst zápas ani arénu', async () => {
    const a = await fighter('ar_a5', 'Ownerus');
    const b = await fighter('ar_b5', 'Rivalus', 'crusader_blade');
    await arena.queue(a.accountId, a.id);
    const matched = await arena.queue(b.accountId, b.id);
    const intruder = await fighter('ar_c5', 'Snoopus');

    // Cizí postava není účastník → Forbidden.
    await expect(arena.getMatch(intruder.accountId, intruder.id, matched.matchId!)).rejects.toThrow();
    // Cizí účet na cizí postavu → NotFound (findOwned).
    await expect(arena.getArena(intruder.accountId, a.id)).rejects.toThrow();
  });

  it('lazy sezónní rollover udělí odměnu za minulou sezónu', async () => {
    const a = await fighter('ar_a6', 'Veteran');
    // Simuluj rating z předchozí (uzavřené) sezóny → Rival (1700, odměna 200 g).
    await arenaRepo.ensureRating(a.id, '1v1', 'season-0');
    await arenaRepo.recordResult(a.id, '1v1', 'season-0', 1700, true);

    const goldBefore = (await charRepo.findById(a.id))!.gold;
    const view = await arena.getArena(a.accountId, a.id);

    const reward = view.newSeasonRewards.find((r) => r.seasonId === 'season-0');
    expect(reward).toBeDefined();
    expect(reward!.rewardGold).toBe(200);
    expect(reward!.finalTier).toBe('Rival');

    const goldAfter = (await charRepo.findById(a.id))!.gold;
    expect(goldAfter - goldBefore).toBe(200);

    // Idempotence: druhý dotaz už odměnu neuděluje.
    const view2 = await arena.getArena(a.accountId, a.id);
    expect(view2.newSeasonRewards.find((r) => r.seasonId === 'season-0')).toBeUndefined();
    expect((await charRepo.findById(a.id))!.gold).toBe(goldAfter);
  });
});
