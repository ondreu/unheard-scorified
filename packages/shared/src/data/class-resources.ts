/**
 * Class resources (ADR 0034, Slice 3) — **non-caster zdroje** sjednocené na D&D 5e,
 * bez návratu k zrušenému `ResourceType` proxy:
 *
 * - **Ki** (Monk) — bodový pool (≈ úroveň); Monkovy techniky stojí Ki (`kiCost`).
 *   Per-encounter v idle auto-resolve, per-run v Gauntletu (jako spell sloty).
 * - **Rage** (Barbarian) — omezené použití/odpočinek; během rage **resistance na
 *   fyzické poškození** (×0.5 bludgeoning/piercing/slashing) + flat damage bonus.
 *   V idle modelu se rage **auto-zapne na začátku encounteru** (charge-gated),
 *   aplikováno jako varianta aktéra (`applyRage`) → projde centrálním `computeHit`.
 * - **Pact Magic** (Warlock) — řeší spell sloty (caster type `pact`); „short rest"
 *   recharge granularita je v Gauntletu (per-wave reset), idle módy mají sloty
 *   per-encounter (de facto short rest) už ze Slice 2.
 *
 * Magnitudy jsou D&D 5e (laditelné — čísla, ne model).
 */
import type { ClassId } from './classes';
import type { DamageType } from './damage';

/**
 * Ki body Monka = úroveň (D&D 5e: „ki points equal to your monk level"). Ostatní
 * třídy 0. Pool je per-encounter (idle) / per-run (Gauntlet) rozpočet, který
 * Monkovy techniky (`SignatureAbility.kiCost`) čerpají; bez Ki → základní úder.
 */
export function kiPointsFor(klass: ClassId, level: number): number {
  return klass === 'monk' ? Math.max(0, level) : 0;
}

/**
 * Počet použití Rage za odpočinek (D&D 5e tabulka): 2 (lvl 1–2), 3 (3–5), 4 (6–11),
 * 5 (12–16), 6 (17+). Ostatní třídy 0. V idle modelu = rozpočet „kolikrát se umím
 * rozzuřit" (per-encounter idle = prakticky vždy; per-run v Gauntletu = rationing).
 */
export function rageChargesFor(klass: ClassId, level: number): number {
  if (klass !== 'barbarian') return 0;
  if (level >= 17) return 6;
  if (level >= 12) return 5;
  if (level >= 6) return 4;
  if (level >= 3) return 3;
  return 2;
}

/** Rage damage bonus (D&D 5e): +2 (lvl 1–8), +3 (9–15), +4 (16+). Flat na útok. */
export function rageDamageBonus(level: number): number {
  if (level >= 16) return 4;
  if (level >= 9) return 3;
  return 2;
}

/** Typy poškození, vůči nimž má rozzuřený Barbarian resistance (×0.5). D&D 5e. */
export const RAGE_RESIST_TYPES: readonly DamageType[] = ['bludgeoning', 'piercing', 'slashing'];
