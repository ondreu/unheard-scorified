import { describe, expect, it } from 'vitest';
import {
  attackHits,
  diceAverage,
  diceMax,
  diceMin,
  diceNotation,
  diceRange,
  formatRoll,
  rollAttack,
  rollD20,
  rollDice,
  rollDie,
  rollSave,
} from './dice';
import { SeededRng } from './rng';

describe('dice rolls', () => {
  it('rollDie stays within 1..sides', () => {
    const rng = new SeededRng(1);
    for (let i = 0; i < 500; i++) {
      const r = rollDie(rng, 8);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(8);
    }
  });

  it('rollD20 stays within 1..20', () => {
    const rng = new SeededRng(7);
    for (let i = 0; i < 500; i++) {
      const r = rollD20(rng);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(20);
    }
  });

  it('rollDice sums and reports individual rolls', () => {
    const rng = new SeededRng(3);
    const { total, rolls } = rollDice(rng, 4, 6);
    expect(rolls).toHaveLength(4);
    expect(total).toBe(rolls.reduce((a, b) => a + b, 0));
    expect(total).toBeGreaterThanOrEqual(4);
    expect(total).toBeLessThanOrEqual(24);
  });

  it('rollDice with count <= 0 yields an empty roll', () => {
    expect(rollDice(new SeededRng(1), 0, 6)).toEqual({ total: 0, rolls: [] });
  });

  it('is deterministic for the same seed', () => {
    const a = rollDice(new SeededRng(42), 3, 8);
    const b = rollDice(new SeededRng(42), 3, 8);
    expect(a).toEqual(b);
  });
});

describe('notation + average', () => {
  it('formats dice notation with signed bonus', () => {
    expect(diceNotation({ count: 2, sides: 6, bonus: 3 })).toBe('2d6+3');
    expect(diceNotation({ count: 1, sides: 8, bonus: 0 })).toBe('1d8');
    expect(diceNotation({ count: 8, sides: 6, bonus: -1 })).toBe('8d6-1');
  });

  it('computes the mathematical average', () => {
    expect(diceAverage({ count: 2, sides: 6, bonus: 0 })).toBe(7);
    expect(diceAverage({ count: 1, sides: 20, bonus: 5 })).toBe(15.5);
  });

  it('formatRoll renders natural + modifier = total', () => {
    expect(formatRoll(14, 5)).toBe('14 + 5 = 19');
    expect(formatRoll(3, -2)).toBe('3 − 2 = 1');
  });

  it('diceMin/diceMax bound the roll (all 1s / all max)', () => {
    expect(diceMin({ count: 8, sides: 6, bonus: 0 })).toBe(8);
    expect(diceMax({ count: 8, sides: 6, bonus: 0 })).toBe(48);
    expect(diceMin({ count: 3, sides: 4, bonus: 3 })).toBe(6);
    expect(diceMax({ count: 3, sides: 4, bonus: 3 })).toBe(15);
  });

  it('diceMin clamps to 0 with negative bonus', () => {
    expect(diceMin({ count: 1, sides: 4, bonus: -5 })).toBe(0);
  });

  it('diceRange formats min–max, single value when no variance', () => {
    expect(diceRange({ count: 8, sides: 6, bonus: 0 })).toBe('8–48');
    expect(diceRange({ count: 0, sides: 6, bonus: 4 })).toBe('4');
  });

  it('min/max bracket an actual roll for the same spec', () => {
    const spec = { count: 4, sides: 6, bonus: 2 };
    const rng = new SeededRng(11);
    for (let i = 0; i < 200; i++) {
      const total = rollDice(rng, spec.count, spec.sides).total + spec.bonus;
      expect(total).toBeGreaterThanOrEqual(diceMin(spec));
      expect(total).toBeLessThanOrEqual(diceMax(spec));
    }
  });
});

describe('attack roll vs AC (D&D 5e)', () => {
  it('nat 20 always hits and crits; nat 1 always misses', () => {
    // hledej seedy produkující nat 20 a nat 1
    let sawCrit = false;
    let sawFumble = false;
    for (let s = 0; s < 200 && !(sawCrit && sawFumble); s++) {
      const roll = rollAttack(new SeededRng(s), 0);
      if (roll.natural === 20) {
        expect(roll.isCrit).toBe(true);
        expect(attackHits(roll, 99)).toBe(true); // i proti nedosažitelné AC
        sawCrit = true;
      }
      if (roll.natural === 1) {
        expect(roll.isFumble).toBe(true);
        expect(attackHits(roll, 1)).toBe(false); // i proti AC 1
        sawFumble = true;
      }
    }
    expect(sawCrit && sawFumble).toBe(true);
  });

  it('hits when total >= AC', () => {
    const roll = { natural: 12, modifier: 5, total: 17, isCrit: false, isFumble: false };
    expect(attackHits(roll, 17)).toBe(true);
    expect(attackHits(roll, 18)).toBe(false);
  });

  it('advantage takes the higher d20, disadvantage the lower (ADR 0036)', () => {
    // Stejný seed: advantage ≥ normal-první-kostka, disadvantage ≤ advantage.
    let advSum = 0;
    let disSum = 0;
    const n = 400;
    for (let s = 0; s < n; s++) {
      advSum += rollAttack(new SeededRng(s), 0, 'advantage').natural;
      disSum += rollAttack(new SeededRng(s), 0, 'disadvantage').natural;
    }
    // Teoretické průměry: advantage ≈ 13.825, disadvantage ≈ 7.175 (přes shodné páry).
    expect(advSum / n).toBeGreaterThan(disSum / n);
    expect(advSum / n).toBeGreaterThan(11);
    expect(disSum / n).toBeLessThan(10);
  });

  it('advantage/disadvantage are deterministic for the same seed', () => {
    expect(rollAttack(new SeededRng(5), 3, 'advantage')).toEqual(
      rollAttack(new SeededRng(5), 3, 'advantage'),
    );
  });
});

describe('saving throws', () => {
  it('succeeds when total >= DC', () => {
    let sawSuccess = false;
    let sawFail = false;
    for (let s = 0; s < 100; s++) {
      const save = rollSave(new SeededRng(s), 3, 14);
      expect(save.total).toBe(save.natural + 3);
      expect(save.success).toBe(save.total >= 14);
      if (save.success) sawSuccess = true;
      else sawFail = true;
    }
    expect(sawSuccess).toBe(true);
    expect(sawFail).toBe(true);
  });
});
