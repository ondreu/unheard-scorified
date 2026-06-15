import { describe, expect, it } from 'vitest';
import {
  computeGroupReward,
  groupComposition,
  groupContentSizes,
  groupEncounters,
  isGroupContentUnlocked,
  DUNGEONS,
  RAIDS,
} from './index';

describe('group content sizes & composition', () => {
  it('dungeon supports 1/3/5; raid mirrors raid sizes', () => {
    expect(groupContentSizes('dungeon', 'ragefire_chasm')).toEqual([1, 3, 5]);
    expect(groupContentSizes('raid', 'molten_core')).toEqual([...RAIDS.molten_core!.sizes]);
  });

  it('dungeon composition: solo dps, then tank/heal/dps', () => {
    expect(groupComposition('dungeon', 1)).toEqual({ tank: 0, healer: 0, dps: 1 });
    expect(groupComposition('dungeon', 3)).toEqual({ tank: 1, healer: 1, dps: 1 });
    expect(groupComposition('dungeon', 5)).toEqual({ tank: 1, healer: 1, dps: 3 });
  });
});

describe('groupEncounters', () => {
  it('SP dungeon (size 1) = unscaled encounters', () => {
    const enc = groupEncounters('dungeon', 'ragefire_chasm', 1);
    expect(enc).toHaveLength(DUNGEONS.ragefire_chasm!.encounters.length);
    expect(enc[0]!.maxHealth).toBe(DUNGEONS.ragefire_chasm!.encounters[0]!.maxHealth);
  });

  it('group dungeon scales enemy HP/dmg with party size', () => {
    const solo = groupEncounters('dungeon', 'ragefire_chasm', 1);
    const five = groupEncounters('dungeon', 'ragefire_chasm', 5);
    expect(five[0]!.maxHealth).toBe(solo[0]!.maxHealth * 5);
    expect(five[0]!.attackPower).toBeCloseTo(solo[0]!.attackPower * 5);
  });

  it('raid encounters = scaled bosses', () => {
    const bosses = groupEncounters('raid', 'molten_core', 5);
    expect(bosses).toHaveLength(RAIDS.molten_core!.bosses.length);
  });
});

describe('computeGroupReward', () => {
  it('dungeon: hard fail = no reward; clear scales with wipes', () => {
    expect(computeGroupReward('dungeon', 'ragefire_chasm', false, 1, 0)).toEqual({
      xp: 0,
      gold: 0,
      items: [],
    });
    const clean = computeGroupReward('dungeon', 'ragefire_chasm', true, 42, 0);
    const wiped = computeGroupReward('dungeon', 'ragefire_chasm', true, 42, 4);
    expect(clean.xp).toBe(DUNGEONS.ragefire_chasm!.baseXp);
    expect(wiped.xp).toBeLessThan(clean.xp);
  });

  it('dungeon: personal loot is deterministic per seed', () => {
    const a = computeGroupReward('dungeon', 'deadmines', true, 7, 0);
    const b = computeGroupReward('dungeon', 'deadmines', true, 7, 0);
    expect(a).toEqual(b);
  });

  it('raid delegates to raid reward (hard fail = 0)', () => {
    expect(computeGroupReward('raid', 'molten_core', false, 1, 0)).toEqual({
      xp: 0,
      gold: 0,
      items: [],
    });
  });

  it('unknown content = zero reward', () => {
    expect(computeGroupReward('dungeon', 'nope', true, 1, 0)).toEqual({ xp: 0, gold: 0, items: [] });
  });
});

describe('isGroupContentUnlocked', () => {
  it('dungeon gates on level', () => {
    expect(isGroupContentUnlocked('dungeon', 'ragefire_chasm', 1, [])).toBe(false);
    expect(isGroupContentUnlocked('dungeon', 'ragefire_chasm', 60, [])).toBe(true);
  });

  it('raid gates on level + attunement', () => {
    expect(isGroupContentUnlocked('raid', 'molten_core', 40, [])).toBe(false);
    expect(isGroupContentUnlocked('raid', 'molten_core', 40, ['tn_galak_ogres'])).toBe(true);
  });
});
