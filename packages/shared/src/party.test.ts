import { describe, expect, it } from 'vitest';
import { arenaBracketForSize, isGroupActivityType } from './index';

describe('party / group helpers', () => {
  it('arenaBracketForSize mapuje 1/2/3/5 na bracket', () => {
    expect(arenaBracketForSize(1)).toBe('1v1');
    expect(arenaBracketForSize(2)).toBe('2v2');
    expect(arenaBracketForSize(3)).toBe('3v3');
    expect(arenaBracketForSize(5)).toBe('5v5');
  });

  it('arenaBracketForSize vrací null pro nepodporované velikosti', () => {
    expect(arenaBracketForSize(0)).toBeNull();
    expect(arenaBracketForSize(4)).toBeNull();
    expect(arenaBracketForSize(6)).toBeNull();
  });

  it('isGroupActivityType přijme jen dungeon/arena (raidy vyříznuty)', () => {
    expect(isGroupActivityType('dungeon')).toBe(true);
    expect(isGroupActivityType('arena')).toBe(true);
    expect(isGroupActivityType('raid')).toBe(false);
    expect(isGroupActivityType('quest')).toBe(false);
    expect(isGroupActivityType('')).toBe(false);
  });
});
