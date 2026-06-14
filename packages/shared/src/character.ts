/**
 * Typy a vzorce pro postavu. Jediný zdroj pravdy pro API i web —
 * staty se počítají deterministicky stejně na obou stranách.
 */
import { CLASSES, type ClassId, type ResourceType } from './data/classes';
import { RACES, type Faction, type RaceId } from './data/races';
import { levelFromTotalXp } from './leveling';

export type { ClassId, ResourceType, Role } from './data/classes';
export type { Faction, RaceId } from './data/races';

/** Pět primárních atributů (vanilla model). */
export type PrimaryStat = 'strength' | 'agility' | 'stamina' | 'intellect' | 'spirit';

export type PrimaryStats = Record<PrimaryStat, number>;

/** Baseline primárních statů na lvl 1 (před rasou/classou). */
export const BASELINE_STAT = 15;

/** Přírůstek primárního atributu na level (jednoduchý lineární růst). */
const PER_LEVEL_GROWTH = 1;

/** Je kombinace rasy a classy povolená (vanilla omezení)? */
export function isValidRaceClass(race: RaceId, klass: ClassId): boolean {
  return RACES[race]?.allowedClasses.includes(klass) ?? false;
}

/** Frakce dané rasy (zatím kosmetická). */
export function factionOf(race: RaceId): Faction {
  return RACES[race].faction;
}

/**
 * Base primární staty postavy na daném levelu:
 * baseline + rasové modifikátory + bonus k primárnímu atributu classy + růst za level.
 */
export function baseStatsFor(race: RaceId, klass: ClassId, level = 1): PrimaryStats {
  const raceDef = RACES[race];
  const classDef = CLASSES[klass];
  const growth = (level - 1) * PER_LEVEL_GROWTH;

  const stats: PrimaryStats = {
    strength: BASELINE_STAT + raceDef.statMods.strength + growth,
    agility: BASELINE_STAT + raceDef.statMods.agility + growth,
    stamina: BASELINE_STAT + raceDef.statMods.stamina + growth,
    intellect: BASELINE_STAT + raceDef.statMods.intellect + growth,
    spirit: BASELINE_STAT + raceDef.statMods.spirit + growth,
  };

  // Bonus classy: +3 k primárnímu atributu, +1 stamina.
  stats[classDef.primaryStat] += 3;
  stats.stamina += 1;

  return stats;
}

export interface DerivedStats {
  health: number;
  resource: { type: ResourceType; max: number };
}

/** Odvozené staty (health, resource) z primárních. Placeholder balanc (laděno později). */
export function deriveStats(primary: PrimaryStats, level: number, klass: ClassId): DerivedStats {
  const resourceType = CLASSES[klass].resource;
  const health = 50 + primary.stamina * 10 + level * 5;

  let max: number;
  switch (resourceType) {
    case 'mana':
      max = 100 + primary.intellect * 15;
      break;
    case 'energy':
      max = 100;
      break;
    case 'rage':
      max = 100;
      break;
  }

  return { health, resource: { type: resourceType, max } };
}

/** Kompletní stav postavy odvozený z perzistovaných dat (rasa, classa, totalXp). */
export interface CharacterSheet {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  faction: Faction;
  primary: PrimaryStats;
  derived: DerivedStats;
}

/** Sestaví character sheet z minimálních perzistovaných dat. */
export function buildCharacterSheet(race: RaceId, klass: ClassId, totalXp: number): CharacterSheet {
  const { level, xpIntoLevel, xpForNext } = levelFromTotalXp(totalXp);
  const primary = baseStatsFor(race, klass, level);
  return {
    level,
    xpIntoLevel,
    xpForNext,
    faction: factionOf(race),
    primary,
    derived: deriveStats(primary, level, klass),
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
