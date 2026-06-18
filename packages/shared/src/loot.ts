/**
 * Loot tabulky a roll logika. Používá SeededRng → deterministické výsledky.
 * M4: loot z questů (per zone bracket). M5+ boss loot (dungeony/raidy).
 *
 * **MR-10c — rarity-driven drop rate.** Relativní váha každého dropu se odvozuje
 * z **rarity itemu** (`RARITY_DROP_WEIGHT`), ne z ad-hoc čísel per záznam: vzácnější
 * item = nižší váha = méně častý drop. `anyDropChance` per tabulka řídí, zda vůbec
 * něco padne (= celková štědrost / pacing, beze změny). `rollLoot` váhy normalizuje,
 * takže záleží jen na poměrech. Level-range pásma srovnaná na cap 20 (MR-11).
 */
import { SeededRng } from './rng';
import { ITEMS, type ItemId, type ItemRarity } from './data/items';

export interface LootEntry {
  itemId: ItemId;
  /** Relativní váha dropu (z rarity itemu). Normalizuje se ve `rollLoot`. */
  dropChance: number;
}

export interface LootTable {
  /** Šance, že aktivita vůbec dropne item (0–1). */
  anyDropChance: number;
  entries: LootEntry[];
}

/**
 * Relativní váha dropu dle rarity itemu (MR-10c). Common nejčastější, legendary
 * „chase" drop. Hodnoty jsou relativní (normalizují se per tabulka ve `rollLoot`).
 */
export const RARITY_DROP_WEIGHT: Record<ItemRarity, number> = {
  common: 1,
  uncommon: 0.6,
  rare: 0.35,
  epic: 0.15,
  legendary: 0.05,
};

/**
 * Postaví loot tabulku s váhami odvozenými z rarity itemů (MR-10c). Autor řeší jen
 * `anyDropChance` (štědrost) + seznam itemů; relativní šance vyplyne z rarity.
 */
function rarityTable(anyDropChance: number, itemIds: readonly ItemId[]): LootTable {
  return {
    anyDropChance,
    entries: itemIds.map((itemId) => {
      const item = ITEMS[itemId];
      if (!item) throw new Error(`Loot table references unknown item: ${itemId}`);
      return { itemId, dropChance: RARITY_DROP_WEIGHT[item.rarity] };
    }),
  };
}

/** Loot tabulky per zone bracket (klíč = zoneId prefix nebo bracket). */
export const ZONE_LOOT_TABLES: Record<string, LootTable> = {
  // Tier 1 zóny (level 1–4: Dawnhollow / Durotar)
  bracket_1: rarityTable(0.25, [
    'iron_shortsword',
    'leather_cap',
    'worn_robe',
    'simple_bracers',
    'traveler_boots',
    'copper_amulet',
    'initiate_cloak',
    'scout_vest',
    'runed_staff',
    'adventurer_ring',
    'oak_buckler',
  ]),
  // Tier 2 zóny (level 4–9: Westfall / Barrens)
  bracket_2: rarityTable(0.25, [
    'scout_vest',
    'runed_staff',
    'adventurer_ring',
    'soldier_helm',
    'chain_leggings',
    'amber_necklace',
    'marauder_shoulders',
    'ranger_gloves',
    'crusader_belt',
    'stormfury_blade',
    'spellweave_robe',
    'defender_shield',
    'mage_trinket',
    'huntsman_cloak',
  ]),
  // Tier 3 zóny (level 9–14: Duskwood / Thousand Needles)
  bracket_3: rarityTable(0.3, [
    'soldier_helm',
    'stormfury_blade',
    'spellweave_robe',
    'warlord_plate',
    'shadow_cowl',
    'crusader_blade',
    'dragonscale_belt',
    'jade_ring',
    'titan_boots',
    'shadow_vambraces',
    'moonfire_cloak',
    'emerald_trinket',
    'sentinel_legguards',
    'arcane_robes',
  ]),
  // Tier 4 zóny (level 14–20: EPL / Felwood frontier)
  bracket_4: rarityTable(0.32, [
    'plaguebloom_circlet',
    'runecloth_robe',
    'girdle_of_the_mendicant',
    'wildheart_spaulders',
    'feltracker_boots',
    'chromatic_chainmail',
    'plaguehound_leggings',
    'gauntlets_of_the_fallen',
    'bracers_of_undeath',
    'bonereaver_greatsword',
    'wardens_bulwark',
    'corruptors_cloak',
    'cenarion_signet',
    'nightmare_band',
  ]),
};

