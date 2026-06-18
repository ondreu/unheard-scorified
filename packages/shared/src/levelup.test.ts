import { describe, expect, it } from 'vitest';
import {
  ASI_LEVELS,
  aggregateProgression,
  isValidAsi,
  isValidChoice,
  levelUpSlots,
  selectedSubclass,
  type StoredLevelUpChoice,
} from './levelup';

describe('levelUpSlots', () => {
  it('lvl 1 fighter má jen ASI@nic + subclass až od lvl 3', () => {
    const slots = levelUpSlots('fighter', 1);
    expect(slots.find((s) => s.type === 'subclass')).toBeUndefined();
    expect(slots.filter((s) => s.type === 'asi_or_feat')).toHaveLength(0);
  });

  it('cleric má subclass slot už od lvl 1 (subclassLevel 1)', () => {
    expect(levelUpSlots('cleric', 1).some((s) => s.id === 'subclass')).toBe(true);
  });

  it('na cap levelu (20) má fighter subclass + všechny ASI sloty', () => {
    const slots = levelUpSlots('fighter', 20);
    expect(slots.some((s) => s.id === 'subclass')).toBe(true);
    expect(slots.filter((s) => s.type === 'asi_or_feat')).toHaveLength(ASI_LEVELS.length);
  });
});

describe('isValidAsi', () => {
  it('přijme 1×+2', () => expect(isValidAsi({ strength: 2 })).toBe(true));
  it('přijme 2×+1', () => expect(isValidAsi({ strength: 1, dexterity: 1 })).toBe(true));
  it('odmítne součet ≠ 2', () => {
    expect(isValidAsi({ strength: 1 })).toBe(false);
    expect(isValidAsi({ strength: 3 })).toBe(false);
  });
  it('odmítne +3 do jednoho atributu', () => expect(isValidAsi({ strength: 3 })).toBe(false));
});

describe('isValidChoice', () => {
  const subSlot = levelUpSlots('fighter', 20).find((s) => s.type === 'subclass')!;
  const asiSlot = levelUpSlots('fighter', 20).find((s) => s.type === 'asi_or_feat')!;

  it('subclass slot přijme jen subclass dané třídy', () => {
    expect(isValidChoice('fighter', subSlot, { kind: 'subclass', subclassId: 'champion' })).toBe(true);
    expect(isValidChoice('fighter', subSlot, { kind: 'subclass', subclassId: 'thief' })).toBe(false);
  });

  it('ASI slot přijme validní ASI i feat, ne subclass', () => {
    expect(isValidChoice('fighter', asiSlot, { kind: 'asi', increases: { strength: 2 } })).toBe(true);
    expect(isValidChoice('fighter', asiSlot, { kind: 'feat', featId: 'tough' })).toBe(true);
    expect(isValidChoice('fighter', asiSlot, { kind: 'subclass', subclassId: 'champion' })).toBe(false);
  });
});

describe('aggregateProgression', () => {
  it('sečte ASI stat bonusy + feat staty/HP/tagy', () => {
    const choices: StoredLevelUpChoice[] = [
      { slotId: 'asi@4', choice: { kind: 'asi', increases: { strength: 2 } } },
      { slotId: 'asi@8', choice: { kind: 'feat', featId: 'tough' } },
      { slotId: 'asi@12', choice: { kind: 'feat', featId: 'resilient' } },
      { slotId: 'subclass', choice: { kind: 'subclass', subclassId: 'champion' } },
    ];
    const p = aggregateProgression(choices);
    expect(p.statBonus.strength).toBe(2);
    expect(p.statBonus.constitution).toBe(1); // z resilient
    expect(p.healthBonus).toBe(60); // tough 40 + resilient 20
    expect(p.tags.find((t) => t.tag === 'hp_minor')?.ranks).toBe(3);
  });

  it('selectedSubclass vrátí zvolenou subclass', () => {
    expect(
      selectedSubclass([{ slotId: 'subclass', choice: { kind: 'subclass', subclassId: 'thief' } }]),
    ).toBe('thief');
    expect(selectedSubclass([])).toBeNull();
  });
});
