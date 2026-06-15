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
  applyXpGain,
  buildCharacterSheet,
  computeActivityReward,
  DUNGEONS,
  isQuestAvailable,
  isQuestId,
  levelFromXp,
  QUESTS,
  type ActivityReward,
  type ActivityState,
  type CharacterSheet,
  type DungeonActivityParams,
  type QuestActivityParams,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { CompletedQuestRepository } from '../quest/quest.repository';
import type { Character, CharacterActivity } from '../db/schema';
import { ActivityRepository } from './activity.repository';
import { ACTIVITY_SCHEDULER, type ActivityScheduler } from './activity.scheduler';

export interface ActivityView {
  id: string;
  activityType: string;
  /** Zobrazovaný název aktivity (quest nebo dungeon). */
  title: string;
  startAt: string;
  durationSec: number;
  /** Vyplněno jen pro `activityType === 'quest'`. */
  questId?: string;
  quest?: { id: string; name: string; zoneId: string; kind: string };
  /** Vyplněno jen pro `activityType === 'dungeon'`. */
  dungeon?: { id: string; name: string };
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
    const row = await this.activities.create({
      characterId,
      activityType: 'quest',
      params: { questId: quest.id },
      startAt,
      durationSec: quest.durationSec,
      seed,
    });

    await this.scheduler.schedule(row.id, characterId, quest.durationSec * 1000);
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

    // Přidá loot do inventáře
    const grantedItems: string[] = [];
    for (const itemId of reward.items) {
      await this.inventoryRepo.addItem(characterId, itemId);
      grantedItems.push(itemId);
    }

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

    if (row.activityType === 'dungeon') {
      const params = row.params as DungeonActivityParams;
      const dungeon = DUNGEONS[params.dungeonId];
      return { ...base, title: dungeon?.name ?? params.dungeonId, dungeon: { id: params.dungeonId, name: dungeon?.name ?? params.dungeonId } };
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