/** Zone → loot bracket mapping (z quests.ts zoneId). */
export const ZONE_TO_BRACKET: Record<string, string> = {
  northshire: 'bracket_1',
  durotar: 'bracket_1',
  westfall: 'bracket_2',
  barrens: 'bracket_2',
  duskwood: 'bracket_3',
  thousand_needles: 'bracket_3',
  eastern_plaguelands: 'bracket_4',
  felwood: 'bracket_4',
};

/**
 * Boss loot tabulky per dungeon (M5). Vyšší `anyDropChance` než questy + dungeon-only
 * itemy. Relativní šance dle rarity (MR-10c). Klíč = dungeonId.
 */
export const DUNGEON_LOOT_TABLES: Record<string, LootTable> = {
  ragefire_chasm: rarityTable(0.8, [
    'taragaman_hammer',
    'iron_shortsword',
    'scout_vest',
    'adventurer_ring',
    'runed_staff',
  ]),
  deadmines: rarityTable(0.85, [
    'smites_mace',
    'cookies_stirring_rod',
    'soldier_helm',
    'chain_leggings',
    'stormfury_blade',
    'defender_shield',
  ]),
  shadowfang_keep: rarityTable(0.9, [
    'fang_of_the_deeps',
    'belremil_band',
    'spellweave_robe',
    'marauder_shoulders',
    'ranger_gloves',
    'crusader_belt',
  ]),
  scarlet_monastery: rarityTable(0.95, [
    'commanders_crest',
    'whitemane_chapeau',
    'herod_shoulder',
    'warlord_plate',
    'shadow_cowl',
    'crusader_blade',
    'titan_boots',
    'arcane_robes',
  ]),
  // ── M12: nízkoúrovňové dungeony ─────────────────────────────────────────────
  wailing_caverns: rarityTable(0.82, [
    'wc_serpentine_band',
    'wc_deviate_hide_pauldrons',
    'ranger_gloves',
    'huntsman_cloak',
    'amber_necklace',
  ]),
  blackfathom_deeps: rarityTable(0.85, [
    'bfd_rod_of_the_sleeper',
    'bfd_gaze_dreamer_robes',
    'marauder_shoulders',
    'crusader_belt',
    'mage_trinket',
  ]),
  // ── M12: vyšší dungeony (~15–20) ────────────────────────────────────────────
  zulfarrak: rarityTable(0.88, [
    'zf_sandstalker_ankleguards',
    'zf_jinxed_hoodoo_staff',
    'zf_bloodmail_gauntlets',
    'feltracker_boots',
    'bracers_of_undeath',
  ]),
  maraudon: rarityTable(0.9, [
    'mar_theradras_scepter',
    'mar_elemental_girdle',
    'mar_lifegiving_gem',
    'plaguehound_leggings',
    'cenarion_signet',
  ]),
  blackrock_depths: rarityTable(0.92, [
    'brd_ironfoe',
    'brd_emperors_seal',
    'brd_flameweave_cuffs',
    'chromatic_chainmail',
    'gauntlets_of_the_fallen',
  ]),
  stratholme: rarityTable(0.95, [
    'strat_runeblade_rivendare',
    'strat_deathbone_legguards',
    'strat_skul_cap',
    'corruptors_cloak',
    'nightmare_band',
  ]),
};

// Raid loot tabulky (`RAID_LOOT_TABLES`) byly odstraněny s vyříznutím raidů
// (ADR 0033). Definice raid-exkluzivních itemů zůstávají v `data/items.ts`, aby
// se nerozbily kusy, které hráči už vlastní — jen je nelze nově získat.

/**
 * Roluje loot z tabulky. Vrátí pole itemId (obvykle 0 nebo 1 item).
 * Seeduje se z aktivity → deterministické.
 *
 * `dropChanceMult` (default 1) škáluje šanci, že vůbec něco padne — používá
 * M8.5-A k snížení šance na loot s počtem wipů. Vždy spotřebuje stejný počet
 * `rng.next()` volání → škálování nemění determinismus zbytku runu.
 */
export function rollLoot(table: LootTable, rng: SeededRng, dropChanceMult = 1): ItemId[] {
  // Náhodně rozhodne, zda vůbec padne item
  if (rng.next() > table.anyDropChance * dropChanceMult) return [];

  // Zvolí konkrétní item váhovaným rollem (váhy = rarity, normalizované)
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
