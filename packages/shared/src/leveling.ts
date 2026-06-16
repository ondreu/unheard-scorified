import { GOLD_REWARD_RATE, MAX_LEVEL, XP_CURVE, XP_REWARD_RATE } from './constants';

/**
 * Referenční XP/h "nejlepší dostupné" idle aktivity na daném levelu (efektivita
 * 1.0). Spolu s XP křivkou definuje tempo progrese: čas-na-level(L) =
 * xpForNextLevel(L) / referenceXpPerHour(L). Viz `docs/systems/progression.md`.
 */
export function referenceXpPerHour(level: number): number {
  if (level < 1) throw new RangeError(`level must be >= 1, got ${level}`);
  return XP_REWARD_RATE.base * Math.pow(level, XP_REWARD_RATE.levelExponent);
}

/**
 * Referenční zlato/h idle aktivity na daném levelu (efektivita 1.0) — mírnější
 * ekonomika než XP (viz `GOLD_REWARD_RATE`). Stejná kotva, jakou používá
 * kalibrace quest odměn; teď i sdílená pro generický grind (`computeGrindReward`).
 */
export function referenceGoldPerHour(level: number): number {
  if (level < 1) throw new RangeError(`level must be >= 1, got ${level}`);
  return GOLD_REWARD_RATE.base * Math.pow(level, GOLD_REWARD_RATE.levelExponent);
}

/**
 * "Perfect-chain" herní čas (h) potřebný k postupu z `level` na `level + 1`
 * (aktivní idle hráč na referenční rychlosti). 0 na capu. Pro testy/dokumentaci.
 */
export function hoursToNextLevel(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return xpForNextLevel(level) / referenceXpPerHour(level);
}

/**
 * XP potřebné pro postup z `level` na `level + 1`.
 * Záměrně strmá ("long-haul") křivka — viz XP_CURVE.
 *
 * @param level aktuální level (1..MAX_LEVEL)
 * @returns XP potřebné na další level; 0 pokud už je na capu
 */
export function xpForNextLevel(level: number): number {
  if (level < 1) throw new RangeError(`level must be >= 1, got ${level}`);
  if (level >= MAX_LEVEL) return 0;
  const { base, exponent, scale } = XP_CURVE;
  return Math.floor(base + scale * Math.pow(level, exponent));
}

/**
 * Kumulativní XP potřebné pro dosažení daného levelu z lvl 1.
 */
export function totalXpForLevel(level: number): number {
  if (level < 1) throw new RangeError(`level must be >= 1, got ${level}`);
  let total = 0;
  for (let l = 1; l < level && l < MAX_LEVEL; l++) {
    total += xpForNextLevel(l);
  }
  return total;
}

/**
 * Smluvní alias (M2): kumulativní XP potřebné pro DOSAŽENÍ daného levelu z lvl 1.
 * Stejná sémantika jako `totalXpForLevel`; pojmenování dle roadmapy.
 */
export function xpForLevel(level: number): number {
  return totalXpForLevel(level);
}

/**
 * Z celkového nasbíraného XP odvodí level a postup do dalšího levelu.
 * Deterministické — používá se na serveru i klientovi pro konzistentní zobrazení.
 */
export function levelFromTotalXp(totalXp: number): {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
} {
  if (totalXp < 0) throw new RangeError(`totalXp must be >= 0, got ${totalXp}`);
  let level = 1;
  let remaining = totalXp;
  while (level < MAX_LEVEL) {
    const need = xpForNextLevel(level);
    if (remaining < need) break;
    remaining -= need;
    level++;
  }
  return {
    level,
    xpIntoLevel: level >= MAX_LEVEL ? 0 : remaining,
    xpForNext: xpForNextLevel(level),
  };
}

/**
 * Smluvní alias (M2): level z celkového nasbíraného XP (jen číslo levelu).
 */
export function levelFromXp(totalXp: number): number {
  return levelFromTotalXp(totalXp).level;
}

/** Výsledek přidání XP — pro UI „level up" hlášku po dokončení aktivity. */
export interface XpGainResult {
  totalXp: number;
  levelBefore: number;
  levelAfter: number;
  leveledUp: boolean;
  /** Kolik levelů postava získala (0 pokud žádný). */
  levelsGained: number;
}

/**
 * Aplikuje zisk XP na dosavadní celkové XP a vrátí nový stav + info o level-upu.
 * Deterministické, čistá funkce — používá server i klient (konzistentní zobrazení).
 */
export function applyXpGain(totalXpBefore: number, xpGained: number): XpGainResult {
  if (totalXpBefore < 0) throw new RangeError(`totalXpBefore must be >= 0, got ${totalXpBefore}`);
  if (xpGained < 0) throw new RangeError(`xpGained must be >= 0, got ${xpGained}`);
  const levelBefore = levelFromXp(totalXpBefore);
  const totalXp = totalXpBefore + xpGained;
  const levelAfter = levelFromXp(totalXp);
  return {
    totalXp,
    levelBefore,
    levelAfter,
    leveledUp: levelAfter > levelBefore,
    levelsGained: levelAfter - levelBefore,
  };
}
