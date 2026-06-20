import { describe, expect, it } from 'vitest';
import {
  CONDITION_META,
  CONDITION_TYPES,
  applyCondition,
  combineAdvantage,
  conditionAppliedMessage,
  grantsIncomingAdvantage,
  hasCondition,
  tickConditions,
  turnConditionEffects,
  type ActiveCondition,
} from './conditions';

describe('turnConditionEffects', () => {
  it('stunned loses the turn and blocks bonus actions', () => {
    const eff = turnConditionEffects([{ type: 'stunned', turns: 1 }]);
    expect(eff.skipTurn).toBe(true);
    expect(eff.noBonusAction).toBe(true);
  });

  it('frightened/prone/restrained/slowed impose attack disadvantage', () => {
    for (const type of ['frightened', 'prone', 'restrained', 'slowed'] as const) {
      expect(turnConditionEffects([{ type, turns: 1 }]).attackDisadvantage).toBe(true);
    }
  });

  it('slowed blocks the bonus action but does not skip the turn', () => {
    const eff = turnConditionEffects([{ type: 'slowed', turns: 2 }]);
    expect(eff.skipTurn).toBe(false);
    expect(eff.noBonusAction).toBe(true);
  });

  it('poisoned/blinded impose attack disadvantage; charmed skips the turn (Slice 2d)', () => {
    expect(turnConditionEffects([{ type: 'poisoned', turns: 1 }]).attackDisadvantage).toBe(true);
    expect(turnConditionEffects([{ type: 'blinded', turns: 1 }]).attackDisadvantage).toBe(true);
    const charmed = turnConditionEffects([{ type: 'charmed', turns: 1 }]);
    expect(charmed.skipTurn).toBe(true);
    expect(charmed.noBonusAction).toBe(true);
  });

  it('ignores expired (0-turn) conditions and combines multiple', () => {
    const eff = turnConditionEffects([
      { type: 'frightened', turns: 0 },
      { type: 'restrained', turns: 2 },
    ]);
    expect(eff.attackDisadvantage).toBe(true);
    expect(eff.skipTurn).toBe(false);
  });
});

describe('grantsIncomingAdvantage', () => {
  it('prone/restrained/stunned grant advantage to attackers', () => {
    for (const type of ['prone', 'restrained', 'stunned'] as const) {
      expect(grantsIncomingAdvantage([{ type, turns: 1 }])).toBe(true);
    }
  });

  it('blinded grants incoming advantage; poisoned/charmed do not (Slice 2d)', () => {
    expect(grantsIncomingAdvantage([{ type: 'blinded', turns: 1 }])).toBe(true);
    expect(grantsIncomingAdvantage([{ type: 'poisoned', turns: 1 }])).toBe(false);
    expect(grantsIncomingAdvantage([{ type: 'charmed', turns: 1 }])).toBe(false);
  });

  it('frightened/slowed do not grant incoming advantage', () => {
    expect(grantsIncomingAdvantage([{ type: 'frightened', turns: 1 }])).toBe(false);
    expect(grantsIncomingAdvantage([{ type: 'slowed', turns: 1 }])).toBe(false);
    expect(grantsIncomingAdvantage(undefined)).toBe(false);
  });
});

describe('combineAdvantage', () => {
  it('cancels advantage and disadvantage to normal (D&D)', () => {
    expect(combineAdvantage('advantage', 'disadvantage')).toBe('normal');
    expect(combineAdvantage('advantage', 'advantage', 'disadvantage')).toBe('normal');
  });

  it('keeps a one-sided result', () => {
    expect(combineAdvantage('advantage', undefined)).toBe('advantage');
    expect(combineAdvantage(undefined, 'disadvantage')).toBe('disadvantage');
    expect(combineAdvantage(undefined, undefined)).toBe('normal');
  });
});

describe('applyCondition / tickConditions', () => {
  it('adds a condition and refreshes (max duration) on re-apply', () => {
    let conds: ActiveCondition[] | undefined;
    conds = applyCondition(conds, { type: 'prone', durationTurns: 1 }, 'Ogre');
    expect(hasCondition(conds, 'prone')).toBe(true);
    expect(conds.find((c) => c.type === 'prone')!.turns).toBe(1);
    // Re-apply with longer duration → refreshes, no stacking.
    conds = applyCondition(conds, { type: 'prone', durationTurns: 3 }, 'Ogre');
    expect(conds.filter((c) => c.type === 'prone')).toHaveLength(1);
    expect(conds.find((c) => c.type === 'prone')!.turns).toBe(3);
  });

  it('decrements at turn start and drops expired conditions', () => {
    let conds = applyCondition(undefined, { type: 'stunned', durationTurns: 1 });
    conds = tickConditions(conds);
    expect(conds).toHaveLength(0);
  });

  it('does not mutate the input array', () => {
    const conds = applyCondition(undefined, { type: 'restrained', durationTurns: 2 });
    const ticked = tickConditions(conds);
    expect(conds.find((c) => c.type === 'restrained')!.turns).toBe(2);
    expect(ticked.find((c) => c.type === 'restrained')!.turns).toBe(1);
  });
});

describe('catalog coverage', () => {
  it('every condition type has a log verb', () => {
    for (const type of CONDITION_TYPES) {
      expect(conditionAppliedMessage('Hero', { type, durationTurns: 1 })).toContain('Hero');
    }
  });

  it('every condition type has UI metadata (icon + label)', () => {
    for (const type of CONDITION_TYPES) {
      expect(CONDITION_META[type].icon.length).toBeGreaterThan(0);
      expect(CONDITION_META[type].label.length).toBeGreaterThan(0);
    }
  });
});
