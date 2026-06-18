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
import { CompletedQuestRepository } from '../quest/quest.repository';
import { ProgressionRepository } from './progression.repository';
import { ProgressionService } from './progression.service';

/**
 * Integrační test M9 achievementů nad pglite (odvození z herního stavu + claim).
 */
describe('M9 flow: achievements', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let completed: CompletedQuestRepository;
  let progression: ProgressionService;
  let seq = 0;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    completed = new CompletedQuestRepository(db);
    progression = new ProgressionService(charRepo, new ProgressionRepository(db));
  });

  beforeEach(() => {
    seq += 1;
  });

  async function player(name: string): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(`pr_${name}_${seq}`, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'half_orc', class: 'fighter' });
    return { accountId, id: char.id };
  }

  it('nový hráč nemá splněný žádný level/gold achievement', async () => {
    const a = await player('Fresha');
    const view = await progression.getAchievements(a.accountId, a.id);
    expect(view.total).toBeGreaterThan(0);
    expect(view.achievements.find((x) => x.id === 'level_10')?.completed).toBe(false);
    expect(view.achievements.find((x) => x.id === 'level_10')?.claimable).toBe(false);
  });

  it('dosažení levelu zpřístupní achievement a claim přidá zlato', async () => {
    const a = await player('Levelera');
    await charRepo.addRewards(a.id, 10_000_000, 0); // > level 10

    let view = await progression.getAchievements(a.accountId, a.id);
    const lvl10 = view.achievements.find((x) => x.id === 'level_10')!;
    expect(lvl10.completed).toBe(true);
    expect(lvl10.claimable).toBe(true);

    const goldBefore = (await charRepo.findById(a.id))!.gold;
    const res = await progression.claim(a.accountId, a.id, 'level_10');
    expect(res.rewardGold).toBeGreaterThan(0);
    expect((await charRepo.findById(a.id))!.gold).toBe(goldBefore + res.rewardGold);

    // Podruhé už nelze.
    await expect(progression.claim(a.accountId, a.id, 'level_10')).rejects.toThrow();
    view = await progression.getAchievements(a.accountId, a.id);
    expect(view.achievements.find((x) => x.id === 'level_10')?.claimed).toBe(true);
    expect(view.achievements.find((x) => x.id === 'level_10')?.claimable).toBe(false);
  });

  it('nelze vyzvednout nesplněný achievement', async () => {
    const a = await player('Greedya');
    await expect(progression.claim(a.accountId, a.id, 'gold_5000')).rejects.toThrow();
  });

  it('questsCompleted metrika roste s dokončenými questy', async () => {
    const a = await player('Questera');
    for (let i = 0; i < 10; i++) await completed.markCompleted(a.id, `q_${i}`);
    const view = await progression.getAchievements(a.accountId, a.id);
    const q10 = view.achievements.find((x) => x.id === 'quests_10')!;
    expect(q10.value).toBe(10);
    expect(q10.completed).toBe(true);
  });

  it('cizí účet nemůže číst achievementy postavy', async () => {
    const a = await player('Ownera');
    const intruder = await player('Snoopa');
    await expect(progression.getAchievements(intruder.accountId, a.id)).rejects.toThrow();
  });

  it('denní cíl: 3 questy splní daily_quests_3 a claim přidá zlato', async () => {
    const a = await player('Dailya');
    for (let i = 0; i < 3; i++) await completed.markCompleted(a.id, `dq_${i}`);

    let goals = await progression.getGoals(a.accountId, a.id);
    const dq = goals.daily.find((g) => g.id === 'daily_quests_3')!;
    expect(dq.value).toBe(3);
    expect(dq.claimable).toBe(true);
    // Týdenní cíl 15 questů ještě splněný není.
    expect(goals.weekly.find((g) => g.id === 'weekly_quests_15')?.completed).toBe(false);

    const goldBefore = (await charRepo.findById(a.id))!.gold;
    const res = await progression.claimGoal(a.accountId, a.id, 'daily_quests_3');
    expect((await charRepo.findById(a.id))!.gold).toBe(goldBefore + res.rewardGold);

    // Druhý claim ve stejném období selže.
    await expect(progression.claimGoal(a.accountId, a.id, 'daily_quests_3')).rejects.toThrow();
    goals = await progression.getGoals(a.accountId, a.id);
    expect(goals.daily.find((g) => g.id === 'daily_quests_3')?.claimed).toBe(true);
  });

  it('nelze vyzvednout nesplněný cíl', async () => {
    const a = await player('Slackera');
    await expect(progression.claimGoal(a.accountId, a.id, 'weekly_raid_3')).rejects.toThrow();
  });
});
