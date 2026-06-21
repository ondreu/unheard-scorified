import { Injectable, NotFoundException } from '@nestjs/common';
import {
  buildBestiaryView,
  dungeonTemplateCounts,
  questTemplateCounts,
  type BestiaryView,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { BestiaryRepository } from './bestiary.repository';

/**
 * Bestiář — in-game encyklopedie nepřátel. Read-model nad katalogem
 * (`@game/shared`) + per-postava stav (objeveno / kill counter). Odemčení se
 * zaznamenává při poražení obsahu (`recordQuestKills` / `recordDungeonClear`),
 * volané z `ActivityService` / `DungeonService` — best-effort (nesmí shodit claim).
 */
@Injectable()
export class BestiaryService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly bestiary: BestiaryRepository,
  ) {}

  /** Bestiář postavy (všechny katalogové záznamy + per-postava progres). */
  async getBestiary(accountId: string, characterId: string): Promise<BestiaryView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    const progress = await this.bestiary.progressFor(characterId);
    return buildBestiaryView(progress);
  }

  /** Zaznamená poražené nepřátele z dokončeného questu (jen katalogové foe). */
  async recordQuestKills(characterId: string, questId: string): Promise<void> {
    await this.record(characterId, questTemplateCounts(questId));
  }

  /** Zaznamená poražené nepřátele z vyčištěného dungeonu. */
  async recordDungeonClear(characterId: string, dungeonId: string): Promise<void> {
    await this.record(characterId, dungeonTemplateCounts(dungeonId));
  }

  /** Best-effort zápis kill counterů (selhání nesmí shodit volající claim). */
  private async record(characterId: string, counts: Record<string, number>): Promise<void> {
    if (Object.keys(counts).length === 0) return;
    try {
      await this.bestiary.addKills(characterId, counts);
    } catch {
      /* best-effort — bestiář je flavor vrstva, nesmí blokovat odměnu */
    }
  }
}
