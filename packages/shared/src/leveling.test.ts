import { describe, expect, it } from 'vitest';
import { MAX_LEVEL } from './constants';
import {
  applyXpGain,
  levelFromTotalXp,
  levelFromXp,
  totalXpForLevel,
  xpForLevel,
  xpForNextLevel,
} from './leveling';

describe('xpForNextLevel', () => {
  it('roste s levelem (strmá křivka)', () => {
    expect(xpForNextLevel(2)).toBeGreaterThan(xpForNextLevel(1));
    expect(xpForNextLevel(15)).toBeGreaterThan(xpForNextLevel(5));
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
    for (const target of [2, 5, 15, 19, MAX_LEVEL]) {
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

describe('smluvní aliasy xpForLevel / levelFromXp', () => {
  it('xpForLevel = totalXpForLevel', () => {
    for (const lvl of [1, 2, 10, 15, MAX_LEVEL]) {
      expect(xpForLevel(lvl)).toBe(totalXpForLevel(lvl));
    }
  });

  it('levelFromXp = levelFromTotalXp().level', () => {
    for (const xp of [0, 50, 5000, 1_000_000]) {
      expect(levelFromXp(xp)).toBe(levelFromTotalXp(xp).level);
    }
  });
});

describe('applyXpGain', () => {
  it('bez level-upu jen přičte XP', () => {
    const r = applyXpGain(0, 10);
    expect(r.totalXp).toBe(10);
    expect(r.leveledUp).toBe(false);
    expect(r.levelsGained).toBe(0);
  });

  it('detekuje level-up přes hranici', () => {
    const need = xpForLevel(2); // XP na dosažení lvl 2
    const r = applyXpGain(need - 1, 5);
    expect(r.levelBefore).toBe(1);
    expect(r.levelAfter).toBe(2);
    expect(r.leveledUp).toBe(true);
    expect(r.levelsGained).toBe(1);
  });

  it('zvládne víc levelů najednou', () => {
    const r = applyXpGain(0, xpForLevel(5));
    expect(r.levelAfter).toBe(5);
    expect(r.levelsGained).toBe(4);
  });

  it('odmítá záporné vstupy', () => {
    expect(() => applyXpGain(-1, 0)).toThrow(RangeError);
    expect(() => applyXpGain(0, -1)).toThrow(RangeError);
  });
});
