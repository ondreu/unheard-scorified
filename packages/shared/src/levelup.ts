/**
 * D&D level-up systém (MR-2, nahrazuje WoW talent stromy). Při level-upu hráč
 * dostává „sloty" volby:
 *  - **subclass** — jednorázová volba subclass na `CLASSES[klass].subclassLevel`.
 *  - **ASI / Feat** — na D&D ASI levelech (4/8/12/16/19) volí buď Ability Score
 *    Improvement (+2 do jednoho atributu, nebo +1/+1 do dvou), nebo Feat.
 *
 * Volby se ukládají per postava (API: `character_levelup_choices`). Tato funkce
 * je agreguje do `ProgressionEffects` (statBonus + healthBonus + combat tagy) —
 * **stejný tvar, jaký dřív produkovaly talenty** → combat engine se nemění.
 *
 * Spell sloty + nová kouzla per level (D&D tabulka) přijdou v MR-4.
 */
import type { AbilityScore } from './character';
import { ABILITY_SCORES } from './character';
import { CLASSES, isSubclassOf, type ClassId, type SubclassId } from './data/classes';
import { FEATS, type FeatId } from './data/feats';

/** D&D 5e ASI/Feat levely (zjednodušeno; class-specific extra sloty = follow-up). */
export const ASI_LEVELS = [4, 8, 12, 16, 19] as const;

export type LevelUpSlotType = 'subclass' | 'asi_or_feat';

/** Jeden nárok na volbu, který postava na svém levelu má. */
export interface LevelUpSlot {
  /** Stabilní id slotu (např. `subclass`, `asi@4`). */
  id: string;
  type: LevelUpSlotType;
  /** Level, na kterém se slot odemyká. */
  level: number;
}

/** Volba ASI: rozdělení +2 mezi atributy (1×+2 nebo 2×+1). */
export interface AsiChoice {
  kind: 'asi';
  increases: Partial<Record<AbilityScore, number>>;
}
/** Volba Feat. */
export interface FeatChoice {
  kind: 'feat';
  featId: FeatId;
}
/** Volba subclass. */
export interface SubclassChoice {
  kind: 'subclass';
  subclassId: SubclassId;
}

export type LevelUpChoice = AsiChoice | FeatChoice | SubclassChoice;

/** Uložená volba (slot id → volba). */
export interface StoredLevelUpChoice {
  slotId: string;
  choice: LevelUpChoice;
}

export interface ProgressionEffects {
  statBonus: Partial<Record<AbilityScore, number>>;
  healthBonus: number;
  /** Combat tagy (crit/haste/damage/lifesteal/shield) — viz `COMBAT_TAG_EFFECTS`. */
  tags: { tag: string; ranks: number }[];
}

/** Sloty volby, na které má postava dané třídy a levelu nárok. */
export function levelUpSlots(klass: ClassId, level: number): LevelUpSlot[] {
  const slots: LevelUpSlot[] = [];
  const subLevel = CLASSES[klass].subclassLevel;
  if (level >= subLevel) {
    slots.push({ id: 'subclass', type: 'subclass', level: subLevel });
  }
  for (const lvl of ASI_LEVELS) {
    if (level >= lvl) slots.push({ id: `asi@${lvl}`, type: 'asi_or_feat', level: lvl });
  }
  return slots;
}

/** Validuje, že ASI rozdává přesně +2 (jako 1×+2 nebo 2×+1), max +2 do atributu. */
export function isValidAsi(increases: Partial<Record<AbilityScore, number>>): boolean {
  let total = 0;
  for (const key of ABILITY_SCORES) {
    const v = increases[key] ?? 0;
    if (!Number.isInteger(v) || v < 0 || v > 2) return false;
    total += v;
  }
  return total === 2;
}

/** Je volba platná pro daný slot dané třídy? */
export function isValidChoice(klass: ClassId, slot: LevelUpSlot, choice: LevelUpChoice): boolean {
  if (slot.type === 'subclass') {
    return choice.kind === 'subclass' && isSubclassOf(klass, choice.subclassId);
  }
  // asi_or_feat
  if (choice.kind === 'asi') return isValidAsi(choice.increases);
  if (choice.kind === 'feat') return choice.featId in FEATS;
  return false;
}

/** Vybraná subclass z uložených voleb (nebo null). */
export function selectedSubclass(choices: readonly StoredLevelUpChoice[]): SubclassId | null {
  const c = choices.find((c) => c.choice.kind === 'subclass');
  return c && c.choice.kind === 'subclass' ? c.choice.subclassId : null;
}

/**
 * Agreguje uložené level-up volby do `ProgressionEffects` (statBonus z ASI +
 * featů, healthBonus a combat tagy z featů). Subclass se neagreguje (řeší
 * abilit kit ve `resolveAbilities`).
 */
export function aggregateProgression(choices: readonly StoredLevelUpChoice[]): ProgressionEffects {
  const statBonus: Partial<Record<AbilityScore, number>> = {};
  let healthBonus = 0;
  const tagMap = new Map<string, number>();

  const addStat = (k: AbilityScore, v: number): void => {
    statBonus[k] = (statBonus[k] ?? 0) + v;
  };

  for (const { choice } of choices) {
    if (choice.kind === 'asi') {
      for (const key of ABILITY_SCORES) {
        const v = choice.increases[key] ?? 0;
        if (v) addStat(key, v);
      }
    } else if (choice.kind === 'feat') {
      const feat = FEATS[choice.featId];
      if (!feat) continue;
      const eff = feat.effect;
      if (eff.statBonus) {
        for (const key of ABILITY_SCORES) {
          const v = eff.statBonus[key] ?? 0;
          if (v) addStat(key, v);
        }
      }
      healthBonus += eff.healthBonus ?? 0;
      for (const { tag, ranks } of eff.combatTags ?? []) {
        tagMap.set(tag, (tagMap.get(tag) ?? 0) + ranks);
      }
    }
  }

  return {
    statBonus,
    healthBonus,
    tags: [...tagMap].map(([tag, ranks]) => ({ tag, ranks })),
  };
}

/** Prázdná progrese (žádné volby) — pro lvl 1 / default. */
export const EMPTY_PROGRESSION: ProgressionEffects = { statBonus: {}, healthBonus: 0, tags: [] };
