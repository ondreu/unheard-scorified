import { Injectable, NotFoundException } from '@nestjs/common';
import {
  availableSlots,
  buildCharacterSheet,
  longRest,
  spellcastingAbility,
  spellbookFor,
  totalSpellSlots,
  type AbilityScore,
  type AbilityScores,
  type CasterType,
  type ClassId,
  type RaceId,
  type Spellbook,
  type SpellSlots,
  type SubclassId,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';

/** Jeden tier slotů: maximum (plně odpočatý) vs. aktuálně dostupné. */
export interface SpellSlotTierView {
  tier: number;
  max: number;
  available: number;
}

export interface SpellView {
  characterId: string;
  level: number;
  casterType: CasterType;
  /** D&D atribut, kterým postava sesílá kouzla (null pro non-castery). */
  spellcastingAbility: AbilityScore | null;
  spellSaveDc: number;
  spellAttackBonus: number;
  /** Sloty per tier (vzestupně) — max vs. dostupné po odečtení vyčerpaných. */
  slots: SpellSlotTierView[];
  totalMax: number;
  totalAvailable: number;
  /** Plně odpočatá (žádné vyčerpané sloty)? */
  rested: boolean;
  /** Spellbook — cantripy + známá kouzla seskupená po tieru. */
  spellbook: Spellbook;
}

@Injectable()
export class SpellService {
  constructor(private readonly characters: CharacterRepository) {}

  /** Spellbook + stav spell slotů postavy (max/available, rested). */
  async getSpells(accountId: string, characterId: string): Promise<SpellView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    return this.toView(character.id, {
      race: character.race,
      klass: character.class as ClassId,
      subclass: character.subclass ?? null,
      totalXp: character.totalXp,
      baseScores: character.baseScores,
      spent: character.spentSpellSlots ?? {},
    });
  }

  /**
   * Long Rest — plně dobije spell sloty (reset vyčerpaných). Manuální odpočinek
   * (návrat z aktivity dobíjí automaticky při claimu). Idempotentní.
   */
  async longRest(accountId: string, characterId: string): Promise<SpellView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    await this.characters.setSpentSpellSlots(character.id, longRest());
    return this.toView(character.id, {
      race: character.race,
      klass: character.class as ClassId,
      subclass: character.subclass ?? null,
      totalXp: character.totalXp,
      baseScores: character.baseScores,
      spent: {},
    });
  }

  private toView(
    characterId: string,
    c: {
      race: RaceId;
      klass: ClassId;
      subclass: SubclassId | null;
      totalXp: number;
      baseScores: AbilityScores | null;
      spent: SpellSlots;
    },
  ): SpellView {
    const sheet = buildCharacterSheet(c.race, c.klass, c.totalXp, undefined, c.baseScores);
    const max = sheet.derived.spellSlots;
    const avail = availableSlots(max, c.spent);

    const slots: SpellSlotTierView[] = Object.keys(max)
      .map(Number)
      .sort((a, b) => a - b)
      .map((tier) => ({ tier, max: max[tier] ?? 0, available: avail[tier] ?? 0 }));

    const totalMax = totalSpellSlots(max);
    const totalAvailable = totalSpellSlots(avail);
    const casterType = sheet.derived.casterType;

    return {
      characterId,
      level: sheet.level,
      casterType,
      spellcastingAbility: casterType === 'none' ? null : spellcastingAbility(c.klass),
      spellSaveDc: sheet.derived.spellSaveDc,
      spellAttackBonus: sheet.derived.spellAttackBonus,
      slots,
      totalMax,
      totalAvailable,
      rested: totalAvailable === totalMax,
      spellbook: spellbookFor(c.klass, c.subclass, sheet.level),
    };
  }
}
