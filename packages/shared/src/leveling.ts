import { MAX_LEVEL, XP_CURVE } from './constants';

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
