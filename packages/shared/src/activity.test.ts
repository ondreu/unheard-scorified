import { describe, expect, it } from 'vitest';
import {
  activityProgress,
  activitySeed,
  computeActivityReward,
  computeQuestReward,
  type ActivityState,
} from './activity';
import { QUESTS } from './data/quests';

const QUEST = QUESTS.ns_kobold_culling!;

function stateAt(startAt: number): ActivityState {
  return {
    activityType: 'quest',
    params: { questId: QUEST.id },
    startAt,
    durationSec: QUEST.durationSec,
    seed: activitySeed('char-1', QUEST.id, startAt),
  };
}

describe('activityProgress', () => {
  const start = 1_000_000;
  const state = stateAt(start);

  it('na startu: 0 % a nedokončeno', () => {
    const p = activityProgress(state, start);
    expect(p.progress).toBe(0);
    expect(p.completed).toBe(false);
    expect(p.remainingSec).toBe(QUEST.durationSec);
    expect(p.finishesAt).toBe(start + QUEST.durationSec * 1000);
  });

  it('v polovině: ~50 %', () => {
    const p = activityProgress(state, start + (QUEST.durationSec * 1000) / 2);
    expect(p.progress).toBeCloseTo(0.5, 5);
    expect(p.completed).toBe(false);
  });

  it('po dokončení: 100 %, completed, remaining 0 (i hodně po termínu)', () => {
    const p = activityProgress(state, start + QUEST.durationSec * 1000 + 999_999);
    expect(p.progress).toBe(1);
    expect(p.completed).toBe(true);
    expect(p.remainingSec).toBe(0);
  });
});

describe('computeQuestReward — determinismus', () => {
  it('stejný seed → stejná odměna', () => {
    const seed = activitySeed('char-1', QUEST.id, 123);
    const a = computeQuestReward(QUEST, seed);
    const b = computeQuestReward(QUEST, seed);
    expect(a).toEqual(b);
  });

  it('XP je fixní = baseXp', () => {
    const r = computeQuestReward(QUEST, 42);
    expect(r.xp).toBe(QUEST.baseXp);
  });

  it('zlato je v rozsahu ±goldVariance', () => {
    const min = Math.round(QUEST.baseGold * (1 - QUEST.goldVariance));
    const max = Math.round(QUEST.baseGold * (1 + QUEST.goldVariance));
    for (let s = 0; s < 200; s++) {
      const g = computeQuestReward(QUEST, s).gold;
      expect(g).toBeGreaterThanOrEqual(min);
      expect(g).toBeLessThanOrEqual(max);
    }
  });
});

describe('computeActivityReward', () => {
  const start = 5_000;

  it('nedokončená aktivita → null', () => {
    expect(computeActivityReward(stateAt(start), start + 1000)).toBeNull();
  });

  it('dokončená aktivita → deterministická odměna', () => {
    const state = stateAt(start);
    const now = start + QUEST.durationSec * 1000;
    const r = computeActivityReward(state, now);
    expect(r).not.toBeNull();
    expect(r).toEqual(computeQuestReward(QUEST, state.seed));
  });
});
