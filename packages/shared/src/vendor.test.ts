import { describe, expect, it } from 'vitest';
import {
  VENDOR_STOCK,
  VENDOR_BUY_MARKUP,
  vendorBuyPrice,
  vendorSellPrice,
  isVendorSellable,
  isVendorStock,
  itemVendorValue,
  CONSUMABLE_BUFFS,
  consumableBuff,
  ITEMS,
  isSoulbound,
} from './index';

describe('vendor', () => {
  it('sell price = vendor value, buy price = value × markup (min 1)', () => {
    expect(vendorSellPrice('worn_robe')).toBe(itemVendorValue('worn_robe'));
    expect(vendorBuyPrice('worn_robe')).toBe(itemVendorValue('worn_robe') * VENDOR_BUY_MARKUP);
    // item s vendorGold 0 → buy aspoň 1
    expect(vendorBuyPrice('simple_bracers')).toBeGreaterThanOrEqual(1);
  });

  it('buy price je vždy vyšší než sell price (vendor marže)', () => {
    for (const id of VENDOR_STOCK) {
      expect(vendorBuyPrice(id)).toBeGreaterThanOrEqual(vendorSellPrice(id));
    }
  });

  it('sortiment obsahuje jen známé, ne-soulbound věci', () => {
    for (const id of VENDOR_STOCK) {
      expect(isVendorStock(id)).toBe(true);
      expect(isSoulbound(id)).toBe(false);
    }
  });

  it('soulbound item lze prodat vendorovi (ale není v sortimentu)', () => {
    const bop = Object.values(ITEMS).find((i) => i.bindType === 'bop');
    expect(bop).toBeDefined();
    expect(isVendorSellable(bop!.id)).toBe(true);
    expect(isVendorStock(bop!.id)).toBe(false);
  });

  it('neznámý item není prodejný', () => {
    expect(isVendorSellable('not_a_real_item')).toBe(false);
    expect(vendorSellPrice('not_a_real_item')).toBe(0);
  });
});

describe('consumable buffs', () => {
  it('každý spotřebák má buff s kladnou dobou trvání', () => {
    for (const [id, buff] of Object.entries(CONSUMABLE_BUFFS)) {
      expect(buff.durationSec, id).toBeGreaterThan(0);
      expect(Object.keys(buff.stats).length, id).toBeGreaterThan(0);
    }
  });

  it('consumableBuff vrací efekt jen pro známé spotřebáky', () => {
    expect(consumableBuff('elixir_of_strength')?.stats.strength).toBe(15);
    expect(consumableBuff('iron_shortsword')).toBeUndefined();
  });
});
