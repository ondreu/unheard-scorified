import { describe, expect, it } from 'vitest';
import {
  dungeonReputationGain,
  FACTIONS,
  GENERALIST_FACTION,
  isFactionId,
  questReputationGain,
} from './factions';

describe('GENERALIST_FACTION', () => {
  it('je platné faction id (Explorers\' Guild)', () => {
    expect(isFactionId(GENERALIST_FACTION)).toBe(true);
    expect(GENERALIST_FACTION).toBe('explorers_guild');
    expect(FACTIONS[GENERALIST_FACTION]).toBeDefined();
  });
});

describe('questReputationGain (M9 retrofit)', () => {
  it('roste s levelem v rozumném pásmu (srovnatelné s profession během)', () => {
    expect(questReputationGain(1)).toBe(11); // 10 + 1*0.5 → round
    expect(questReputationGain(20)).toBe(20); // 10 + 20*0.5 (cap)
    expect(questReputationGain(20)).toBeGreaterThan(questReputationGain(1));
  });

  it('clampuje level mimo rozsah (>=1, <=MAX_LEVEL) a celé číslo', () => {
    expect(questReputationGain(0)).toBe(questReputationGain(1));
    expect(questReputationGain(-5)).toBe(questReputationGain(1));
    expect(questReputationGain(999)).toBe(questReputationGain(20));
    expect(Number.isInteger(questReputationGain(17))).toBe(true);
  });
});

describe('dungeonReputationGain (M9 retrofit)', () => {
  it('dává víc než quest (větší závazek) a roste s úrovní dungeonu', () => {
    expect(dungeonReputationGain(15)).toBe(40); // 25 + 15
    expect(dungeonReputationGain(20)).toBe(45); // 25 + 20 (cap)
    expect(dungeonReputationGain(8)).toBeGreaterThan(questReputationGain(8));
  });

  it('clampuje level (>=1, <=MAX_LEVEL)', () => {
    expect(dungeonReputationGain(0)).toBe(dungeonReputationGain(1));
    expect(dungeonReputationGain(120)).toBe(dungeonReputationGain(20));
  });
});
