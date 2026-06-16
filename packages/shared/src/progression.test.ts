import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_DURATION_BOUNDS,
  ACTIVITY_EFFICIENCY,
  MAX_LEVEL,
  TARGET_HOURS_TO_CAP,
} from './constants';
import { hoursToNextLevel, referenceXpPerHour, xpForNextLevel } from './leveling';
import { activityEfficiency } from './activity';
import { QUESTS, QUEST_IDS } from './data/quests';

/**
 * Balanc kontrakt M9 (viz `docs/systems/progression.md`). Tyto invarianty drží
 * progresi v navrženém okně (cap ≈ 2200 h perfect-chain, early rychlé / late
 * pomalé) a vynucují, že nové questy zůstanou kalibrované na referenční rychlost.
 */
describe('progrese — cíl času na cap', () => {
  const totalHours = (() => {
    let h = 0;
    for (let l = 1; l < MAX_LEVEL; l++) h += hoursToNextLevel(l);
    return h;
  })();

  it('perfect-chain čas 1→60 je blízko cíle (±2 %)', () => {
    expect(totalHours).toBeGreaterThan(TARGET_HOURS_TO_CAP * 0.98);
    expect(totalHours).toBeLessThan(TARGET_HOURS_TO_CAP * 1.02);
  });

  it('tvar: čas-na-level roste monotonně (early rychlé, late pomalé)', () => {
    for (let l = 2; l < MAX_LEVEL; l++) {
      expect(hoursToNextLevel(l)).toBeGreaterThan(hoursToNextLevel(l - 1));
    }
  });

  it('lvl 10 ≈ 22 h (early fáze rychlá)', () => {
    let h = 0;
    for (let l = 1; l < 10; l++) h += hoursToNextLevel(l);
    expect(h).toBeGreaterThan(18);
    expect(h).toBeLessThan(28);
  });

  it('rozložení: 1–10 je malý zlomek, 50–60 dominuje', () => {
    const band = (a: number, b: number) => {
      let h = 0;
      for (let l = a; l < b; l++) h += hoursToNextLevel(l);
      return h;
    };
    expect(band(1, 10) / totalHours).toBeLessThan(0.05);
    expect(band(50, 60) / totalHours).toBeGreaterThan(0.3);
  });

  it('referenční XP/h roste s levelem', () => {
    expect(referenceXpPerHour(60)).toBeGreaterThan(referenceXpPerHour(1));
    expect(referenceXpPerHour(10)).toBeGreaterThan(referenceXpPerHour(5));
  });

  it('xpForNextLevel je striktně rostoucí do capu a 0 na capu', () => {
    for (let l = 2; l < MAX_LEVEL; l++) {
      expect(xpForNextLevel(l)).toBeGreaterThan(xpForNextLevel(l - 1));
    }
    expect(xpForNextLevel(MAX_LEVEL)).toBe(0);
  });
});

describe('activityEfficiency', () => {
  const { minSec, maxSec } = ACTIVITY_DURATION_BOUNDS;
  const { short, long } = ACTIVITY_EFFICIENCY;

  it('endpointy: krátké = plná, dlouhé = punish', () => {
    expect(activityEfficiency(minSec)).toBe(short);
    expect(activityEfficiency(maxSec)).toBe(long);
  });

  it('clampuje mimo rozsah', () => {
    expect(activityEfficiency(0)).toBe(short);
    expect(activityEfficiency(minSec - 100)).toBe(short);
    expect(activityEfficiency(maxSec + 100_000)).toBe(long);
  });

  it('uvnitř rozsahu klesá monotonně mezi short a long', () => {
    let prev = short + 1e-9;
    for (let d = minSec; d <= maxSec; d += 300) {
      const e = activityEfficiency(d);
      expect(e).toBeLessThanOrEqual(prev);
      expect(e).toBeGreaterThanOrEqual(long);
      prev = e;
    }
  });

  it('střed rozsahu je zhruba uprostřed (≈0.9)', () => {
    expect(activityEfficiency((minSec + maxSec) / 2)).toBeCloseTo((short + long) / 2, 5);
  });
});

describe('quest balanc — délka & kalibrace odměn', () => {
  it('všechny questy mají délku v idle cadence rozsahu [5 min, 3 h]', () => {
    for (const id of QUEST_IDS) {
      const q = QUESTS[id]!;
      expect(q.durationSec).toBeGreaterThanOrEqual(ACTIVITY_DURATION_BOUNDS.minSec);
      expect(q.durationSec).toBeLessThanOrEqual(ACTIVITY_DURATION_BOUNDS.maxSec);
    }
  });

  it('baseXp ≈ referenceXpPerHour(requiredLevel) × hodiny (±5 %)', () => {
    for (const id of QUEST_IDS) {
      const q = QUESTS[id]!;
      const expected = referenceXpPerHour(q.requiredLevel) * (q.durationSec / 3600);
      expect(q.baseXp).toBeGreaterThan(expected * 0.95);
      expect(q.baseXp).toBeLessThan(expected * 1.05);
    }
  });
});
