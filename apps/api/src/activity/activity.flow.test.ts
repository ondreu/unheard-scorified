import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUESTS } from '@game/shared';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { CompletedQuestRepository } from '../quest/quest.repository';
import { QuestService } from '../quest/quest.service';
import { InventoryRepository } from '../inventory/inventory.repository';
import { ProfessionRepository, ReputationRepository } from '../profession/profession.repository';
import { ActivityRepository } from './activity.repository';
import { ActivityService } from './activity.service';
import { NoopActivityScheduler } from './activity.scheduler';

/**
 * Integrační test M2 idle smyčky nad in-memory Postgresem (pglite), bez Redisu
 * (NoopActivityScheduler). Čas řídíme přes fake timers → deterministický dopočet.
 */
describe('M2 flow: leveling & idle smyčka', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let quests: QuestService;
  let activity: ActivityService;

  const KOBOLD = QUESTS.ns_kobold_culling!;
  const WOLVES = QUESTS.ns_wolf_pelts!;
  const T0 = Date.UTC(2026, 5, 14, 12, 0, 0);

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    const completed = new CompletedQuestRepository(db);
    quests = new QuestService(charRepo, completed);
    activity = new ActivityService(
      charRepo,
      new ActivityRepository(db),
      completed,
      new InventoryRepository(db),
      new ProfessionRepository(db),
      new ReputationRepository(db),
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

  async function newCharacter(
    username: string,
    name: string,
  ): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'human', class: 'mage' });
    return { accountId, id: char.id };
  }

  it('dostupné questy na lvl 1: úvodní northshire questy, ne gated', async () => {
    const { accountId, id } = await newCharacter('m2a', 'Arugal');
    const ids = (await quests.listAvailable(accountId, id)).map((q) => q.id);
    expect(ids).toContain('ns_kobold_culling');
    expect(ids).toContain('ns_wolf_pelts');
    expect(ids).not.toContain('ns_brotherhood_intel'); // chybí prerekvizita
    expect(ids).not.toContain('wf_defias_raid'); // moc nízký level
  });

  it('start → běžící aktivita, druhý start je konflikt', async () => {
    const { accountId, id } = await newCharacter('m2b', 'Khadgar');
    const started = await activity.start(accountId, id, {
      activityType: 'quest',
      questId: KOBOLD.id,
    });
    expect(started.questId).toBe(KOBOLD.id);
    expect(started.progress.completed).toBe(false);

    const current = await activity.getCurrent(accountId, id);
    expect(current?.questId).toBe(KOBOLD.id);

    await expect(
      activity.start(accountId, id, { activityType: 'quest', questId: WOLVES.id }),
    ).rejects.toThrow();
  });

  it('claim před dokončením selže, po dokončení připíše XP/zlato', async () => {
    const { accountId, id } = await newCharacter('m2c', 'Jaina');
    await activity.start(accountId, id, { activityType: 'quest', questId: KOBOLD.id });

    await expect(activity.claim(accountId, id)).rejects.toThrow();

    vi.setSystemTime(T0 + KOBOLD.durationSec * 1000 + 1);
    const result = await activity.claim(accountId, id);
    expect(result.reward.xp).toBe(KOBOLD.baseXp);
    expect(result.reward.gold).toBeGreaterThan(0);
    expect(result.character.sheet.level).toBe(1);
    expect(result.character.gold).toBe(result.reward.gold);

    // Aktivita je pryč → lze poslat na další.
    expect(await activity.getCurrent(accountId, id)).toBeNull();
  });

  it('story quest se po dokončení už nenabízí (jednorázový)', async () => {
    const { accountId, id } = await newCharacter('m2d', 'Antonidas');
    await activity.start(accountId, id, { activityType: 'quest', questId: KOBOLD.id });
    vi.setSystemTime(T0 + KOBOLD.durationSec * 1000 + 1);
    await activity.claim(accountId, id);

    const ids = (await quests.listAvailable(accountId, id)).map((q) => q.id);
    expect(ids).not.toContain('ns_kobold_culling');
    expect(ids).toContain('ns_wolf_pelts'); // repeatable zůstává
  });

  it('postava povýší po dostatku XP', async () => {
    const { accountId, id } = await newCharacter('m2e', 'Modera');
    // kobold (60) → 60 XP, stále lvl 1
    await activity.start(accountId, id, { activityType: 'quest', questId: KOBOLD.id });
    vi.setSystemTime(T0 + KOBOLD.durationSec * 1000 + 1);
    let r = await activity.claim(accountId, id);
    expect(r.character.sheet.level).toBe(1);

    // dva běhy wolf pelts (45 + 45) → 150 XP > 108 → level 2
    for (let i = 0; i < 2; i++) {
      const base = Date.now();
      await activity.start(accountId, id, { activityType: 'quest', questId: WOLVES.id });
      vi.setSystemTime(base + WOLVES.durationSec * 1000 + 1);
      r = await activity.claim(accountId, id);
    }
    expect(r.leveledUp).toBe(true);
    expect(r.character.sheet.level).toBe(2);
  });

  it('frakce vidí jen své questy (Horde ≠ Alliance)', async () => {
    const tokens = await auth.register('m2h', 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const horde = await characters.create(accountId, {
      name: 'Grommash',
      race: 'orc',
      class: 'shaman',
    });

    const ids = (await quests.listAvailable(accountId, horde.id)).map((q) => q.id);
    expect(ids).toContain('dt_scorpid_sting'); // Durotar (horde)
    expect(ids.every((id) => !id.startsWith('ns_'))).toBe(true);

    // Hordák nemůže spustit alliance quest.
    await expect(
      activity.start(accountId, horde.id, { activityType: 'quest', questId: KOBOLD.id }),
    ).rejects.toThrow();
  });

  it('cizí účet nemůže manipulovat s aktivitou postavy', async () => {
    const owner = await newCharacter('m2f', 'Aegwynn');
    const other = await newCharacter('m2g', 'Medivh');
    await activity.start(owner.accountId, owner.id, { activityType: 'quest', questId: KOBOLD.id });
    await expect(activity.getCurrent(other.accountId, owner.id)).rejects.toThrow();
    await expect(activity.claim(other.accountId, owner.id)).rejects.toThrow();
  });
});
