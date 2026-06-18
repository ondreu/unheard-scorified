import { describe, expect, it } from 'vitest';
import {
  contentHasWeeklyLockout,
  isAuctionable,
  isSoulbound,
  isTradeableItem,
  itemBindType,
  lockoutIdForContent,
  lockoutResetAt,
  weeklyLockoutId,
} from './index';

describe('M8.6 bindType (soulbound / BoP / BoE)', () => {
  it('dungeon personal loot je BoP (soulbound)', () => {
    expect(itemBindType('whitemane_chapeau')).toBe('bop'); // dungeon boss epic
    expect(itemBindType('taragaman_hammer')).toBe('bop'); // dungeon boss rare
    expect(isSoulbound('whitemane_chapeau')).toBe(true);
  });

  it('běžný gear a materiály jsou nevázané (none)', () => {
    expect(itemBindType('iron_shortsword')).toBe('none');
    expect(itemBindType('copper_ore')).toBe('none'); // materiál
    expect(isSoulbound('iron_shortsword')).toBe(false);
  });

  it('high-end craftable / world gear je BoE (obchodovatelný)', () => {
    expect(itemBindType('masterwork_blade')).toBe('boe');
    expect(itemBindType('arcane_robes')).toBe('boe');
    expect(isSoulbound('masterwork_blade')).toBe(false);
  });

  it('neznámý item ⇒ none', () => {
    expect(itemBindType('does_not_exist')).toBe('none');
  });
});

describe('M8.6 isAuctionable (AH filtr)', () => {
  it('BoP item není prodejný na AH', () => {
    expect(isAuctionable('whitemane_chapeau')).toBe(false);
    expect(isAuctionable('taragaman_hammer')).toBe(false);
  });

  it('nevázané a BoE itemy prodejné jsou', () => {
    expect(isAuctionable('iron_shortsword')).toBe(true);
    expect(isAuctionable('masterwork_blade')).toBe(true); // BoE → tradeable
    expect(isAuctionable('copper_ore')).toBe(true); // materiál
  });

  it('neznámý item není prodejný', () => {
    expect(isAuctionable('does_not_exist')).toBe(false);
    expect(isTradeableItem('does_not_exist')).toBe(false);
  });
});

describe('M8.6 weekly lockout (deterministický UTC týden)', () => {
  // 2024-01-01 byl pondělek (kotva). 2024-01-08 je další pondělí.
  const monday = Date.UTC(2024, 0, 1, 0, 0, 0);
  const sameWeek = Date.UTC(2024, 0, 7, 23, 59, 59); // neděle téhož týdne
  const nextWeek = Date.UTC(2024, 0, 8, 0, 0, 0); // další pondělí

  it('stejný UTC týden ⇒ stejné id; nový týden ⇒ nové id', () => {
    expect(weeklyLockoutId(monday)).toBe('2024-01-01');
    expect(weeklyLockoutId(sameWeek)).toBe('2024-01-01');
    expect(weeklyLockoutId(nextWeek)).toBe('2024-01-08');
    expect(weeklyLockoutId(sameWeek)).not.toBe(weeklyLockoutId(nextWeek));
  });

  it('id je hranou pondělí 00:00 UTC (reset)', () => {
    // O milisekundu dřív je ještě předchozí týden.
    expect(weeklyLockoutId(nextWeek - 1)).toBe('2024-01-01');
    expect(weeklyLockoutId(nextWeek)).toBe('2024-01-08');
  });

  it('lockoutResetAt vrací příští pondělí 00:00 UTC', () => {
    expect(lockoutResetAt(monday)).toBe(nextWeek);
    expect(lockoutResetAt(sameWeek)).toBe(nextWeek);
    expect(lockoutResetAt(nextWeek)).toBe(Date.UTC(2024, 0, 15, 0, 0, 0));
  });
});

describe('M8.6 lockoutIdForContent (které obsahy lockoutu podléhají)', () => {
  it('jen vyšší dungeon (scarlet) je lockoutován; nižší ne', () => {
    expect(contentHasWeeklyLockout('dungeon', 'scarlet_monastery')).toBe(true);
    expect(lockoutIdForContent('dungeon', 'scarlet_monastery')).toBe('dungeon:scarlet_monastery');
    expect(contentHasWeeklyLockout('dungeon', 'ragefire_chasm')).toBe(false);
    expect(lockoutIdForContent('dungeon', 'ragefire_chasm')).toBeNull();
  });
});
