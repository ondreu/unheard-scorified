import { describe, expect, it } from 'vitest';
import {
  computeGroupReward,
  groupComposition,
  groupContentSizes,
  groupEncounters,
  isGroupContentUnlocked,
  DUNGEONS,
} from './index';
import { DUNGEON_LOOT_TABLES } from './loot';
import { ITEMS } from './data/items';
import { QUESTS } from './data/quests';

describe('group content sizes & composition', () => {
  it('dungeon supports 1/3/5', () => {
    expect(groupContentSizes('dungeon', 'ragefire_chasm')).toEqual([1, 3, 5]);
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
    // ADR 0032: HP se odvozuje z CR (data už nenesou maxHealth); solo (size 1) je
    // unscaled → kladné CR-based HP. Škálování ×size ověřuje další test.
    expect(enc[0]!.maxHealth).toBeGreaterThan(0);
  });

  it('group dungeon scales enemy HP/dmg with party size', () => {
    const solo = groupEncounters('dungeon', 'ragefire_chasm', 1);
    const five = groupEncounters('dungeon', 'ragefire_chasm', 5);
    expect(five[0]!.maxHealth).toBe(solo[0]!.maxHealth * 5);
    expect(five[0]!.attackPower).toBeCloseTo(solo[0]!.attackPower * 5);
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

  it('unknown content = zero reward', () => {
    expect(computeGroupReward('dungeon', 'nope', true, 1, 0)).toEqual({ xp: 0, gold: 0, items: [] });
  });
});

describe('isGroupContentUnlocked', () => {
  it('dungeon gates on level + attunement (M9)', () => {
    // ragefire má teď attunement questline → samotný level nestačí
    expect(isGroupContentUnlocked('dungeon', 'ragefire_chasm', 1, [])).toBe(false);
    expect(isGroupContentUnlocked('dungeon', 'ragefire_chasm', 60, [])).toBe(false);
    expect(
      isGroupContentUnlocked('dungeon', 'ragefire_chasm', 60, ['ho_ragefire_attunement']),
    ).toBe(true);
    // Deadmines má teď (M12.5) vlastní 2-questový attunement → level nestačí
    expect(isGroupContentUnlocked('dungeon', 'deadmines', 60, [])).toBe(false);
    expect(isGroupContentUnlocked('dungeon', 'deadmines', 60, ['al_dm_attune_2'])).toBe(true);
  });

  it('frontier dungeons gate on level + attunement questline', () => {
    // Pod úrovní → zamčeno i s attunementem
    expect(isGroupContentUnlocked('dungeon', 'zulfarrak', 13, ['al_zf_attunement'])).toBe(false);
    // Level bez attunementu nestačí
    expect(isGroupContentUnlocked('dungeon', 'zulfarrak', 14, [])).toBe(false);
    expect(isGroupContentUnlocked('dungeon', 'zulfarrak', 14, ['ho_zf_attunement'])).toBe(true);
    expect(isGroupContentUnlocked('dungeon', 'maraudon', 15, [])).toBe(false);
    expect(isGroupContentUnlocked('dungeon', 'maraudon', 15, ['al_mar_attunement'])).toBe(true);
    expect(isGroupContentUnlocked('dungeon', 'blackrock_depths', 17, [])).toBe(false);
    expect(isGroupContentUnlocked('dungeon', 'blackrock_depths', 17, ['ho_brd_attunement'])).toBe(true);
    // Stratholme: level + attunement questline
    expect(isGroupContentUnlocked('dungeon', 'stratholme', 19, [])).toBe(false);
    expect(isGroupContentUnlocked('dungeon', 'stratholme', 19, ['al_culling_stratholme'])).toBe(true);
  });

  it('M12.5 low-level dungeons gate on a multi-quest attunement chain', () => {
    // Wailing Caverns / Blackfathom Deeps (nové) + Deadmines/SFK/SM (doplněné)
    expect(isGroupContentUnlocked('dungeon', 'wailing_caverns', 17, [])).toBe(false);
    expect(isGroupContentUnlocked('dungeon', 'wailing_caverns', 17, ['ho_wc_attune_2'])).toBe(true);
    expect(isGroupContentUnlocked('dungeon', 'blackfathom_deeps', 24, ['al_bfd_attune_2'])).toBe(true);
    expect(isGroupContentUnlocked('dungeon', 'shadowfang_keep', 20, [])).toBe(false);
    expect(isGroupContentUnlocked('dungeon', 'shadowfang_keep', 20, ['al_sfk_attune_2'])).toBe(true);
    expect(isGroupContentUnlocked('dungeon', 'scarlet_monastery', 30, ['ho_sm_attune_2'])).toBe(true);
    // Chain: finální quest vyžaduje předchozí (requiresQuest)
    expect(QUESTS['al_dm_attune_2']!.requiresQuest).toBe('al_dm_attune_1');
  });

  it('every dungeon now has an attunement questline', () => {
    for (const d of Object.values(DUNGEONS)) {
      expect(d.attunement?.questAnyOf.length, `${d.id} missing attunement`).toBeGreaterThan(0);
    }
  });
});

describe('dungeon data integrity (M12)', () => {
  it('every dungeon with a loot table references real items, and 40–60 dungeons have one', () => {
    for (const [id, table] of Object.entries(DUNGEON_LOOT_TABLES)) {
      expect(DUNGEONS[id], `loot table for unknown dungeon ${id}`).toBeDefined();
      for (const entry of table.entries) {
        expect(ITEMS[entry.itemId], `unknown item ${entry.itemId} in ${id}`).toBeDefined();
      }
    }
    for (const id of ['zulfarrak', 'maraudon', 'blackrock_depths', 'stratholme']) {
      expect(DUNGEON_LOOT_TABLES[id], `missing loot table for ${id}`).toBeDefined();
    }
  });

  it('dungeon attunement quests exist', () => {
    for (const d of Object.values(DUNGEONS)) {
      for (const q of d.attunement?.questAnyOf ?? []) {
        expect(QUESTS[q], `unknown attunement quest ${q}`).toBeDefined();
      }
    }
  });
});
