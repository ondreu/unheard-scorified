import { describe, expect, it } from 'vitest';
import {
  CASTER_TYPE,
  abilityPrefersUpcast,
  activitySlotCost,
  availableSlots,
  casterTypeOf,
  highestSpellTier,
  isCaster,
  longRest,
  spellSlotsFor,
  spellbookFor,
  spendHighestSlots,
  spendSlotForTier,
  totalSpellSlots,
} from './spell-slots';
import { CLASS_IDS } from './classes';

describe('spendSlotForTier — frugal vs upcast', () => {
  it('default (frugal) spends the lowest available slot ≥ minTier', () => {
    const slots = { 1: 2, 3: 1, 5: 1 };
    expect(spendSlotForTier(slots, 1)).toBe(1);
    expect(slots[1]).toBe(1);
  });

  it('preferHighest spends the highest available slot ≥ minTier (max upcast)', () => {
    const slots = { 3: 1, 5: 1, 9: 1 };
    expect(spendSlotForTier(slots, 3, true)).toBe(9); // nuke vrazí největší slot
    expect(slots[9]).toBe(0);
    expect(spendSlotForTier(slots, 3, true)).toBe(5);
  });

  it('returns null when no slot of minTier or higher exists', () => {
    expect(spendSlotForTier({ 1: 1 }, 3)).toBeNull();
    expect(spendSlotForTier({ 1: 1 }, 3, true)).toBeNull();
  });
});

describe('abilityPrefersUpcast', () => {
  it('upcastable nuke (dice + dicePerSlotAbove) prefers upcast', () => {
    expect(abilityPrefersUpcast({ dice: { count: 8, sides: 6, bonus: 0 }, dicePerSlotAbove: 1 })).toBe(true);
  });

  it('heal/buff/non-upcast spell stays frugal', () => {
    expect(abilityPrefersUpcast({})).toBe(false);
    expect(abilityPrefersUpcast({ dice: { count: 4, sides: 6, bonus: 0 } })).toBe(false); // bez per-slot
  });
});

describe('caster classification', () => {
  it('classifies every class', () => {
    for (const id of CLASS_IDS) expect(CASTER_TYPE[id]).toBeDefined();
  });

  it('matches D&D 5e caster types', () => {
    expect(casterTypeOf('wizard')).toBe('full');
    expect(casterTypeOf('cleric')).toBe('full');
    expect(casterTypeOf('paladin')).toBe('half');
    expect(casterTypeOf('ranger')).toBe('half');
    expect(casterTypeOf('warlock')).toBe('pact');
    expect(casterTypeOf('fighter')).toBe('none');
    expect(casterTypeOf('barbarian')).toBe('none');
    expect(isCaster('rogue')).toBe(false);
    expect(isCaster('bard')).toBe(true);
  });
});

describe('spellSlotsFor — full caster (D&D table)', () => {
  it('level 1 wizard has two 1st-tier slots', () => {
    expect(spellSlotsFor('wizard', 1)).toEqual({ 1: 2 });
  });

  it('level 5 cleric has 4/3/2', () => {
    expect(spellSlotsFor('cleric', 5)).toEqual({ 1: 4, 2: 3, 3: 2 });
  });

  it('level 20 sorcerer reaches 9th-tier slots', () => {
    expect(spellSlotsFor('sorcerer', 20)).toEqual({
      1: 4,
      2: 3,
      3: 3,
      4: 3,
      5: 3,
      6: 2,
      7: 2,
      8: 1,
      9: 1,
    });
  });

  it('clamps levels above 20 and below 1', () => {
    expect(spellSlotsFor('wizard', 99)).toEqual(spellSlotsFor('wizard', 20));
    expect(spellSlotsFor('wizard', 0)).toEqual(spellSlotsFor('wizard', 1));
  });
});

describe('spellSlotsFor — half caster (Paladin/Ranger)', () => {
  it('has no slots at level 1', () => {
    expect(spellSlotsFor('paladin', 1)).toEqual({});
    expect(totalSpellSlots(spellSlotsFor('paladin', 1))).toBe(0);
  });

  it('gains 1st-tier slots at level 2', () => {
    expect(spellSlotsFor('ranger', 2)).toEqual({ 1: 2 });
  });

  it('caps at 5th-tier slots (no 6th+)', () => {
    const slots = spellSlotsFor('paladin', 20);
    expect(highestSpellTier(slots)).toBe(5);
    expect(slots[6]).toBeUndefined();
  });
});

