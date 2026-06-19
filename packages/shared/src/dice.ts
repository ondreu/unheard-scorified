/**
 * D&D 5e kostky (MR-5). Deterministická náhoda **jen přes `SeededRng`** (anti-cheat,
 * reprodukovatelnost — viz CLAUDE.md). Žádná herní logika tady; čistá kostka +
 * formátování, sdílené napříč combat enginem (attack roll, damage dice, saves).
 */
import { SeededRng } from './rng';

/** Jeden hod kostkou o `sides` stěnách → 1..sides. */
export function rollDie(rng: SeededRng, sides: number): number {
  return 1 + Math.floor(rng.next() * Math.max(1, sides));
}

/** Hod d20 (1..20). */
export function rollD20(rng: SeededRng): number {
  return rollDie(rng, 20);
}

/** Výsledek hodu více kostkami. */
export interface DiceRoll {
  /** Součet všech kostek (bez modifikátoru). */
  total: number;
  /** Jednotlivé hody (pro log/breakdown). */
  rolls: number[];
}

/** Hodí `count` kostkami o `sides` stěnách. `count <= 0` → prázdný hod (0). */
export function rollDice(rng: SeededRng, count: number, sides: number): DiceRoll {
  const rolls: number[] = [];
  let total = 0;
  for (let i = 0; i < Math.max(0, Math.floor(count)); i++) {
    const r = rollDie(rng, sides);
    rolls.push(r);
    total += r;
  }
  return { total, rolls };
}

/** Notace kostek (`count`d`sides` + `bonus`). */
export interface DiceSpec {
  count: number;
  sides: number;
  bonus: number;
}

/** Lidsky čitelná notace, např. `2d6+3`, `1d8`, `8d6-1`. */
export function diceNotation(spec: DiceSpec): string {
  const base = `${spec.count}d${spec.sides}`;
  if (spec.bonus > 0) return `${base}+${spec.bonus}`;
  if (spec.bonus < 0) return `${base}${spec.bonus}`;
  return base;
}

/** Průměrná hodnota hodu (pro kalibraci): `count * (sides+1)/2 + bonus`. */
export function diceAverage(spec: DiceSpec): number {
  return spec.count * ((spec.sides + 1) / 2) + spec.bonus;
}

/** Výsledek hodu na zásah (d20 + modifikátor). */
export interface AttackRoll {
  /** Přirozený hod d20 (1..20). */
  natural: number;
  /** Modifikátor k hodu (attack bonus). */
  modifier: number;
  /** Celkový součet (natural + modifier). */
  total: number;
  /** Přirozená 20 — automatický zásah + crit. */
  isCrit: boolean;
  /** Přirozená 1 — automatický miss. */
  isFumble: boolean;
}

/** Výhoda / nevýhoda na hodu na zásah (D&D 5e): hodí se 2× d20, vezme se vyšší/nižší. */
export type AdvantageMode = 'normal' | 'advantage' | 'disadvantage';

/**
 * Hod na zásah: d20 + `attackBonus`. Nat 20 = crit, nat 1 = fumble. `mode`
 * (D&D 5e advantage/disadvantage) hodí 2× d20 a vezme vyšší (advantage) /
 * nižší (disadvantage) — crit/fumble se vyhodnotí z vybrané kostky.
 */
export function rollAttack(
  rng: SeededRng,
  attackBonus: number,
  mode: AdvantageMode = 'normal',
): AttackRoll {
  const first = rollD20(rng);
  let natural = first;
  if (mode !== 'normal') {
    const second = rollD20(rng);
    natural = mode === 'advantage' ? Math.max(first, second) : Math.min(first, second);
  }
  return {
    natural,
    modifier: attackBonus,
    total: natural + attackBonus,
    isCrit: natural === 20,
    isFumble: natural === 1,
  };
}

/**
 * Zasáhne hod na zásah `targetAc`? Nat 20 vždy, nat 1 nikdy, jinak total >= AC
 * (D&D 5e). Jediný zdroj pravdy pro hit/miss → engine i log se nemůžou rozejít.
 */
export function attackHits(roll: AttackRoll, targetAc: number): boolean {
  if (roll.isFumble) return false;
  if (roll.isCrit) return true;
  return roll.total >= targetAc;
}

/** Výsledek záchranného hodu (d20 + save modifikátor vs DC). */
export interface SaveRoll {
  natural: number;
  modifier: number;
  total: number;
  dc: number;
  /** Uspěl záchranný hod (total >= DC)? */
  success: boolean;
}

/** Záchranný hod: d20 + `saveBonus` vs `dc`. */
export function rollSave(rng: SeededRng, saveBonus: number, dc: number): SaveRoll {
  const natural = rollD20(rng);
  const total = natural + saveBonus;
  return { natural, modifier: saveBonus, total, dc, success: total >= dc };
}

/** Formát „14 + 5 = 19" (bonus se znaménkem se nezobrazuje, jen součet). */
export function formatRoll(natural: number, modifier: number): string {
  const sign = modifier >= 0 ? '+' : '−';
  return `${natural} ${sign} ${Math.abs(modifier)} = ${natural + modifier}`;
}
