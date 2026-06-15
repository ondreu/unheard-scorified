import { describe, expect, it } from 'vitest';
import { canFillRole, isLobbyFull, openSlotCount, remainingSlots } from './lobby';

describe('raid lobby slots', () => {
  const comp = { tank: 1, healer: 1, dps: 3 }; // size 5

  it('remainingSlots odečte připojené role', () => {
    expect(remainingSlots(comp, [])).toEqual({ tank: 1, healer: 1, dps: 3 });
    expect(remainingSlots(comp, ['tank', 'dps'])).toEqual({ tank: 0, healer: 1, dps: 2 });
  });

  it('přebytek v roli neklesá pod nulu ani neovlivní jiné', () => {
    expect(remainingSlots(comp, ['dps', 'dps', 'dps', 'dps'])).toEqual({
      tank: 1,
      healer: 1,
      dps: 0,
    });
  });

  it('openSlotCount a isLobbyFull', () => {
    expect(openSlotCount(comp, [])).toBe(5);
    expect(isLobbyFull(comp, [])).toBe(false);
    expect(isLobbyFull(comp, ['tank', 'healer', 'dps', 'dps', 'dps'])).toBe(true);
  });

  it('canFillRole hlídá kapacitu role', () => {
    expect(canFillRole(comp, ['tank'], 'tank')).toBe(false);
    expect(canFillRole(comp, ['tank'], 'dps')).toBe(true);
  });
});
