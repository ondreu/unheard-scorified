import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, achievementById, achievementProgress } from './achievements';

describe('achievements', () => {
  it('katalog má unikátní id a kladné prahy/odměny', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.threshold).toBeGreaterThan(0);
      expect(a.rewardGold).toBeGreaterThan(0);
    }
  });

  it('achievementById najde i mine', () => {
    expect(achievementById('level_20')?.metric).toBe('level');
    expect(achievementById('nope')).toBeUndefined();
  });

  it('achievementProgress počítá podíl a splnění', () => {
    expect(achievementProgress(5, 10)).toEqual({ completed: false, pct: 0.5 });
    expect(achievementProgress(10, 10)).toEqual({ completed: true, pct: 1 });
    expect(achievementProgress(99, 10).pct).toBe(1);
  });
});
