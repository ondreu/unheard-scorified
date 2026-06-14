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
  isQuestAvailable,
  isQuestId,
  levelFromXp,
  QUESTS,
  type ActivityReward,
  type ActivityState,
  type CharacterSheet,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { CompletedQuestRepository } from '../quest/quest.repository';
import type { Character, CharacterActivity } from '../db/schema';
import { ActivityRepository } from './activity.repository';
import { ACTIVITY_SCHEDULER, type ActivityScheduler } from './activity.scheduler';

export interface ActivityView {
  id: string;
  activityType: string;
  questId: string;
  startAt: string;
  durationSec: number;
  quest: { id: string; name: string; zoneId: string; kind: string };
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

    if (row.activityType === 'quest' && QUESTS[row.params.questId]?.kind === 'story') {
      await this.completed.markCompleted(characterId, row.params.questId);
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
    };
  }

  private toActivityView(row: CharacterActivity, now: number): ActivityView {
    const state = toActivityState(row);
    const p = activityProgress(state, now);
    const quest = QUESTS[row.params.questId]!;
    return {
      id: row.id,
      activityType: row.activityType,
      questId: row.params.questId,
      startAt: row.startAt.toISOString(),
      durationSec: row.durationSec,
      quest: { id: quest.id, name: quest.name, zoneId: quest.zoneId, kind: quest.kind },
      progress: {
        elapsedSec: p.elapsedSec,
        remainingSec: p.remainingSec,
        progress: p.progress,
        completed: p.completed,
        finishesAt: new Date(p.finishesAt).toISOString(),
      },
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
