/**
 * Loot tabulky a roll logika. Používá SeededRng → deterministické výsledky.
 * M4: loot z questů (per zone bracket). M5+ rozšíří o boss loot.
 */
import { SeededRng } from './rng';
import type { ItemId } from './data/items';

export interface LootEntry {
  itemId: ItemId;
  /** Šance na drop (0–1). */
  dropChance: number;
}

export interface LootTable {
  /** Šance, že aktivita vůbec dropne item (0–1). */
  anyDropChance: number;
  entries: LootEntry[];
}

/** Loot tabulky per zone bracket (klíč = zoneId prefix nebo bracket). */
export const ZONE_LOOT_TABLES: Record<string, LootTable> = {
  // Alliance/Horde Tier 1 zóny (level 1–10)
  bracket_1: {
    anyDropChance: 0.25,
    entries: [
      { itemId: 'iron_shortsword', dropChance: 0.20 },
      { itemId: 'leather_cap', dropChance: 0.20 },
      { itemId: 'worn_robe', dropChance: 0.15 },
      { itemId: 'simple_bracers', dropChance: 0.15 },
      { itemId: 'traveler_boots', dropChance: 0.15 },
      { itemId: 'copper_amulet', dropChance: 0.10 },
      { itemId: 'initiate_cloak', dropChance: 0.05 },
      // Uncommon
      { itemId: 'scout_vest', dropChance: 0.08 },
      { itemId: 'runed_staff', dropChance: 0.08 },
      { itemId: 'adventurer_ring', dropChance: 0.08 },
    ],
  },
  // Alliance/Horde Tier 2 zóny (level 10–25)
  bracket_2: {
    anyDropChance: 0.25,
    entries: [
      { itemId: 'scout_vest', dropChance: 0.10 },
      { itemId: 'runed_staff', dropChance: 0.10 },
      { itemId: 'adventurer_ring', dropChance: 0.10 },
      { itemId: 'soldier_helm', dropChance: 0.15 },
      { itemId: 'chain_leggings', dropChance: 0.12 },
      { itemId: 'amber_necklace', dropChance: 0.12 },
      { itemId: 'marauder_shoulders', dropChance: 0.10 },
      { itemId: 'ranger_gloves', dropChance: 0.10 },
      { itemId: 'crusader_belt', dropChance: 0.10 },
      // Rare
      { itemId: 'stormfury_blade', dropChance: 0.05 },
      { itemId: 'spellweave_robe', dropChance: 0.05 },
      { itemId: 'defender_shield', dropChance: 0.07 },
      { itemId: 'mage_trinket', dropChance: 0.07 },
    ],
  },
  // Alliance/Horde Tier 3 zóny (level 25–40)
  bracket_3: {
    anyDropChance: 0.30,
    entries: [
      { itemId: 'soldier_helm', dropChance: 0.05 },
      { itemId: 'stormfury_blade', dropChance: 0.08 },
      { itemId: 'spellweave_robe', dropChance: 0.06 },
      { itemId: 'warlord_plate', dropChance: 0.12 },
      { itemId: 'shadow_cowl', dropChance: 0.12 },
      { itemId: 'crusader_blade', dropChance: 0.10 },
      { itemId: 'dragonscale_belt', dropChance: 0.10 },
      { itemId: 'jade_ring', dropChance: 0.10 },
      { itemId: 'titan_boots', dropChance: 0.10 },
      { itemId: 'shadow_vambraces', dropChance: 0.08 },
      { itemId: 'moonfire_cloak', dropChance: 0.08 },
      { itemId: 'emerald_trinket', dropChance: 0.10 },
      // Epic
      { itemId: 'arcane_robes', dropChance: 0.03 },
    ],
  },
};

/** Zone → loot bracket mapping (z quests.ts zoneId). */
export const ZONE_TO_BRACKET: Record<string, string> = {
  northshire: 'bracket_1',
  durotar: 'bracket_1',
  westfall: 'bracket_2',
  the_barrens: 'bracket_2',
  duskwood: 'bracket_3',
  thousand_needles: 'bracket_3',
};

/**
 * Roluje loot z tabulky. Vrátí pole itemId (obvykle 0 nebo 1 item).
 * Seeduje se z aktivity → deterministické.
 */
export function rollLoot(table: LootTable, rng: SeededRng): ItemId[] {
  // Náhodně rozhodne, zda vůbec padne item
  if (rng.next() > table.anyDropChance) return [];

  // Zvolí konkrétní item váhovaným rollem
  const roll = rng.next();
  let cumulative = 0;
  const total = table.entries.reduce((s, e) => s + e.dropChance, 0);
  for (const entry of table.entries) {
    cumulative += entry.dropChance / total;
    if (roll < cumulative) {
      return [entry.itemId];
    }
  }
  return [];
}
