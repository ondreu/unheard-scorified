import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyPeriodId, GAUNTLET_BASIC_ATTACK } from '@game/shared';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import { makeGrant } from '../inventory/test-grant';
import { BuffRepository } from '../buff/buff.repository';
import { LevelUpRepository } from '../levelup/levelup.repository';
import { RotationService } from '../rotation/rotation.service';
import { RotationRepository } from '../rotation/rotation.repository';
import { HistoryRepository } from '../history/history.repository';
import { GauntletRepository } from './gauntlet.repository';
import { GauntletService, type GauntletRunView } from './gauntlet.service';

/**
 * Integrační test minihry The Gauntlet (M13) nad pglite. Stateful tahový boj —
 * žádný reveal podle času, vše řídí volby (act/draft). Čas fixujeme jen kvůli
 * stabilnímu `dailyPeriodId` (denní strop).
 */
describe('M13 flow: The Gauntlet', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let invRepo: InventoryRepository;
  let repo: GauntletRepository;
  let gauntlet: GauntletService;

  const T0 = Date.UTC(2026, 5, 17, 12, 0, 0);

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    invRepo = new InventoryRepository(db);
    repo = new GauntletRepository(db);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const invService = new InventoryService(charRepo, invRepo, new BuffRepository(db));
    const rotation = new RotationService(
      charRepo,
      new LevelUpRepository(db),
      new RotationRepository(db),
      invService,
    );
    gauntlet = new GauntletService(
      charRepo,
      invService,
      makeGrant(db, invRepo),
      rotation,
      new HistoryRepository(db),
      repo,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function newCharacter(
    username: string,
    name: string,
    { strong = false }: { strong?: boolean } = {},
  ): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'half_orc', class: 'fighter' });
    if (strong) {
      await charRepo.addRewards(char.id, 50_000_000, 0); // cap level
      await invRepo.addItem(char.id, 'crusader_blade');
      await invRepo.equip(char.id, 'main_hand', 'crusader_blade');
    }
    return { accountId, id: char.id };
  }

  /** Odehraje aktuální vlnu základním úderem, dokud neskončí boj. */
  async function fightCurrentWave(
    acc: string,
    id: string,
    runId: string,
  ): Promise<GauntletRunView> {
    let view = await gauntlet.getRun(acc, id, runId);
    for (let i = 0; i < 500 && view.status === 'in_combat'; i++) {
      view = await gauntlet.act(acc, id, runId, GAUNTLET_BASIC_ATTACK.id);
    }
    return view;
  }

  it('enter založí run s vlnou 1, nepřítelem a základním úderem v kitu', async () => {
    const c = await newCharacter('g1', 'Brawler', { strong: true });
    const run = await gauntlet.enter(c.accountId, c.id);
    expect(run.status).toBe('in_combat');
    expect(run.wave).toBe(1);
    expect(run.enemy).not.toBeNull();
    expect(run.player.currentHealth).toBe(run.player.maxHealth);
    expect(run.abilities.some((a) => a.id === GAUNTLET_BASIC_ATTACK.id)).toBe(true);
    expect(run.daily.xpCap).toBeGreaterThan(0);
  });

  it('act vyčistí vlnu → drafting se 3 nabídkami; draft posune na vlnu 2', async () => {
    const c = await newCharacter('g2', 'Champion', { strong: true });
    const run = await gauntlet.enter(c.accountId, c.id);
    const cleared = await fightCurrentWave(c.accountId, c.id, run.runId);
    expect(cleared.status).toBe('drafting');
    expect(cleared.wavesCleared).toBe(1);
    expect(cleared.draft).not.toBeNull();
    expect(cleared.draft!.length).toBe(3);

    const picked = await gauntlet.draft(c.accountId, c.id, run.runId, cleared.draft![0]!.id);
    expect(picked.wave).toBe(2);
    expect(picked.status).toBe('in_combat');
  });

  it('retire zinkasuje odměnu za vyčištěné vlny + zapíše denní strop', async () => {
    const c = await newCharacter('g3', 'Retiree', { strong: true });
    const run = await gauntlet.enter(c.accountId, c.id);
    await fightCurrentWave(c.accountId, c.id, run.runId); // alespoň 1 vlna

    const before = (await charRepo.findById(c.id))!.totalXp;
    const ended = await gauntlet.retire(c.accountId, c.id, run.runId);
    expect(ended.status).toBe('retired');
    expect(ended.reward).not.toBeNull();
    expect(ended.reward!.xp).toBeGreaterThan(0);

    const after = (await charRepo.findById(c.id))!.totalXp;
    expect(after).toBe(before + ended.reward!.xp);

    const daily = await repo.getDaily(c.id, dailyPeriodId(T0));
    expect(daily.xpEarned).toBe(ended.reward!.xp);

    // Run už není aktivní → lze vstoupit znovu.
    const status = await gauntlet.getStatus(c.accountId, c.id);
    expect(status.activeRunId).toBeNull();
  });

  it('denní strop ořízne odměnu na nulu, když je vyčerpán', async () => {
    const c = await newCharacter('g4', 'Capped', { strong: true });
    const status = await gauntlet.getStatus(c.accountId, c.id);
    // Vyčerpej denní strop dopředu.
    await repo.addDaily(c.id, dailyPeriodId(T0), status.daily.xpCap, status.daily.goldCap);

    const run = await gauntlet.enter(c.accountId, c.id);
    await fightCurrentWave(c.accountId, c.id, run.runId);
    const before = (await charRepo.findById(c.id))!.totalXp;
    const ended = await gauntlet.retire(c.accountId, c.id, run.runId);
    expect(ended.reward).toEqual({ xp: 0, gold: 0, items: [] });
    expect((await charRepo.findById(c.id))!.totalXp).toBe(before);
  });

  it('nelze mít dva aktivní runy zároveň', async () => {
    const c = await newCharacter('g5', 'Doubler', { strong: true });
    await gauntlet.enter(c.accountId, c.id);
    await expect(gauntlet.enter(c.accountId, c.id)).rejects.toThrow();
  });

  it('cizí účet nemůže číst ani ovládat cizí run', async () => {
    const owner = await newCharacter('g6', 'Owner', { strong: true });
    const intruder = await newCharacter('g7', 'Intruder');
    const run = await gauntlet.enter(owner.accountId, owner.id);
    await expect(gauntlet.getRun(intruder.accountId, intruder.id, run.runId)).rejects.toThrow();
    await expect(
      gauntlet.act(intruder.accountId, intruder.id, run.runId, GAUNTLET_BASIC_ATTACK.id),
    ).rejects.toThrow();
  });

  it('celý run dojede do terminálního stavu a udělí (capovanou) odměnu', async () => {
    const c = await newCharacter('g8', 'Gladiator', { strong: true });
    const run = await gauntlet.enter(c.accountId, c.id);
    let view = await gauntlet.getRun(c.accountId, c.id, run.runId);
    for (let i = 0; i < 4000 && (view.status === 'in_combat' || view.status === 'drafting'); i++) {
      if (view.status === 'drafting') {
        view = await gauntlet.draft(c.accountId, c.id, run.runId, view.draft![0]!.id);
      } else {
        view = await gauntlet.act(c.accountId, c.id, run.runId, GAUNTLET_BASIC_ATTACK.id);
      }
    }
    expect(['dead', 'retired']).toContain(view.status);
    expect(view.reward).not.toBeNull();
    expect(view.wavesCleared).toBeGreaterThan(0);
    const status = await gauntlet.getStatus(c.accountId, c.id);
    expect(status.activeRunId).toBeNull();
    expect(status.bestWave).toBe(view.wavesCleared);
  });
});
