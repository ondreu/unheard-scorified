/**
 * Vendoři (M10, ekonomika). NPC obchod: hráč může **prodat** věci z inventáře za
 * jejich `vendorGold` (gold source) a **koupit** základní zásoby z pevného
 * sortimentu za `vendorBuyPrice` (gold sink). Jediný zdroj pravdy pro API i web.
 *
 * Na rozdíl od Auction House (hráč↔hráč) je vendor čistě NPC: ceny jsou pevné,
 * žádné aukce. Soulbound (BoP) itemy LZE prodat vendorovi (na rozdíl od AH) —
 * vendor je jediný odbyt pro vázaný loot.
 */
import { itemVendorValue, isTradeableItem } from './auction';

/** Vendor prodává se ziskem: nákupní cena = vendor hodnota × markup. */
export const VENDOR_BUY_MARKUP = 5;

/**
 * Sortiment vendora — základní (volně dostupné) vybavení a zásoby napříč
 * armor typy + spotřebáky, aby každá classa měla startovní výbavu i bez dropů.
 * Jen ne-soulbound, nízko-tier věci. Ceny se počítají z `vendorBuyPrice`.
 */
export const VENDOR_STOCK: string[] = [
  // Cloth (caster základ)
  'acolyte_hood', 'apprentice_mantle', 'silk_girdle', 'woven_wristwraps',
  'enchanters_gloves', 'sandals_of_insight', 'mystic_leggings', 'worn_robe',
  // Leather / mail / plate startovní kusy
  'leather_cap', 'traveler_boots', 'simple_bracers', 'scout_vest',
  // Zbraně / doplňky bez armor omezení
  'iron_shortsword', 'oak_buckler', 'initiate_cloak', 'copper_amulet',
  'adventurer_ring',
  // Spotřebáky
  'minor_healing_potion', 'healing_potion',
];

const VENDOR_STOCK_SET = new Set(VENDOR_STOCK);

/** Prodejní cena, kterou hráč dostane za prodej itemu vendorovi. */
export function vendorSellPrice(itemId: string): number {
  return itemVendorValue(itemId);
}

/** Nákupní cena, za kterou hráč koupí item od vendora (gold sink). */
export function vendorBuyPrice(itemId: string): number {
  return Math.max(1, itemVendorValue(itemId) * VENDOR_BUY_MARKUP);
}

/** Lze item prodat vendorovi? Musí být znám a mít nenulovou hodnotu. */
export function isVendorSellable(itemId: string): boolean {
  return isTradeableItem(itemId) && itemVendorValue(itemId) > 0;
}

/** Prodává vendor tento item? */
export function isVendorStock(itemId: string): boolean {
  return VENDOR_STOCK_SET.has(itemId);
}
