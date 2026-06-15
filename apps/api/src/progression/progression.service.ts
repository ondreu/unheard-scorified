import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ACHIEVEMENTS,
  achievementById,
  achievementProgress,
  levelFromXp,
  type AchievementMetric,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import type { Character } from '../db/schema';
import { ProgressionRepository } from './progression.repository';

export interface AchievementView {
  id: string;
  name: string;
  description: string;
  metric: AchievementMetric;
  threshold: number;
  rewardGold: number;
  value: number;
  pct: number;
  completed: boolean;
  claimed: boolean;
  /** Splněno a ještě nevyzvednuto. */
  claimable: boolean;
}

export interface AchievementsView {
  achievements: AchievementView[];
  completedCount: number;
  total: number;
}

export interface ClaimResult {
  achievementId: string;
  rewardGold: number;
  goldAfter: number;
}

/**
 * Achievementy (M9). Splnění se odvozuje lazy z herního stavu (level, zlato,
 * počty questů/dungeonů/raidů/arén/přátel). Nárok na odměnu je jednorázový
 * (uložený). Server-authoritative, stateless.
 */
@Injectable()
export class ProgressionService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly repo: ProgressionRepository,
  ) {}

  private async own(accountId: string, characterId: string): Promise<Character> {
    const char = await this.characters.findOwned(accountId, characterId);
    if (!char) throw new NotFoundException('Character not found');
    return char;
  }

  /** Aktuální hodnoty všech metrik pro postavu. */
  private async metrics(char: Character): Promise<Record<AchievementMetric, number>> {
    const [questsCompleted, dungeonClears, raidClears, arenaWins, friends] = await Promise.all([
      this.repo.questsCompleted(char.id),
      this.repo.clears(char.id, 'dungeon'),
      this.repo.clears(char.id, 'raid'),
      this.repo.arenaWins(char.id),
      this.repo.friends(char.id),
    ]);
    return {
      level: levelFromXp(char.totalXp),
      gold: char.gold,
      questsCompleted,
      dungeonClears,
      raidClears,
      arenaWins,
      friends,
    };
  }

  async getAchievements(accountId: string, characterId: string): Promise<AchievementsView> {
    const char = await this.own(accountId, characterId);
    const [values, claimed] = await Promise.all([
      this.metrics(char),
      this.repo.claimedIds(characterId),
    ]);

    const achievements: AchievementView[] = ACHIEVEMENTS.map((a) => {
      const value = values[a.metric];
      const { completed, pct } = achievementProgress(value, a.threshold);
      const isClaimed = claimed.has(a.id);
      return {
        id: a.id,
        name: a.name,
        description: a.description,
        metric: a.metric,
        threshold: a.threshold,
        rewardGold: a.rewardGold,
        value,
        pct,
        completed,
        claimed: isClaimed,
        claimable: completed && !isClaimed,
      };
    });

    return {
      achievements,
      completedCount: achievements.filter((a) => a.completed).length,
      total: achievements.length,
    };
  }

  /** Vyzvedne odměnu za splněný achievement (jednorázově). */
  async claim(accountId: string, characterId: string, achievementId: string): Promise<ClaimResult> {
    const char = await this.own(accountId, characterId);
    const def = achievementById(achievementId);
    if (!def) throw new NotFoundException('Unknown achievement');

    const values = await this.metrics(char);
    if (!achievementProgress(values[def.metric], def.threshold).completed) {
      throw new BadRequestException('Achievement not completed');
    }
    const first = await this.repo.claim(characterId, def.id);
    if (!first) throw new BadRequestException('Already claimed');

    await this.characters.addGold(characterId, def.rewardGold);
    const fresh = await this.characters.findById(characterId);
    return {
      achievementId: def.id,
      rewardGold: def.rewardGold,
      goldAfter: fresh?.gold ?? char.gold + def.rewardGold,
    };
  }
}
