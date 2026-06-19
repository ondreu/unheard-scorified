/**
 * Typy a vzorce pro postavu. Jediný zdroj pravdy pro API i web —
 * staty se počítají deterministicky stejně na obou stranách.
 *
 * MR-1 (D&D Remaster): WoW-flavored staty (Strength/Agility/Intellect/Spirit/
 * Stamina) nahrazeny 6 D&D atributy STR/DEX/CON/INT/WIS/CHA s modifikátory
 * (`floor((score-10)/2)`). Odvozené staty počítané dle D&D 5e: proficiency bonus,
 * Armor Class, saving throw bonusy, spell save DC, spell attack bonus, initiative,
 * attack bonus. Balanc (přesné magnitudy / dice combat) se ladí v MR-5/MR-10.
 */
import { CLASSES, type ClassId } from './data/classes';
import { RACES, type RaceId } from './data/races';
import { levelFromTotalXp } from './leveling';
import { casterTypeOf, spellSlotsFor, type CasterType, type SpellSlots } from './data/spell-slots';
import { kiPointsFor, rageChargesFor } from './data/class-resources';
import type { ItemStats } from './data/items';

export type { ClassId, Role } from './data/classes';
export type { RaceId } from './data/races';

/** Šest D&D atributů (ability scores). */
export type AbilityScore =
  | 'strength'
  | 'dexterity'
  | 'constitution'
  | 'intelligence'
  | 'wisdom'
  | 'charisma';

export type AbilityScores = Record<AbilityScore, number>;

/** Pořadí atributů (pro deterministické UI/iterace). */
export const ABILITY_SCORES: readonly AbilityScore[] = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const;

/** Třípísmenné zkratky atributů (game language = EN), pro UI. */
export const ABILITY_ABBREV: Record<AbilityScore, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
};

/** Baseline atributu na lvl 1 (před rasou/classou) — legacy default (bez standard array). */
export const BASELINE_SCORE = 15;

/**
 * D&D standard array — hodnoty, které hráč rozdělí mezi 6 atributů při tvorbě
 * postavy (MR-3). Point-buy je možný follow-up.
 */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

/** Validuje, že přiřazené skóre jsou přesně permutací standard array. */
export function isValidStandardArray(scores: AbilityScores): boolean {
  const got = ABILITY_SCORES.map((k) => scores[k]).sort((a, b) => a - b);
  const want = [...STANDARD_ARRAY].sort((a, b) => a - b);
  return got.length === want.length && got.every((v, i) => v === want[i]);
}

/**
 * D&D strop ability skóre (PHB): innate skóre (standard array + rasa + ASI) nikdy
 * nepřesáhne 20. Magic items (gear) smí přidat navrch (vzácně). Per-level lineární
 * růst byl odstraněn — skóre rostou jen přes ASI (4/8/12/16/19), jako v D&D 5e
 * (gear & balance follow-up / „D&D-ifikace base"). Drží bounded accuracy.
 */
export const ABILITY_SCORE_CAP = 20;

/** D&D ability modifikátor: `floor((score - 10) / 2)`. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** D&D proficiency bonus dle levelu: `2 + floor((level - 1) / 4)` (lvl 1→+2 … lvl 20→+6). */
export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

/** Je kombinace rasy a classy povolená? */
export function isValidRaceClass(race: RaceId, klass: ClassId): boolean {
  return RACES[race]?.allowedClasses.includes(klass) ?? false;
}

/**
 * Base atributy postavy na daném levelu:
 * baseline + rasové modifikátory + bonus k primárnímu atributu classy + růst za level.
 */
export function baseStatsFor(race: RaceId, klass: ClassId, level = 1): AbilityScores {
  const raceDef = RACES[race];
  const classDef = CLASSES[klass];

  // D&D-věrné innate skóre (bez per-level růstu): baseline + rasa + class bonus,
  // clampnuto na 20. `level` ponecháno v signatuře kvůli kompatibilitě volajících
  // (skóre už na levelu nezávisí — růst plyne jen z ASI přes ProgressionEffects).
  void level;
  const stats: AbilityScores = {
    strength: BASELINE_SCORE + raceDef.statMods.strength,
    dexterity: BASELINE_SCORE + raceDef.statMods.dexterity,
    constitution: BASELINE_SCORE + raceDef.statMods.constitution,
    intelligence: BASELINE_SCORE + raceDef.statMods.intelligence,
    wisdom: BASELINE_SCORE + raceDef.statMods.wisdom,
    charisma: BASELINE_SCORE + raceDef.statMods.charisma,
  };

  // Bonus classy: +3 k primárnímu atributu, +1 constitution (výdrž).
  stats[classDef.primaryStat] += 3;
  stats.constitution += 1;

  for (const k of ABILITY_SCORES) stats[k] = Math.min(ABILITY_SCORE_CAP, stats[k]);
  return stats;
}

/**
 * Atributy postavy z jí **přiřazeného standard array** (MR-3): assigned base
 * skóre + rasové modifikátory + růst za level. Na rozdíl od `baseStatsFor` třída
 * nepřidává ke skóre (D&D — atributy plynou z array + rasy; primární výkon classy
 * řeší combat engine). Použij, když má postava uložené `baseScores`.
 */
