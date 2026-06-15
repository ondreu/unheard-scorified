import { describe, expect, it } from 'vitest';
import {
  BASE_BACKPACK_SLOTS,
  STACKABLE_MAX,
  itemMaxStack,
  usedSlots,
  bagCapacity,
  planGrant,
} from './index';

describe('inventory capacity', () => {
  it('gear/batoh se nestackuje, materiál ano', () => {
    expect(itemMaxStack('iron_shortsword')).toBe(1);
    expect(itemMaxStack('small_pouch')).toBe(1);
    expect(itemMaxStack('copper_ore')).toBe(STACKABLE_MAX);
    expect(itemMaxStack('minor_healing_potion')).toBe(STACKABLE_MAX);
  });

  it('usedSlots počítá stacky stack-aware', () => {
    expect(usedSlots([{ itemId: 'copper_ore', quantity: STACKABLE_MAX }])).toBe(1);
    expect(usedSlots([{ itemId: 'copper_ore', quantity: STACKABLE_MAX + 1 }])).toBe(2);
    expect(
      usedSlots([
        { itemId: 'iron_shortsword', quantity: 3 }, // gear → 3 sloty
        { itemId: 'copper_ore', quantity: 5 }, // 1 slot
      ]),
    ).toBe(4);
  });

  it('bagCapacity = základ + sloty batohů', () => {
    expect(bagCapacity([])).toBe(BASE_BACKPACK_SLOTS);
    expect(bagCapacity(['small_pouch', 'reinforced_pack'])).toBe(BASE_BACKPACK_SLOTS + 4 + 8);
  });
});

describe('planGrant', () => {
  it('vše se vejde do prázdného inventáře', () => {
    const plan = planGrant([], BASE_BACKPACK_SLOTS, [{ itemId: 'iron_shortsword', quantity: 2 }]);
    expect(plan.overflow).toHaveLength(0);
    expect(plan.add).toEqual([{ itemId: 'iron_shortsword', quantity: 2 }]);
  });

  it('dorovná neúplný stack bez nového slotu', () => {
    const plan = planGrant(
      [{ itemId: 'copper_ore', quantity: STACKABLE_MAX - 3 }],
      1, // 1 slot, už zabraný
      [{ itemId: 'copper_ore', quantity: 3 }],
    );
    expect(plan.add).toEqual([{ itemId: 'copper_ore', quantity: 3 }]);
    expect(plan.overflow).toHaveLength(0);
  });

  it('přebytek nad kapacitu jde do overflow', () => {
    // kapacita 2 sloty, prázdné; gear nestackuje → 3. kus přeteče
    const plan = planGrant([], 2, [{ itemId: 'iron_shortsword', quantity: 3 }]);
    expect(plan.add).toEqual([{ itemId: 'iron_shortsword', quantity: 2 }]);
    expect(plan.overflow).toEqual([{ itemId: 'iron_shortsword', quantity: 1 }]);
  });

  it('plný inventář → vše přeteče', () => {
    const full = [{ itemId: 'iron_shortsword', quantity: BASE_BACKPACK_SLOTS }];
    const plan = planGrant(full, BASE_BACKPACK_SLOTS, [{ itemId: 'copper_ore', quantity: 5 }]);
    expect(plan.add).toHaveLength(0);
    expect(plan.overflow).toEqual([{ itemId: 'copper_ore', quantity: 5 }]);
  });

  it('stackovatelný materiál: část do nového slotu, zbytek overflow', () => {
    // kapacita 1 slot volný, materiál maxStack=20, dáme 25 → 20 se vejde, 5 přeteče
    const plan = planGrant([], 1, [{ itemId: 'copper_ore', quantity: 25 }]);
    expect(plan.add).toEqual([{ itemId: 'copper_ore', quantity: STACKABLE_MAX }]);
    expect(plan.overflow).toEqual([{ itemId: 'copper_ore', quantity: 5 }]);
  });
});
