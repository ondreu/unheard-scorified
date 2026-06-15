import { describe, expect, it } from 'vitest';
import { dailyPeriodId, GOALS, goalById, periodId, periodStartMs, weeklyPeriodId } from './goals';

describe('goals', () => {
  const T = Date.UTC(2026, 5, 17, 14, 30, 0); // středa

  it('katalog má unikátní id a kladné cíle/odměny', () => {
    const ids = GOALS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of GOALS) {
      expect(g.target).toBeGreaterThan(0);
      expect(g.rewardGold).toBeGreaterThan(0);
    }
  });

  it('goalById najde definici', () => {
    expect(goalById('daily_quests_3')?.period).toBe('daily');
    expect(goalById('nope')).toBeUndefined();
  });

  it('denní id a začátek jsou UTC půlnoc', () => {
    expect(dailyPeriodId(T)).toBe('2026-06-17');
    expect(periodStartMs('daily', T)).toBe(Date.UTC(2026, 5, 17));
    expect(periodId('daily', T)).toBe('2026-06-17');
  });

  it('týdenní id je pondělí a začátek mu odpovídá', () => {
    // 2026-06-17 je středa → pondělí 2026-06-15.
    expect(weeklyPeriodId(T)).toBe('2026-06-15');
    expect(periodStartMs('weekly', T)).toBe(Date.UTC(2026, 5, 15));
  });

  it('period start nepřesahuje teď a teď < start+období', () => {
    expect(periodStartMs('daily', T)).toBeLessThanOrEqual(T);
    expect(periodStartMs('weekly', T)).toBeLessThanOrEqual(T);
  });
});