export function abilityScoresFor(
  baseScores: AbilityScores,
  race: RaceId,
  level = 1,
): AbilityScores {
  const raceDef = RACES[race];
  // D&D-věrné: assigned array + rasové mody, clampnuto na 20. Žádný per-level růst
  // (ASI se přidává odděleně přes ProgressionEffects v combat enginu). `level`
  // ponecháno v signatuře kvůli kompatibilitě volajících.
  void level;
  const out = {} as AbilityScores;
  for (const k of ABILITY_SCORES) {
    out[k] = Math.min(ABILITY_SCORE_CAP, baseScores[k] + raceDef.statMods[k]);
  }
  return out;
}

/** Spočítá modifikátory pro všech 6 atributů. */
export function abilityModifiers(scores: AbilityScores): AbilityScores {
  return {
    strength: abilityModifier(scores.strength),
    dexterity: abilityModifier(scores.dexterity),
    constitution: abilityModifier(scores.constitution),
    intelligence: abilityModifier(scores.intelligence),
    wisdom: abilityModifier(scores.wisdom),
    charisma: abilityModifier(scores.charisma),
  };
}

/** Atribut, kterým classa sesílá kouzla (D&D spellcasting ability). */
export function spellcastingAbility(klass: ClassId): AbilityScore {
  return CLASSES[klass].spellcastingAbility;
}

/**
 * D&D 5e maximální HP (ADR 0032): hit die (na 1. levelu max) + (level−1)·(průměr
 * hit die + CON modifikátor). Min 1. Sjednocený zdroj pravdy pro `deriveStats`
 * (character sheet) i `deriveCombatProfile` (combat engine) — nemůžou se rozejít.
 */
export function dndMaxHp(hitDie: number, level: number, conMod: number): number {
  const dieAvg = Math.floor(hitDie / 2) + 1;
  return Math.max(1, hitDie + Math.max(0, level - 1) * (dieAvg + conMod));
}

export interface DerivedStats {
  health: number;
  /** Modifikátory všech 6 atributů. */
  modifiers: AbilityScores;
  /** Proficiency bonus dle levelu. */
  proficiencyBonus: number;
  /** Armor Class (10 + DEX mod; gear AC se integruje v combat enginu, MR-5). */
  armorClass: number;
  /** Initiative bonus (DEX mod). */
  initiative: number;
  /** Saving throw bonusy per atribut (zatím jen modifikátor; class proficiency v MR-2). */
  savingThrows: AbilityScores;
  /** Spell save DC: 8 + proficiency + casting modifikátor. */
  spellSaveDc: number;
  /** Spell attack bonus: proficiency + casting modifikátor. */
  spellAttackBonus: number;
  /** Útočný bonus (proficiency + lepší z STR/DEX modifikátoru). */
  attackBonus: number;
  /** Typ sesilatele (full/half/pact/none) — D&D spell sloty (MR-4). */
  casterType: CasterType;
  /** Maximální spell sloty (plně odpočaté) per tier — D&D tabulka (MR-4). */
  spellSlots: SpellSlots;
  /** Max Ki body (Monk) — class resource (ADR 0034). 0 = ne-Monk. */
  kiPoints: number;
  /** Počet rage charges (Barbarian) — class resource (ADR 0034). 0 = ne-Barbarian. */
  rageCharges: number;
}

/** Odvozené staty z atributů dle D&D 5e. Placeholder magnitudy (laděno v MR-10). */
export function deriveStats(primary: AbilityScores, level: number, klass: ClassId): DerivedStats {
  const mods = abilityModifiers(primary);
  const prof = proficiencyBonus(level);
  const castingMod = mods[CLASSES[klass].spellcastingAbility];

  // HP: literal D&D hit dice (ADR 0032) — hit die (lvl 1 max) + (level−1)·(avg + CON mod).
  const health = dndMaxHp(CLASSES[klass].hitDie, level, mods.constitution);

  return {
    health,
    modifiers: mods,
    proficiencyBonus: prof,
    armorClass: 10 + mods.dexterity,
    initiative: mods.dexterity,
    savingThrows: mods,
    spellSaveDc: 8 + prof + castingMod,
    spellAttackBonus: prof + castingMod,
    attackBonus: prof + Math.max(mods.strength, mods.dexterity),
    casterType: casterTypeOf(klass),
    spellSlots: spellSlotsFor(klass, level),
    kiPoints: kiPointsFor(klass, level),
    rageCharges: rageChargesFor(klass, level),
  };
}

/** Kompletní stav postavy odvozený z perzistovaných dat (rasa, classa, totalXp). */
export interface CharacterSheet {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  primary: AbilityScores;
  derived: DerivedStats;
  equipmentStats: ItemStats;
}

/** Sestaví character sheet z minimálních perzistovaných dat. */
export function buildCharacterSheet(
  race: RaceId,
  klass: ClassId,
  totalXp: number,
  equippedItemStats?: ItemStats,
  baseScores?: AbilityScores | null,
): CharacterSheet {
  const { level, xpIntoLevel, xpForNext } = levelFromTotalXp(totalXp);
  const primary = baseScores
    ? abilityScoresFor(baseScores, race, level)
    : baseStatsFor(race, klass, level);
  return {
    level,
    xpIntoLevel,
    xpForNext,
    primary,
    derived: deriveStats(primary, level, klass),
    equipmentStats: equippedItemStats ?? {},
  };
}

/** Pravidla pro jméno postavy. */
export const CHARACTER_NAME = { minLength: 2, maxLength: 16, pattern: /^[A-Za-zÀ-ÿ]+$/ } as const;

export function isValidCharacterName(name: string): boolean {
  return (
    name.length >= CHARACTER_NAME.minLength &&
    name.length <= CHARACTER_NAME.maxLength &&
    CHARACTER_NAME.pattern.test(name)
  );
}
