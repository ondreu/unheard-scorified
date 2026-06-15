import { describe, expect, it } from 'vitest';
import {
  AUCTION_DURATIONS,
  auctionCut,
  auctionDeposit,
  isAuctionDurationId,
  isTradeableItem,
  itemDisplayName,
  itemVendorValue,
  minNextBid,
  sellerProceeds,
} from './index';

describe('auction item lookup', () => {
  it('resolves vendor value across catalogs', () => {
    expect(itemVendorValue('masterwork_blade')).toBeGreaterThan(0); // gear
    expect(itemVendorValue('copper_ore')).toBeGreaterThan(0); // material
    expect(itemVendorValue('healing_potion')).toBeGreaterThan(0); // consumable
    expect(itemVendorValue('nonsense')).toBe(0);
  });

  it('resolves display names and tradeability', () => {
    expect(itemDisplayName('copper_ore')).toBe('Copper Ore');
    expect(itemDisplayName('unknown_x')).toBe('unknown_x');
    expect(isTradeableItem('ashkandi')).toBe(true);
    expect(isTradeableItem('peacebloom')).toBe(true);
    expect(isTradeableItem('unknown_x')).toBe(false);
  });
});

describe('auction durations', () => {
  it('validates ids', () => {
    expect(isAuctionDurationId('short')).toBe(true);
    expect(isAuctionDurationId('forever')).toBe(false);
  });
});

describe('auction fees', () => {
  it('deposit scales with quantity and duration factor', () => {
    const short = auctionDeposit('iron_ore', 10, 'short');
    const long = auctionDeposit('iron_ore', 10, 'long');
    expect(short).toBeGreaterThanOrEqual(1);
    expect(AUCTION_DURATIONS.long.depositFactor).toBeGreaterThan(
      AUCTION_DURATIONS.short.depositFactor,
    );
    expect(long).toBeGreaterThan(short);
  });

  it('cut is 5% and seller proceeds is price minus cut', () => {
    expect(auctionCut(1000)).toBe(50);
    expect(sellerProceeds(1000)).toBe(950);
  });
});

describe('minNextBid', () => {
  it('first bid is the start bid', () => {
    expect(minNextBid(100, null)).toBe(100);
  });
  it('subsequent bids add an increment', () => {
    expect(minNextBid(100, 200)).toBe(210); // +5%
    expect(minNextBid(100, 5)).toBe(6); // min increment 1
  });
});
