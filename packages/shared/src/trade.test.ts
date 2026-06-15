import { describe, expect, it } from 'vitest';
import { canTradeItem, TRADE_SIDES, TRADE_STATUSES, tradeReady } from './trade';

describe('p2p trade helpers', () => {
  it('stavy a strany', () => {
    expect(TRADE_STATUSES).toEqual(['open', 'completed', 'cancelled']);
    expect(TRADE_SIDES).toEqual(['initiator', 'partner']);
  });

  it('tradeReady jen když obě strany potvrdí', () => {
    expect(tradeReady(true, true)).toBe(true);
    expect(tradeReady(true, false)).toBe(false);
    expect(tradeReady(false, false)).toBe(false);
  });

  it('canTradeItem odmítne neznámé a soulbound, povolí běžné', () => {
    expect(canTradeItem('definitely_not_an_item')).toBe(false);
    // Běžný materiál je obchodovatelný (není soulbound).
    expect(canTradeItem('copper_ore')).toBe(true);
  });
});
