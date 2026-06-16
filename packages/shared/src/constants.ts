/**
 * Globální herní konstanty. Jediný zdroj pravdy pro FE i BE.
 * Balanc se ladí ZDE — nikdy nehardcodovat hodnoty jinde.
 */

/** Maximální dosažitelný level (vanilla cap). */
export const MAX_LEVEL = 60;

/**
 * Ladicí parametry XP křivky. Křivka je záměrně "long-haul" — dosažení
 * MAX_LEVEL má trvat dlouho a být hlavní dlouhodobou metou (rozhodnutí PM).
 *
 * Model (viz `docs/systems/progression.md`):
 *   xpForNextLevel(L) = floor(base + scale * L^exponent)
 *
 * Kalibrace M9 balanc pass: `scale`/`exponent` jsou odvozené tak, aby cesta
 * 1→60 trvala ~2200 h "perfect-chain" herního času (aktivní idle hráč, který
 * při každé kontrole hned zařadí další aktivitu) s tvarem time(L) ∝ L^1.5 —
 * early rychlé, plynule pomalejší (lvl 10 ≈ 22 h, cap ≈ 3–5 měsíců kalendářně).
 *
 * Odvození: time(L) = xpForNext(L) / referenceXpPerHour(L). Při
 * referenceXpPerHour(L) = XP_REWARD_RATE.base * L^XP_REWARD_RATE.levelExponent
 * (= 600 * L^0.5) vyjde xpForNext(L) = scale * L^2 a time(L) ∝ L^1.5. Proto
 * exponent = 2.0 a scale = 2200h_coeff * 600 ≈ 120.8.
 */
export const XP_CURVE = {
  /** Aditivní základ (drží lvl 1 nad nulou; pacing určuje scale·L^exponent). */
  base: 0,
  /** Mocninový exponent růstu nákladu (2.0 → time-per-level ∝ L^1.5). */
  exponent: 2.0,
  /** Lineární multiplikátor; kalibrováno na ~2200 h perfect-chain do capu. */
  scale: 120.8,
} as const;

/**
 * Referenční XP rychlost (XP za hodinu) "nejlepší dostupné" idle aktivity na
 * daném levelu při efektivitě 1.0. Roste mírně s levelem (√L) → vyšší questy
 * dávají větší XP čísla, ale tempo (čas-na-level) určuje XP_CURVE. Slouží jako
 * kotva pro odvození odměn questů a pro testy progrese.
 */
export const XP_REWARD_RATE = {
  /** XP/h na levelu 1 (efektivita 1.0). */
  base: 600,
  /** Mocninový exponent škálování rychlosti s levelem (√L). */
  levelExponent: 0.5,
} as const;

/** Referenční gold rychlost (zlato/h) idle aktivity; mírnější ekonomika než XP. */
export const GOLD_REWARD_RATE = {
  base: 40,
  levelExponent: 0.5,
} as const;

/**
 * Hranice délky idle aktivit (sekundy). Idle cadence = "kontrola párkrát
 * denně" → nejkratší běh 5 min (nedá se babysittovat po minutě), nejdelší 3 h
 * (set & forget přes pauzu). Rozhodnutí PM (M9 balanc pass).
 */
export const ACTIVITY_DURATION_BOUNDS = {
  /** Nejkratší smysluplná aktivita (s). */
  minSec: 300,
  /** Nejdelší aktivita (s). */
  maxSec: 10800,
} as const;

/**
 * Efektivita odměny dle délky běhu (mírný "punish" za dlouhý běh). Lineárně:
 * `minSec` → 1.0 (plná odměna k času), `maxSec` → 0.8. Aktivní hráč může mírně
 * víc, idle hráč obětuje ~20 % za pohodlí (rozhodnutí PM). Viz `activityEfficiency`.
 */
export const ACTIVITY_EFFICIENCY = {
  /** Efektivita při (a pod) `ACTIVITY_DURATION_BOUNDS.minSec`. */
  short: 1.0,
  /** Efektivita při (a nad) `ACTIVITY_DURATION_BOUNDS.maxSec`. */
  long: 0.8,
} as const;

/**
 * Cílový "perfect-chain" herní čas (h) na dosažení MAX_LEVEL — kotva balancu
 * progrese (rozhodnutí PM). Slouží testům a dokumentaci (`progression.md`).
 */
export const TARGET_HOURS_TO_CAP = 2200;
