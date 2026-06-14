import { describe, expect, it } from 'vitest';
import { MAX_LEVEL } from './constants';
import { levelFromTotalXp, totalXpForLevel, xpForNextLevel } from './leveling';

describe('xpForNextLevel', () => {
  it('roste s levelem (strmá křivka)', () => {
    expect(xpForNextLevel(2)).toBeGreaterThan(xpForNextLevel(1));
    expect(xpForNextLevel(30)).toBeGreaterThan(xpForNextLevel(10));
  });

  it('vrací 0 na max levelu', () => {
    expect(xpForNextLevel(MAX_LEVEL)).toBe(0);
  });

  it('odmítá level < 1', () => {
    expect(() => xpForNextLevel(0)).toThrow(RangeError);
  });
});

describe('levelFromTotalXp', () => {
  it('0 XP = level 1', () => {
    expect(levelFromTotalXp(0).level).toBe(1);
  });

  it('je inverzní k totalXpForLevel', () => {
    for (const target of [2, 5, 20, 59, MAX_LEVEL]) {
      expect(levelFromTotalXp(totalXpForLevel(target)).level).toBe(target);
    }
  });

  it('necape přes max level', () => {
    const huge = totalXpForLevel(MAX_LEVEL) * 10;
    const r = levelFromTotalXp(huge);
    expect(r.level).toBe(MAX_LEVEL);
    expect(r.xpForNext).toBe(0);
  });
});
