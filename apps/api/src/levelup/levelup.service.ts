import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CLASSES,
  FEATS,
  buildCharacterSheet,
  buildLevelTrack,
  levelFromXp,
  levelUpSlots,
  isValidChoice,
  selectedSubclass,
  type ClassId,
  type FeatId,
  type LevelTrack,
  type LevelUpChoice,
  type LevelUpSlot,
  type StoredLevelUpChoice,
  type SubclassId,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { LevelUpRepository } from './levelup.repository';

export interface LevelUpSlotView extends LevelUpSlot {
  /** Aktuálně uložená volba (nebo null). */
  choice: LevelUpChoice | null;
}

export interface FeatView {
  id: FeatId;
  name: string;
  description: string;
}

export interface SubclassView {
  id: SubclassId;
  name: string;
  description: string;
}

export interface LevelUpView {
  level: number;
  /** Sloty, na které má postava nárok (subclass + ASI/Feat). */
  slots: LevelUpSlotView[];
  /** Dostupné featy (volba alternativní k ASI). */
  feats: FeatView[];
  /** Subclassy dané třídy (1 v MVP). */
  subclasses: SubclassView[];
  /** Level track 1–20 — co přináší každý level (Slice A). */
  track: LevelTrack;
}

@Injectable()
export class LevelUpService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly repo: LevelUpRepository,
  ) {}

  /** Stav level-upu postavy: nárokové sloty, uložené volby a dostupné možnosti. */
  async getLevelUp(accountId: string, characterId: string): Promise<LevelUpView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const klass = character.class as ClassId;
    const level = levelFromXp(character.totalXp);
    const stored = await this.repo.listChoices(characterId);
    const bySlot = new Map(stored.map((r) => [r.slotId, r.choice]));

    const slots: LevelUpSlotView[] = levelUpSlots(klass, level).map((s) => ({
      ...s,
      choice: bySlot.get(s.id) ?? null,
    }));

    // Vybraná subclass (uložená volba má přednost, jinak persistovaný sloupec).
    const subclass = selectedSubclass(stored) ?? (character.subclass as SubclassId | null);
    // CON modifikátor pro HP v track (čistě prezentační, bez ASI/feat progrese).
    const sheet = buildCharacterSheet(character.race, klass, character.totalXp, undefined, character.baseScores);
    const conMod = sheet.derived.modifiers.constitution;

    return {
      level,
      slots,
      feats: Object.values(FEATS).map((f) => ({ id: f.id, name: f.name, description: f.description })),
      subclasses: CLASSES[klass].subclasses.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
      })),
      track: buildLevelTrack(klass, subclass, level, conMod),
    };
  }

  /** Uloží volbu do slotu (s validací nároku i obsahu). */
  async choose(
    accountId: string,
    characterId: string,
    slotId: string,
    choice: LevelUpChoice,
  ): Promise<LevelUpView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const klass = character.class as ClassId;
    const level = levelFromXp(character.totalXp);
    const slot = levelUpSlots(klass, level).find((s) => s.id === slotId);
    if (!slot) throw new BadRequestException('Level-up slot not available yet');
    if (!isValidChoice(klass, slot, choice)) throw new BadRequestException('Invalid choice for slot');

    await this.repo.setChoice(characterId, slotId, choice);
    if (choice.kind === 'subclass') await this.repo.setSubclass(characterId, choice.subclassId);

    return this.getLevelUp(accountId, characterId);
  }

  /** Resetuje všechny volby (respec). */
  async resetAll(accountId: string, characterId: string): Promise<LevelUpView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    await this.repo.resetAll(characterId);
    return this.getLevelUp(accountId, characterId);
  }
}

/** Pomocná konverze DB řádků na sdílený tvar pro agregaci progrese. */
export function toStoredChoices(
  rows: { slotId: string; choice: LevelUpChoice }[],
): StoredLevelUpChoice[] {
  return rows.map((r) => ({ slotId: r.slotId, choice: r.choice }));
}
