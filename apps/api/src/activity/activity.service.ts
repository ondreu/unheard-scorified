import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  activityProgress,
  activitySeed,
  applyMountSpeed,
  applyXpGain,
  buildCharacterSheet,
  computeActivityReward,
  FACTIONS,
  GATHERING_NODES,
  isQuestAvailable,
  isQuestId,
  levelFromXp,
  mountSpeedBonus,
  professionReputationGains,
  professionSkillUp,
  PROFESSIONS,
  QUESTS,
  RECIPES,
  reputationProgress,
  type ActivityReward,
  type ActivityState,
  type CharacterSheet,
  type CraftActivityParams,
  type FactionId,
  type GatherActivityParams,
  type ProfessionId,
  type QuestActivityParams,
  type RepTier,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryGrantService } from '../inventory/inventory-grant.service';
import { CompletedQuestRepository } from '../quest/quest.repository';
import { ProfessionRepository, ReputationRepository } from '../profession/profession.repository';
import { MountRepository } from '../mount/mount.repository';
import type { Character, CharacterActivity } from '../db/schema';
import { ActivityRepository } from './activity.repository';
import { ACTIVITY_SCHEDULER, type ActivityScheduler } from './activity.scheduler';

export interface ActivityView {
  id: string;
  activityType: string;
  /** Zobrazovaný název aktivity. */
  title: string;
  startAt: string;
  durationSec: number;
  /** Vyplněno jen pro `activityType === 'quest'`. */
  questId?: string;
  quest?: { id: string; name: string; zoneId: string; kind: string };
  progress: {
    elapsedSec: number;
    remainingSec: number;
    progress: number;
    completed: boolean;
    finishesAt: string;
  };
}

export interface CharacterStateView {
  id: string;
  name: string;
  race: string;
  class: string;
  faction: string;
  gold: number;
  sheet: CharacterSheet;
}

/** Profession skill-up z dokončeného gather/craft běhu (M6). */
export interface ProfessionGainView {
  id: ProfessionId;
  name: string;
  skillBefore: number;
  skillAfter: number;
}

/** Reputační zisk z dokončeného profession běhu (M6). */
export interface ReputationGainView {
  factionId: FactionId;
  name: string;
  gained: number;
  standing: number;
  tier: RepTier;
  tierName: string;
}

export interface ClaimResult {
  reward: ActivityReward;
  levelBefore: number;
  levelAfter: number;
  leveledUp: boolean;
  levelsGained: number;
  character: CharacterStateView;
  /** Počet sekund, po které aktivita čekala na claim (offline progres). 0 = okamžitý claim. */
  offlineDurationSec: number;
  /** Itemy přidané do inventáře při claimu. */
  items: string[];
  /** Profession skill-up (jen u gather/craft). */
  profession?: ProfessionGainView;
  /** Reputační zisky (jen u gather/craft). */
  reputation?: ReputationGainView[];
}

export interface StartActivityInput {
  activityType: string;
  questId: string;
}

