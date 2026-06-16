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
      { itemId: 'oak_buckler', dropChance: 0.12 },
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
      { itemId: 'huntsman_cloak', dropChance: 0.10 },
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
      { itemId: 'sentinel_legguards', dropChance: 0.10 },
      // Epic
      { itemId: 'arcane_robes', dropChance: 0.03 },
    ],
  },
  // Alliance/Horde Tier 4 zóny (level 40–60) — M12 frontier (EPL / Felwood)
  bracket_4: {
    anyDropChance: 0.32,
    entries: [
      { itemId: 'plaguebloom_circlet', dropChance: 0.10 },
      { itemId: 'runecloth_robe', dropChance: 0.10 },
      { itemId: 'girdle_of_the_mendicant', dropChance: 0.10 },
      { itemId: 'wildheart_spaulders', dropChance: 0.10 },
      { itemId: 'feltracker_boots', dropChance: 0.10 },
      { itemId: 'chromatic_chainmail', dropChance: 0.10 },
      { itemId: 'plaguehound_leggings', dropChance: 0.10 },
      { itemId: 'gauntlets_of_the_fallen', dropChance: 0.10 },
      { itemId: 'bracers_of_undeath', dropChance: 0.10 },
      { itemId: 'bonereaver_greatsword', dropChance: 0.08 },
      { itemId: 'wardens_bulwark', dropChance: 0.08 },
      { itemId: 'corruptors_cloak', dropChance: 0.10 },
      { itemId: 'cenarion_signet', dropChance: 0.10 },
      // Epic (vzácný)
      { itemId: 'nightmare_band', dropChance: 0.03 },
    ],
  },
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
 * Boss loot tabulky per dungeon (M5). Vyšší šance na drop než questy +
 * dungeon-only itemy. Klíč = dungeonId.
 */
export const DUNGEON_LOOT_TABLES: Record<string, LootTable> = {
  ragefire_chasm: {
    anyDropChance: 0.8,
    entries: [
      { itemId: 'taragaman_hammer', dropChance: 0.25 },
      { itemId: 'iron_shortsword', dropChance: 0.15 },
      { itemId: 'scout_vest', dropChance: 0.2 },
      { itemId: 'adventurer_ring', dropChance: 0.2 },
      { itemId: 'runed_staff', dropChance: 0.2 },
    ],
  },
  deadmines: {
    anyDropChance: 0.85,
    entries: [
      { itemId: 'smites_mace', dropChance: 0.18 },
      { itemId: 'cookies_stirring_rod', dropChance: 0.18 },
      { itemId: 'soldier_helm', dropChance: 0.16 },
      { itemId: 'chain_leggings', dropChance: 0.16 },
      { itemId: 'stormfury_blade', dropChance: 0.16 },
      { itemId: 'defender_shield', dropChance: 0.16 },
    ],
  },
  shadowfang_keep: {
    anyDropChance: 0.9,
    entries: [
      { itemId: 'fang_of_the_deeps', dropChance: 0.16 },
      { itemId: 'belremil_band', dropChance: 0.16 },
      { itemId: 'spellweave_robe', dropChance: 0.18 },
      { itemId: 'marauder_shoulders', dropChance: 0.16 },
      { itemId: 'ranger_gloves', dropChance: 0.16 },
      { itemId: 'crusader_belt', dropChance: 0.18 },
    ],
  },
  scarlet_monastery: {
    anyDropChance: 0.95,
    entries: [
      { itemId: 'commanders_crest', dropChance: 0.1 },
      { itemId: 'whitemane_chapeau', dropChance: 0.1 },
      { itemId: 'herod_shoulder', dropChance: 0.1 },
      { itemId: 'warlord_plate', dropChance: 0.16 },
      { itemId: 'shadow_cowl', dropChance: 0.16 },
      { itemId: 'crusader_blade', dropChance: 0.16 },
      { itemId: 'titan_boots', dropChance: 0.16 },
      { itemId: 'arcane_robes', dropChance: 0.06 },
    ],
  },
};

/**
 * Raid loot tabulky per raid (M8). Vyšší šance na drop než dungeony + epic/
 * legendary raid-only itemy. Klíč = raidId. Loot se rolluje per účastník při
 * vítězství (deterministicky, seed odvozený z runu + postavy).
 */
export const RAID_LOOT_TABLES: Record<string, LootTable> = {
  molten_core: {
    anyDropChance: 0.95,
    entries: [
      { itemId: 'earthshaker', dropChance: 0.16 },
      { itemId: 'robe_of_volatile_power', dropChance: 0.16 },
      { itemId: 'aged_core_leather_gloves', dropChance: 0.18 },
      { itemId: 'sabatons_of_the_flamewalker', dropChance: 0.18 },
      { itemId: 'choker_of_enlightenment', dropChance: 0.18 },
      // Vyšší ilvl gear ze základních tier 3 zón jako „útěcha"
      { itemId: 'arcane_robes', dropChance: 0.07 },
    ],
  },
  blackwing_lair: {
    anyDropChance: 1.0,
    entries: [
      { itemId: 'netherwind_crown', dropChance: 0.16 },
      { itemId: 'drake_talon_pauldrons', dropChance: 0.18 },
      { itemId: 'ringo_drakefire', dropChance: 0.18 },
      { itemId: 'cloak_of_draconic_might', dropChance: 0.18 },
      { itemId: 'earthshaker', dropChance: 0.1 },
      { itemId: 'robe_of_volatile_power', dropChance: 0.1 },
      // Legendary (vzácný)
      { itemId: 'ashkandi', dropChance: 0.04 },
    ],
  },
  // M12 tier 1.5 raid (Zul'Gurub, ~lvl 50) — most mezi Molten Core a Blackwing Lair.
  zulgurub: {
    anyDropChance: 0.97,
    entries: [
      { itemId: 'zg_halberd_of_smiting', dropChance: 0.16 },
      { itemId: 'zg_bloodlords_chestplate', dropChance: 0.16 },
      { itemId: 'zg_primalist_belt', dropChance: 0.16 },
      { itemId: 'zg_overlord_helmet', dropChance: 0.16 },
      { itemId: 'zg_jindo_mantle', dropChance: 0.16 },
      { itemId: 'zg_zanzils_seal', dropChance: 0.16 },
      // Útěcha z Molten Core (nižší šance)
      { itemId: 'choker_of_enlightenment', dropChance: 0.08 },
    ],
  },
  // M12 tier 3 raid (Temple of Ahn'Qiraj, ~lvl 58) — nový top-end nad Blackwing Lair.
  ahnqiraj: {
    anyDropChance: 1.0,
    entries: [
      { itemId: 'aq_silithid_carapace', dropChance: 0.17 },
      { itemId: 'aq_qiraji_bindings', dropChance: 0.17 },
      { itemId: 'aq_gloves_of_the_immortal', dropChance: 0.17 },
      { itemId: 'aq_ring_of_emperors', dropChance: 0.17 },
      { itemId: 'aq_cloak_of_the_golden_hive', dropChance: 0.17 },
      // Útěcha z Blackwing Lair
      { itemId: 'ringo_drakefire', dropChance: 0.1 },
      // Legendary (velmi vzácný) — C'Thun
      { itemId: 'aq_scepter_shifting_sands', dropChance: 0.04 },
    ],
  },
};

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