describe('spellSlotsFor — pact magic (Warlock)', () => {
  it('has one 1st-tier slot at level 1', () => {
    expect(spellSlotsFor('warlock', 1)).toEqual({ 1: 1 });
  });

  it('all slots sit at a single (highest) tier', () => {
    const slots = spellSlotsFor('warlock', 5);
    expect(slots).toEqual({ 3: 2 });
    expect(highestSpellTier(slots)).toBe(3);
  });

  it('grows to four 5th-tier slots at level 17+', () => {
    expect(spellSlotsFor('warlock', 17)).toEqual({ 5: 4 });
  });
});

describe('spellSlotsFor — non-caster', () => {
  it('martial classes have no slots at any level', () => {
    for (const klass of ['barbarian', 'fighter', 'monk', 'rogue'] as const) {
      expect(spellSlotsFor(klass, 20)).toEqual({});
    }
  });
});

describe('available / spend / long rest', () => {
  it('available = max - spent, clamped to >= 0', () => {
    const max = { 1: 4, 2: 3, 3: 2 };
    expect(availableSlots(max, { 1: 1, 3: 2 })).toEqual({ 1: 3, 2: 3 });
    // přebytečný spent se ignoruje (nezáporné)
    expect(availableSlots(max, { 1: 99 })).toEqual({ 2: 3, 3: 2 });
  });

  it('spends from the highest available tier first', () => {
    const max = { 1: 4, 2: 3, 3: 2 };
    const spent = spendHighestSlots(max, {}, 3);
    // 2× tier 3, pak 1× tier 2
    expect(spent).toEqual({ 3: 2, 2: 1 });
  });

  it('spends only what is available (no negative)', () => {
    const max = { 1: 1 };
    const spent = spendHighestSlots(max, {}, 5);
    expect(spent).toEqual({ 1: 1 });
    expect(availableSlots(max, spent)).toEqual({});
  });

  it('non-casters spend nothing (empty max)', () => {
    expect(spendHighestSlots({}, {}, 4)).toEqual({});
  });

  it('long rest clears all spent slots', () => {
    expect(longRest()).toEqual({});
    const max = { 1: 4, 2: 3 };
    expect(availableSlots(max, longRest())).toEqual(max);
  });
});

describe('activitySlotCost', () => {
  it('scales with duration and caps at 6', () => {
    expect(activitySlotCost(0)).toBe(0);
    expect(activitySlotCost(60)).toBe(1);
    expect(activitySlotCost(1800)).toBe(1);
    expect(activitySlotCost(1801)).toBe(2);
    expect(activitySlotCost(36000)).toBe(6);
  });
});

describe('spellbookFor', () => {
  it('non-casters have an empty spellbook', () => {
    const book = spellbookFor('fighter', null, 20);
    expect(book.casterType).toBe('none');
    expect(book.cantrips).toEqual([]);
    expect(book.spellsByTier).toEqual([]);
  });

  it('a level 1 wizard knows cantrips and a 1st-tier spell', () => {
    const book = spellbookFor('wizard', null, 1);
    expect(book.casterType).toBe('full');
    expect(book.cantrips.map((c) => c.id)).toContain('wiz_fire_bolt');
    expect(book.cantrips.every((c) => c.spellTier === 0)).toBe(true);
    const tier1 = book.spellsByTier.find((g) => g.tier === 1);
    expect(tier1?.spells.map((s) => s.id)).toContain('wiz_magic_missile');
  });

  it('groups higher-level spells as the wizard levels up', () => {
    const book = spellbookFor('wizard', null, 14);
    const tiers = book.spellsByTier.map((g) => g.tier);
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
    expect(tiers).toContain(3); // Fireball @ lvl 14
  });

  it('includes subclass signature spells once unlocked', () => {
    const book = spellbookFor('sorcerer', 'draconic_bloodline', 3);
    const allIds = [...book.cantrips, ...book.spellsByTier.flatMap((g) => g.spells)].map(
      (s) => s.id,
    );
    expect(allIds).toContain('draconic_elemental_burst');
  });

  it('omits class features without a spell tier (e.g. Wild Shape)', () => {
    const book = spellbookFor('druid', 'circle_of_the_moon', 10);
    const allIds = [...book.cantrips, ...book.spellsByTier.flatMap((g) => g.spells)].map(
      (s) => s.id,
    );
    expect(allIds).not.toContain('moon_wild_shape');
  });
});
