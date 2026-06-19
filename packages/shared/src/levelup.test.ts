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

  it('odmítne feat mimo class filtr (caster feat na fighteru)', () => {
    expect(isValidChoice('fighter', asiSlot, { kind: 'feat', featId: 'war_caster' })).toBe(false);
    expect(isValidChoice('wizard', asiSlot, { kind: 'feat', featId: 'war_caster' })).toBe(true);
  });

  it('half-feat vyžaduje platný abilityChoice', () => {
    const wizSlot = levelUpSlots('wizard', 20).find((s) => s.type === 'asi_or_feat')!;
    expect(isValidChoice('wizard', wizSlot, { kind: 'feat', featId: 'fey_touched' })).toBe(false);
    expect(
      isValidChoice('wizard', wizSlot, { kind: 'feat', featId: 'fey_touched', abilityChoice: 'intelligence' }),
    ).toBe(true);
    expect(
      isValidChoice('wizard', wizSlot, { kind: 'feat', featId: 'fey_touched', abilityChoice: 'strength' }),
    ).toBe(false);
  });
});

describe('class-feature sloty (B2)', () => {
  it('fighter dostane Fighting Style slot už od lvl 1', () => {
    const slots = levelUpSlots('fighter', 1);
    const cf = slots.filter((s) => s.type === 'class_feature' && s.group === 'fighter_fighting_style');
    expect(cf).toHaveLength(1);
    expect(cf[0]!.id).toBe('cf:fighter_fighting_style#1');
  });

  it('sorcerer Metamagic škáluje: 2 sloty na lvl 3, 3 na lvl 10', () => {
    const at3 = levelUpSlots('sorcerer', 3).filter((s) => s.group === 'sorcerer_metamagic');
    const at10 = levelUpSlots('sorcerer', 10).filter((s) => s.group === 'sorcerer_metamagic');
    expect(at3).toHaveLength(2);
    expect(at10).toHaveLength(3);
  });

  it('Battle Master manévry jen se subclassem battle_master', () => {
    const without = levelUpSlots('fighter', 3).filter((s) => s.group === 'fighter_maneuvers');
    const champ = levelUpSlots('fighter', 3, 'champion').filter((s) => s.group === 'fighter_maneuvers');
    const bm = levelUpSlots('fighter', 3, 'battle_master').filter((s) => s.group === 'fighter_maneuvers');
    expect(without).toHaveLength(0);
    expect(champ).toHaveLength(0);
    expect(bm).toHaveLength(3);
  });

  it('isValidChoice: class_feature option musí patřit skupině slotu', () => {
    const slot = levelUpSlots('fighter', 1).find((s) => s.group === 'fighter_fighting_style')!;
    expect(
      isValidChoice('fighter', slot, { kind: 'class_feature', groupId: 'fighter_fighting_style', optionId: 'archery' }),
    ).toBe(true);
    // špatná skupina
    expect(
      isValidChoice('fighter', slot, { kind: 'class_feature', groupId: 'sorcerer_metamagic', optionId: 'empowered' }),
    ).toBe(false);
    // neexistující option
    expect(
      isValidChoice('fighter', slot, { kind: 'class_feature', groupId: 'fighter_fighting_style', optionId: 'nope' }),
    ).toBe(false);
  });

  it('aggregateProgression aplikuje efekt class-feature volby', () => {
    const p = aggregateProgression([
      { slotId: 'cf:fighter_fighting_style#1', choice: { kind: 'class_feature', groupId: 'fighter_fighting_style', optionId: 'dueling' } },
    ]);
    // dueling = dmg_minor 2
    expect(p.tags.find((t) => t.tag === 'dmg_minor')?.ranks).toBe(2);
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

  it('half-feat aplikuje +1 do zvoleného atributu', () => {
    const p = aggregateProgression([
      { slotId: 'asi@4', choice: { kind: 'feat', featId: 'athlete', abilityChoice: 'dexterity' } },
    ]);
    expect(p.statBonus.dexterity).toBe(1);
    // bez abilityChoice se half-feat stat neaplikuje
    const p2 = aggregateProgression([
      { slotId: 'asi@4', choice: { kind: 'feat', featId: 'athlete' } },
    ]);
    expect(p2.statBonus.dexterity ?? 0).toBe(0);
  });

  it('selectedSubclass vrátí zvolenou subclass', () => {
    expect(
      selectedSubclass([{ slotId: 'subclass', choice: { kind: 'subclass', subclassId: 'thief' } }]),
    ).toBe('thief');
    expect(selectedSubclass([])).toBeNull();
  });
});
