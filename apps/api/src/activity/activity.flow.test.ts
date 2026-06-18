import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { activityEfficiency, QUESTS, xpForLevel } from '@game/shared';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { CompletedQuestRepository } from '../quest/quest.repository';
import { QuestService } from '../quest/quest.service';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import { BuffRepository } from '../buff/buff.repository';
import { makeGrant } from '../inventory/test-grant';
import { ProfessionRepository, ReputationRepository } from '../profession/profession.repository';
import { MountRepository } from '../mount/mount.repository';
import { LevelUpRepository } from '../levelup/levelup.repository';
import { RotationService } from '../rotation/rotation.service';
import { HistoryRepository } from '../history/history.repository';
import { RotationRepository } from '../rotation/rotation.repository';
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
  // M12: combat-objective quest (souboj lze prohrát), Alliance/Northshire, req lvl 8.
  const CHALLENGE = QUESTS.ns_padfoot_bounty!;
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
    const invRepo = new InventoryRepository(db);
    const invService = new InventoryService(charRepo, invRepo, new BuffRepository(db));
    const rotation = new RotationService(
      charRepo,
      new LevelUpRepository(db),
      new RotationRepository(db),
      invService,
    );
    activity = new ActivityService(
      charRepo,
      new ActivityRepository(db),
      completed,
      invRepo,
      makeGrant(db),
      new ProfessionRepository(db),
      new ReputationRepository(db),
      new MountRepository(db),
      rotation,
      new HistoryRepository(db),
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
    const char = await characters.create(accountId, { name, race: 'human', class: 'wizard' });
    return { accountId, id: char.id };
  }

  it('dostupné questy na lvl 1: úvodní northshire story quest, ne gated', async () => {
    const { accountId, id } = await newCharacter('m2a', 'Arugal');
    const ids = (await quests.listAvailable(accountId, id)).map((q) => q.id);
    expect(ids).toContain('ns_kobold_culling');
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

    // I jiný typ aktivity (Gone Questing) je konflikt — jen jedna běžící aktivita.
    await expect(
      activity.start(accountId, id, { activityType: 'grind', durationSec: 1800 }),
    ).rejects.toThrow();
  });

  it('claim před dokončením selže, po dokončení připíše XP/zlato', async () => {
    const { accountId, id } = await newCharacter('m2c', 'Jaina');
    await activity.start(accountId, id, { activityType: 'quest', questId: KOBOLD.id });

    await expect(activity.claim(accountId, id)).rejects.toThrow();

    vi.setSystemTime(T0 + KOBOLD.durationSec * 1000 + 1);
    const result = await activity.claim(accountId, id);
    expect(result.reward.xp).toBe(Math.round(KOBOLD.baseXp * activityEfficiency(KOBOLD.durationSec)));
    expect(result.reward.gold).toBeGreaterThan(0);
    expect(result.character.sheet.level).toBe(1);
    expect(result.character.gold).toBe(result.reward.gold);

    // M9: claim story questu vrací příběhový log (narativní beaty + combaty).
    expect(result.questLog).toBeDefined();
    expect(result.questLog!.length).toBe(KOBOLD.steps!.length);
    const combat = result.questLog!.filter((s) => s.kind === 'combat');
    expect(combat.length).toBeGreaterThan(0);
    expect(combat[0]!.enemyName).toBeTruthy();
    expect(combat[0]!.events!.at(-1)!.type).toBe('enemy_defeated');

    // M9 retrofit: dokončený quest dá standing Explorers' Guild (generalisté).
    const repGain = result.reputation?.find((r) => r.factionId === 'explorers_guild');
    expect(repGain).toBeDefined();
    expect(repGain!.gained).toBeGreaterThan(0);
    const standings = await new ReputationRepository(db).listStandings(id);
    expect(standings.find((s) => s.factionId === 'explorers_guild')?.standing).toBe(repGain!.standing);

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
  });

  it('postava povýší po dostatku XP', async () => {
    const { accountId, id } = await newCharacter('m2e', 'Modera');
    // kobold (~99 XP) → stále lvl 1 (xpForNextLevel(1) = 120)
    await activity.start(accountId, id, { activityType: 'quest', questId: KOBOLD.id });
    vi.setSystemTime(T0 + KOBOLD.durationSec * 1000 + 1);
    let r = await activity.claim(accountId, id);
    expect(r.character.sheet.level).toBe(1);

    // Gone Questing 20 min (~197 XP) → 296 XP > 120 → level 2 (claim = level-up)
    const base = Date.now();
    const GRIND_SEC = 1200;
    await activity.start(accountId, id, { activityType: 'grind', durationSec: GRIND_SEC });
    vi.setSystemTime(base + GRIND_SEC * 1000 + 1);
    r = await activity.claim(accountId, id);
    expect(r.leveledUp).toBe(true);
    expect(r.character.sheet.level).toBe(2);
  });

  it('Gone Questing: hráč volí délku, claim dá XP/zlato + flavor log', async () => {
    const { accountId, id } = await newCharacter('m2gq', 'Vereesa');
    const DUR = 3600;
    const started = await activity.start(accountId, id, {
      activityType: 'grind',
      durationSec: DUR,
    });
    expect(started.activityType).toBe('grind');
    expect(started.title).toContain('Gone Questing');
    expect(started.durationSec).toBe(DUR);
    expect(started.questId).toBeUndefined();

    vi.setSystemTime(T0 + DUR * 1000 + 1);
    const result = await activity.claim(accountId, id);
    expect(result.reward.xp).toBeGreaterThan(0);
    expect(result.reward.gold).toBeGreaterThan(0);
    // Flavor log: úvod + auto-resolved souboje (nelze prohrát) + závěr.
    expect(result.questLog).toBeDefined();
    const combat = result.questLog!.filter((s) => s.kind === 'combat');
    expect(combat.length).toBeGreaterThan(0);
    expect(combat[0]!.events!.at(-1)!.type).toBe('enemy_defeated');
    expect(await activity.getCurrent(accountId, id)).toBeNull();
  });

  it('Gone Questing: neplatná délka je odmítnuta', async () => {
    const { accountId, id } = await newCharacter('m2gq2', 'Liadrin');
    await expect(
      activity.start(accountId, id, { activityType: 'grind', durationSec: 0 }),
    ).rejects.toThrow();
  });

  it('combat-objective quest: prohra → žádná odměna, quest se nedokončí (lze opakovat)', async () => {
    const { accountId, id } = await newCharacter('m12fail', 'Tirion');
    // Postava přesně na požadovaném levelu, bez gearu → slabá → souboj prohraje.
    await charRepo.addRewards(id, xpForLevel(CHALLENGE.requiredLevel), 0);

    await activity.start(accountId, id, { activityType: 'quest', questId: CHALLENGE.id });
    vi.setSystemTime(T0 + CHALLENGE.durationSec * 1000 + 1);
    const result = await activity.claim(accountId, id);

    expect(result.questFailed).toBe(true);
    expect(result.reward.xp).toBe(0);
    expect(result.reward.gold).toBe(0);
    expect(result.items).toHaveLength(0);
    expect(result.character.gold).toBe(0); // žádné zlato nepřibylo
    // Příběh se utne na prohraném souboji.
    expect(result.questLog!.at(-1)!.defeated).toBe(true);

    // Quest se NEdokončil → je pořád v nabídce (lze opakovat se silnějším buildem).
    const ids = (await quests.listAvailable(accountId, id)).map((q) => q.id);
    expect(ids).toContain(CHALLENGE.id);
    // Aktivita je pryč → lze zkusit znovu.
    expect(await activity.getCurrent(accountId, id)).toBeNull();
  });

  it('combat-objective quest: výhra → odměna + jednorázové dokončení', async () => {
    const { accountId, id } = await newCharacter('m12win', 'Uther');
    // Silná postava (vysoký level) → vyhraje s velkou rezervou.
    await charRepo.addRewards(id, xpForLevel(60), 0);

    await activity.start(accountId, id, { activityType: 'quest', questId: CHALLENGE.id });
    vi.setSystemTime(T0 + CHALLENGE.durationSec * 1000 + 1);
    const result = await activity.claim(accountId, id);

    expect(result.questFailed).toBeUndefined();
    expect(result.reward.xp).toBe(
      Math.round(CHALLENGE.baseXp * activityEfficiency(CHALLENGE.durationSec)),
    );
    expect(result.questLog!.some((s) => s.defeated)).toBe(false);

    // Dokončený jednorázový quest → už se nenabízí.
    const ids = (await quests.listAvailable(accountId, id)).map((q) => q.id);
    expect(ids).not.toContain(CHALLENGE.id);
  });

  it('frakce odstraněny — postava vidí všechny questline (dříve A i H)', async () => {
    const tokens = await auth.register('m2h', 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, {
      name: 'Grommash',
      race: 'half_orc',
      class: 'druid',
    });

    const ids = (await quests.listAvailable(accountId, char.id)).map((q) => q.id);
    expect(ids).toContain('dt_scorpid_sting'); // dříve Horde
    expect(ids).toContain('ns_kobold_culling'); // dříve Alliance — teď taky dostupné

    // A dříve „alliance" quest jde i spustit.
    await expect(
      activity.start(accountId, char.id, { activityType: 'quest', questId: KOBOLD.id }),
    ).resolves.toBeTruthy();
  });

  it('cizí účet nemůže manipulovat s aktivitou postavy', async () => {
    const owner = await newCharacter('m2f', 'Aegwynn');
    const other = await newCharacter('m2g', 'Medivh');
    await activity.start(owner.accountId, owner.id, { activityType: 'quest', questId: KOBOLD.id });
    await expect(activity.getCurrent(other.accountId, owner.id)).rejects.toThrow();
    await expect(activity.claim(other.accountId, owner.id)).rejects.toThrow();
  });
});
