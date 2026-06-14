/**
 * Globální herní konstanty. Jediný zdroj pravdy pro FE i BE.
 * Balanc se ladí ZDE — nikdy nehardcodovat hodnoty jinde.
 */

/** Maximální dosažitelný level (vanilla cap). */
export const MAX_LEVEL = 60;

/**
 * Ladicí parametry XP křivky. Křivka je záměrně "long-haul" —
 * dosažení MAX_LEVEL má trvat dlouho a být hlavní dlouhodobou metou.
 * Viz `leveling.ts`.
 */
export const XP_CURVE = {
  /** Základní XP pro postup z lvl 1 na 2. */
  base: 100,
  /** Mocninový exponent růstu nákladu (vyšší = strmější/pomalejší). */
  exponent: 2.4,
  /** Lineární multiplikátor aplikovaný na celý vzorec. */
  scale: 8,
} as const;
