import { describe, expect, it } from 'vitest';
import {
  attackHits,
  diceAverage,
  diceNotation,
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