@Injectable()
export class ActivityService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly activities: ActivityRepository,
    private readonly completed: CompletedQuestRepository,
    private readonly inventoryRepo: InventoryRepository,
    private readonly grant: InventoryGrantService,
    private readonly professionRepo: ProfessionRepository,
    private readonly reputationRepo: ReputationRepository,
    private readonly mounts: MountRepository,
    @Inject(ACTIVITY_SCHEDULER) private readonly scheduler: ActivityScheduler,
  ) {}

  /** Pošle postavu na aktivitu (zatím jen 'quest'). */
  async start(
    accountId: string,
    characterId: string,
    input: StartActivityInput,
  ): Promise<ActivityView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    if (input.activityType !== 'quest') {
      throw new BadRequestException('Unsupported activity type');
    }
    if (!isQuestId(input.questId)) {
      throw new BadRequestException('Unknown quest');
    }

    const existing = await this.activities.findByCharacter(characterId);
    if (existing) throw new ConflictException('Character already has an active activity');

    const quest = QUESTS[input.questId]!;
    const level = levelFromXp(character.totalXp);
    const completedIds = await this.completed.completedIds(characterId);
    if (!isQuestAvailable(quest, level, completedIds, character.faction)) {
      throw new BadRequestException('Quest is not available for this character');
    }

    const startAt = new Date();
    const seed = activitySeed(characterId, quest.id, startAt.getTime());
    // Mount speed (M10+): questing je pohybová aktivita → zkracuje se durationSec.
    const ownedMounts = await this.mounts.ownedIds(characterId);
    const durationSec = applyMountSpeed(quest.durationSec, mountSpeedBonus(ownedMounts));
    const row = await this.activities.create({
      characterId,
      activityType: 'quest',
      params: { questId: quest.id },
      startAt,
      durationSec,
      seed,
    });

    await this.scheduler.schedule(row.id, characterId, durationSec * 1000);
    return this.toActivityView(row, Date.now());
  }

  /** Aktuální běžící aktivita postavy (s lazy dopočtem průběhu), nebo null. */
  async getCurrent(accountId: string, characterId: string): Promise<ActivityView | null> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const row = await this.activities.findByCharacter(characterId);
    return row ? this.toActivityView(row, Date.now()) : null;
  }

  /**
   * Vybere odměny z dokončené aktivity: deterministicky dopočítá XP/zlato,
   * připíše je postavě, story quest označí za dokončený a aktivitu odstraní.
   */
  async claim(accountId: string, characterId: string): Promise<ClaimResult> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const row = await this.activities.findByCharacter(characterId);
    if (!row) throw new BadRequestException('No active activity');

    const claimAt = Date.now();
    const state = toActivityState(row);
    const reward = computeActivityReward(state, claimAt);
    if (!reward) throw new BadRequestException('Activity has not finished yet');

    const finishesAt = state.startAt + state.durationSec * 1000;
    const offlineDurationSec = Math.max(0, Math.floor((claimAt - finishesAt) / 1000));

    const gain = applyXpGain(character.totalXp, reward.xp);
    const updated = await this.characters.addRewards(character.id, reward.xp, reward.gold);

    if (row.activityType === 'quest') {
      const questId = (row.params as QuestActivityParams).questId;
      if (QUESTS[questId]?.kind === 'story') {
        await this.completed.markCompleted(characterId, questId);
      }
    }

    // Přidá loot/materiály/output do inventáře (přebytek nad kapacitu → pošta).
    const grantedItems: string[] = [...reward.items];
    await this.grant.grant(
      characterId,
      reward.items.map((itemId) => ({ itemId, quantity: 1 })),
    );

    // Profese (M6): skill-up + reputace u gather/craft běhů.
    const professionRewards = await this.applyProfessionRewards(row);

    await this.activities.deleteById(row.id);
    await this.scheduler.cancel(row.id);

    return {
      reward,
      levelBefore: gain.levelBefore,
      levelAfter: gain.levelAfter,
      leveledUp: gain.leveledUp,
      levelsGained: gain.levelsGained,
      character: toCharacterStateView(updated),
      offlineDurationSec,
      items: grantedItems,
      ...professionRewards,
    };
  }

  /**
   * Připíše profession skill-up a reputaci za dokončený gather/craft běh.
   * Vrací prázdný objekt pro ostatní typy aktivit.
   */
  private async applyProfessionRewards(
    row: CharacterActivity,
  ): Promise<{ profession?: ProfessionGainView; reputation?: ReputationGainView[] }> {
    let professionId: ProfessionId;
    let skillUpTo: number;
    let repSource: typeof GATHERING_NODES[string] | typeof RECIPES[string];

    if (row.activityType === 'gather') {
      const node = GATHERING_NODES[(row.params as GatherActivityParams).nodeId];
      if (!node) return {};
      professionId = node.professionId;
      skillUpTo = node.skillUpTo;
      repSource = node;
    } else if (row.activityType === 'craft') {
      const recipe = RECIPES[(row.params as CraftActivityParams).recipeId];
      if (!recipe) return {};
      professionId = recipe.professionId;
      skillUpTo = recipe.skillUpTo;
      repSource = recipe;
    } else {
      return {};
    }

    const skillBefore = await this.professionRepo.getSkill(row.characterId, professionId);
    const delta = professionSkillUp(skillBefore, skillUpTo);
    const skillAfter = skillBefore + delta;
    if (delta > 0) {
      await this.professionRepo.setSkill(row.characterId, professionId, skillAfter);
    }

    const reputation: ReputationGainView[] = [];
    for (const gainEntry of professionReputationGains(repSource)) {
      const standing = await this.reputationRepo.addStanding(
        row.characterId,
        gainEntry.factionId,
        gainEntry.amount,
      );
      const prog = reputationProgress(standing);
      reputation.push({
        factionId: gainEntry.factionId,
        name: FACTIONS[gainEntry.factionId].name,
        gained: gainEntry.amount,
        standing,
        tier: prog.tier,
        tierName: prog.tierName,
      });
    }

    return {
      profession: {
        id: professionId,
        name: PROFESSIONS[professionId].name,
        skillBefore,
        skillAfter,
      },
      reputation,
    };
  }

  private toActivityView(row: CharacterActivity, now: number): ActivityView {
    const state = toActivityState(row);
    const p = activityProgress(state, now);
    const progress = {
      elapsedSec: p.elapsedSec,
      remainingSec: p.remainingSec,
      progress: p.progress,
      completed: p.completed,
      finishesAt: new Date(p.finishesAt).toISOString(),
    };
    const base = {
      id: row.id,
      activityType: row.activityType,
      startAt: row.startAt.toISOString(),
      durationSec: row.durationSec,
      progress,
    };

    if (row.activityType === 'gather') {
      const node = GATHERING_NODES[(row.params as GatherActivityParams).nodeId];
      return { ...base, title: node ? `Gathering: ${node.name}` : 'Gathering' };
    }

    if (row.activityType === 'craft') {
      const recipe = RECIPES[(row.params as CraftActivityParams).recipeId];
      return { ...base, title: recipe ? `Crafting: ${recipe.name}` : 'Crafting' };
    }

    const questId = (row.params as QuestActivityParams).questId;
    const quest = QUESTS[questId]!;
    return {
      ...base,
      title: quest.name,
      questId,
      quest: { id: quest.id, name: quest.name, zoneId: quest.zoneId, kind: quest.kind },
    };
  }
}

function toActivityState(row: CharacterActivity): ActivityState {
  return {
    activityType: row.activityType,
    params: row.params,
    startAt: row.startAt.getTime(),
    durationSec: row.durationSec,
    seed: row.seed,
  };
}

function toCharacterStateView(c: Character): CharacterStateView {
  return {
    id: c.id,
    name: c.name,
    race: c.race,
    class: c.class,
    faction: c.faction,
    gold: c.gold,
    sheet: buildCharacterSheet(c.race, c.class, c.totalXp),
  };
}
