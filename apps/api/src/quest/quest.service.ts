import { Injectable, NotFoundException } from '@nestjs/common';
import { activityEfficiency, availableQuests, levelFromXp, type QuestDef } from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { CompletedQuestRepository } from './quest.repository';

export interface QuestView {
  id: string;
  name: string;
  description: string;
  zoneId: string;
  kind: string;
  requiredLevel: number;
  durationSec: number;
  /** Efektivní XP odměna (po `activityEfficiency` dle délky běhu). */
  baseXp: number;
  /** Efektivní zlato (střed; rolluje se ještě s variancí při claimu). */
  baseGold: number;
}

@Injectable()
export class QuestService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly completed: CompletedQuestRepository,
  ) {}

  /** Dostupné questy pro postavu (gated levelem, zónou a story prerekvizitami). */
  async listAvailable(accountId: string, characterId: string): Promise<QuestView[]> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const level = levelFromXp(character.totalXp);
    const completedIds = await this.completed.completedIds(characterId);
    return availableQuests(level, completedIds, character.faction).map(toView);
  }
}

function toView(q: QuestDef): QuestView {
  const eff = activityEfficiency(q.durationSec);
  return {
    id: q.id,
    name: q.name,
    description: q.description,
    zoneId: q.zoneId,
    kind: q.kind,
    requiredLevel: q.requiredLevel,
    durationSec: q.durationSec,
    baseXp: Math.round(q.baseXp * eff),
    baseGold: Math.round(q.baseGold * eff),
  };
}
