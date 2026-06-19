import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  availableSlots,
  buildCharacterSheet,
  defaultPreparedSpellIds,
  isCaster,
  isValidPreparedSelection,
  levelFromXp,
  longRest,
  preparedLimits,
  spellcastingAbility,
  spellbookFor,
  spellPoolFor,
  totalSpellSlots,
  type AbilityScore,
  type AbilityScores,
  type CasterType,
  type ClassId,
  type PreparedLimits,
  type RaceId,
  type Spellbook,
  type SpellbookEntry,
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
  /** Kniha kouzel (ADR 0039) — nabídka volitelných kouzel (cantripy / leveled). */
  pool: { cantrips: SpellbookEntry[]; leveled: SpellbookEntry[] };
  /** Aktuálně připravená (aktivní) kouzla — ids. Bez uložené volby = legacy default. */
  prepared: string[];
  /** Má postava vlastní uloženou volbu (vs. legacy auto default)? */
  preparedExplicit: boolean;
  /** Limity připravených kouzel (cantripy / leveled). */
  limits: PreparedLimits;
  /** Lze teď přehodit kouzla? (zdarma při Long Rest — tj. plně odpočatá). */
  canEdit: boolean;
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
      prepared: character.preparedSpells ?? null,
    });
  }

  /**
   * Uloží aktivní (prepared) kouzla z Knihy kouzel (ADR 0039). Swap je zdarma,
   * ale jen při **Long Rest** (postava musí být plně odpočatá — žádné vyčerpané
   * sloty). Validuje výběr proti poolu classy + limitům.
   */
  async setPrepared(
    accountId: string,
    characterId: string,
    ids: string[],
  ): Promise<SpellView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const klass = character.class as ClassId;
    const level = levelFromXp(character.totalXp);
    if (!isCaster(klass)) {
      throw new BadRequestException('This class does not prepare spells.');
    }
    const spent = character.spentSpellSlots ?? {};
    if (totalSpellSlots(spent) > 0) {
      throw new BadRequestException('Take a Long Rest before re-preparing your spells.');
    }
    if (!isValidPreparedSelection(klass, level, ids)) {
      throw new BadRequestException('Invalid spell selection (out of pool or over the limit).');
    }

    await this.characters.setPreparedSpells(characterId, ids);
    return this.toView(characterId, {
      race: character.race,
      klass,
      subclass: character.subclass ?? null,
      totalXp: character.totalXp,
      baseScores: character.baseScores,
      spent,
      prepared: ids,
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
      prepared: character.preparedSpells ?? null,
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
      prepared: string[] | null;
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
    const rested = totalAvailable === totalMax;

    const pool = spellPoolFor(c.klass, sheet.level);
    const prepared = c.prepared ?? defaultPreparedSpellIds(c.klass, sheet.level);

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
      rested,
      spellbook: spellbookFor(c.klass, c.subclass, sheet.level),
      pool,
      prepared,
      preparedExplicit: c.prepared != null,
      limits: preparedLimits(c.klass, sheet.level),
      canEdit: casterType !== 'none' && rested,
    };
  }
}
