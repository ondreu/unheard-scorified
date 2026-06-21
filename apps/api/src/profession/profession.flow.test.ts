import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GATHERING_NODES, RECIPES } from '@game/shared';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { CompletedQuestRepository } from '../quest/quest.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import { BuffRepository } from '../buff/buff.repository';
import { makeGrant } from '../inventory/test-grant';
import { MountRepository } from '../mount/mount.repository';
import { LevelUpRepository } from '../levelup/levelup.repository';
import { RotationService } from '../rotation/rotation.service';
import { HistoryRepository } from '../history/history.repository';
import { RotationRepository } from '../rotation/rotation.repository';
import { BestiaryService } from '../bestiary/bestiary.service';
import { BestiaryRepository } from '../bestiary/bestiary.repository';
import { ActivityRepository } from '../activity/activity.repository';
import { ActivityService } from '../activity/activity.service';
import { NoopActivityScheduler } from '../activity/activity.scheduler';
import { ProfessionRepository, ReputationRepository } from './profession.repository';
import { ProfessionService } from './profession.service';

/**
 * Integrační test M6 profesí nad pglite (bez Redisu, NoopScheduler). Čas řídíme
 * fake timers → deterministický dopočet gather/craft odměn.
 */
describe('M6 flow: profese & reputace', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let invRepo: InventoryRepository;
  let profRepo: ProfessionRepository;
  let repRepo: ReputationRepository;
  let professions: ProfessionService;
  let activity: ActivityService;

  const COPPER = GATHERING_NODES.copper_vein!;
  const T0 = Date.UTC(2026, 5, 14, 12, 0, 0);

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    invRepo = new InventoryRepository(db);
    profRepo = new ProfessionRepository(db);
    repRepo = new ReputationRepository(db);
    const activityRepo = new ActivityRepository(db);
    const mountRepo = new MountRepository(db);
    professions = new ProfessionService(
      charRepo,
      invRepo,
      profRepo,
      repRepo,
      activityRepo,
      mountRepo,
      new NoopActivityScheduler(),
    );
    const invService = new InventoryService(charRepo, invRepo, new BuffRepository(db));
    const rotation = new RotationService(
      charRepo,
      new LevelUpRepository(db),
      new RotationRepository(db),
      invService,
    );
    activity = new ActivityService(
      charRepo,
      activityRepo,
      new CompletedQuestRepository(db),
      invRepo,
      makeGrant(db, invRepo),
      profRepo,
      repRepo,
      mountRepo,
      rotation,
      new HistoryRepository(db),
      new BestiaryService(charRepo, new BestiaryRepository(db)),
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
    const char = await characters.create(accountId, { name, race: 'half_orc', class: 'fighter' });
    return { accountId, id: char.id };
  }

  it('panel: nová postava má všechny profese na skillu 1 a neutrální reputaci', async () => {
    const c = await newCharacter('p1', 'Greenhorn');
    const panel = await professions.getPanel(c.accountId, c.id);

    // 2 gathering + 2 crafting (M6) + skinning/leatherworking (craftable bags).
    expect(panel.skills).toHaveLength(6);
    expect(panel.skills.every((s) => s.skill === 1)).toBe(true);
    expect(panel.reputation.every((r) => r.tier === 'neutral')).toBe(true);

    // Tier 1 nody odemčené, tier 2 ne.
    expect(panel.gathering.find((n) => n.id === 'copper_vein')?.unlocked).toBe(true);
    expect(panel.gathering.find((n) => n.id === 'iron_deposit')?.unlocked).toBe(false);
    // Tier 1 recept odemčený, ale necraftovatelný (chybí materiály).
    const dagger = panel.recipes.find((r) => r.id === 'craft_copper_dagger');
    expect(dagger?.unlocked).toBe(true);
    expect(dagger?.craftable).toBe(false);
  });

  it('gather: start založí aktivitu, druhý start je konflikt', async () => {
    const c = await newCharacter('p2', 'Digger');
    await professions.startGather(c.accountId, c.id, 'copper_vein');
    const view = await activity.getCurrent(c.accountId, c.id);
    expect(view?.activityType).toBe('gather');
    await expect(professions.startGather(c.accountId, c.id, 'copper_vein')).rejects.toThrow();
  });

  it('gather: zamčený node (vysoký requiredSkill) selže', async () => {
    const c = await newCharacter('p3', 'Tooweak');
    await expect(professions.startGather(c.accountId, c.id, 'iron_deposit')).rejects.toThrow();
  });

  it('claim gather: materiály do inventáře + skill-up + reputace', async () => {
    const c = await newCharacter('p4', 'Miner');
    await professions.startGather(c.accountId, c.id, 'copper_vein');

    vi.setSystemTime(T0 + (COPPER.durationSec + 1) * 1000);
    const result = await activity.claim(c.accountId, c.id);

    expect(result.reward.xp).toBe(COPPER.baseXp);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items).toContain('copper_ore');

    // Skill-up mining 1 → 2.
    expect(result.profession?.id).toBe('mining');
    expect(result.profession?.skillBefore).toBe(1);
    expect(result.profession?.skillAfter).toBe(2);
    expect(await profRepo.getSkill(c.id, 'mining')).toBe(2);

    // Reputace: Miners' League (primary) + Explorers' Guild (podíl).
    const miners = result.reputation?.find((r) => r.factionId === 'miners_league');
    expect(miners?.gained).toBe(COPPER.repReward);
    expect(miners?.standing).toBe(COPPER.repReward);
    expect(result.reputation?.find((r) => r.factionId === 'explorers_guild')?.gained).toBe(
      Math.round(COPPER.repReward * 0.5),
    );

    // Materiály jsou v inventáři.
    expect(await invRepo.getQuantity(c.id, 'copper_ore')).toBeGreaterThan(0);
  });

  it('craft: bez materiálů selže; s materiály spotřebuje a vyrobí item', async () => {
    const c = await newCharacter('p5', 'Smith');

    // Bez materiálů.
    await expect(professions.startCraft(c.accountId, c.id, 'craft_copper_dagger')).rejects.toThrow();

    // Naseeduj 3× copper_ore.
    await invRepo.addItem(c.id, 'copper_ore');
    await invRepo.addItem(c.id, 'copper_ore');
    await invRepo.addItem(c.id, 'copper_ore');

    await professions.startCraft(c.accountId, c.id, 'craft_copper_dagger');
    // Materiály spotřebovány ihned při startu.
    expect(await invRepo.getQuantity(c.id, 'copper_ore')).toBe(0);

    const recipe = RECIPES.craft_copper_dagger!;
    vi.setSystemTime(T0 + (recipe.durationSec + 1) * 1000);
    const result = await activity.claim(c.accountId, c.id);

    expect(result.items).toEqual(['copper_dagger']);
    expect(await invRepo.getQuantity(c.id, 'copper_dagger')).toBe(1);
    expect(result.profession?.id).toBe('blacksmithing');
    expect(result.profession?.skillAfter).toBe(2);
  });

  it('rep-gated recept selže bez dostatečné reputace, projde po splnění', async () => {
    const c = await newCharacter('p6', 'Master');
    const recipe = RECIPES.craft_masterwork_blade!;

    // Naseeduj materiály.
    for (let i = 0; i < 8; i++) await invRepo.addItem(c.id, 'mithril_ore');
    for (let i = 0; i < 2; i++) await invRepo.addItem(c.id, 'silver_ore');

    // Dost skillu, ale neutrální reputace → selže.
    await profRepo.setSkill(c.id, 'blacksmithing', recipe.requiredSkill);
    await expect(professions.startCraft(c.accountId, c.id, 'craft_masterwork_blade')).rejects.toThrow();

    // Honored (1500) → projde.
    await repRepo.addStanding(c.id, 'miners_league', 1500);
    await professions.startCraft(c.accountId, c.id, 'craft_masterwork_blade');
    const view = await activity.getCurrent(c.accountId, c.id);
    expect(view?.activityType).toBe('craft');
  });

  it('cizí účet nemůže číst ani spustit profese postavy', async () => {
    const owner = await newCharacter('p7a', 'Owner');
    const other = await newCharacter('p7b', 'Intruder');
    await expect(professions.getPanel(other.accountId, owner.id)).rejects.toThrow();
    await expect(professions.startGather(other.accountId, owner.id, 'copper_vein')).rejects.toThrow();
  });
});
