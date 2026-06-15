/**
 * Definice itemů. Jediný zdroj pravdy pro itemy — API i web.
 * M4: základní katalog; M5+ rozšíří o zbraňové typy a set bonusy.
 */
import type { PrimaryStat } from '../character';

export type EquipmentSlot =
  | 'head' | 'neck' | 'shoulder' | 'chest' | 'waist' | 'legs' | 'feet' | 'wrist'
  | 'hands' | 'back' | 'main_hand' | 'off_hand' | 'finger1' | 'finger2' | 'trinket1' | 'trinket2';

/** Sloty sdílející "typ" (prsten, trinket → 2 fyzické sloty). */
export type ItemSlotType =
  | 'head' | 'neck' | 'shoulder' | 'chest' | 'waist' | 'legs' | 'feet' | 'wrist'
  | 'hands' | 'back' | 'main_hand' | 'off_hand' | 'finger' | 'trinket';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** Primární staty, které může item přidat. */
export type ItemStatKey = PrimaryStat | 'armor' | 'attack_power' | 'spell_power' | 'crit_rating' | 'dodge_rating';
export type ItemStats = Partial<Record<ItemStatKey, number>>;

export type ItemId = string;

export interface ItemDef {
  id: ItemId;
  name: string;
  slot: ItemSlotType;
  rarity: ItemRarity;
  /** Item level — přibližně odpovídá úrovni obsahu, kde item padá. */
  itemLevel: number;
  stats: ItemStats;
  /** Prodejní cena u vendora (v zlatých). */
  vendorGold: number;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  // --- Tier 1 (ilvl 5–15, lvl 1–10 zóny) ---
  iron_shortsword: {
    id: 'iron_shortsword', name: 'Iron Shortsword', slot: 'main_hand',
    rarity: 'common', itemLevel: 5, vendorGold: 1,
    stats: { strength: 3, agility: 1 },
  },
  leather_cap: {
    id: 'leather_cap', name: 'Leather Cap', slot: 'head',
    rarity: 'common', itemLevel: 5, vendorGold: 1,
    stats: { agility: 2, stamina: 2 },
  },
  worn_robe: {
    id: 'worn_robe', name: 'Worn Robe', slot: 'chest',
    rarity: 'common', itemLevel: 5, vendorGold: 1,
    stats: { intellect: 3, spirit: 2 },
  },
  simple_bracers: {
    id: 'simple_bracers', name: 'Simple Bracers', slot: 'wrist',
    rarity: 'common', itemLevel: 4, vendorGold: 0,
    stats: { stamina: 2 },
  },
  traveler_boots: {
    id: 'traveler_boots', name: 'Traveler\'s Boots', slot: 'feet',
    rarity: 'common', itemLevel: 6, vendorGold: 1,
    stats: { agility: 2, stamina: 1 },
  },
  scout_vest: {
    id: 'scout_vest', name: 'Scout\'s Vest', slot: 'chest',
    rarity: 'uncommon', itemLevel: 10, vendorGold: 3,
    stats: { agility: 4, stamina: 3 },
  },
  runed_staff: {
    id: 'runed_staff', name: 'Runed Staff', slot: 'main_hand',
    rarity: 'uncommon', itemLevel: 12, vendorGold: 4,
    stats: { intellect: 5, spirit: 3 },
  },
  adventurer_ring: {
    id: 'adventurer_ring', name: 'Adventurer\'s Ring', slot: 'finger',
    rarity: 'uncommon', itemLevel: 10, vendorGold: 3,
    stats: { strength: 2, stamina: 3 },
  },
  initiate_cloak: {
    id: 'initiate_cloak', name: 'Initiate\'s Cloak', slot: 'back',
    rarity: 'common', itemLevel: 7, vendorGold: 1,
    stats: { stamina: 2, spirit: 1 },
  },
  copper_amulet: {
    id: 'copper_amulet', name: 'Copper Amulet', slot: 'neck',
    rarity: 'common', itemLevel: 6, vendorGold: 1,
    stats: { stamina: 2, intellect: 1 },
  },

  // --- Tier 2 (ilvl 15–30, lvl 10–25 zóny) ---
  soldier_helm: {
    id: 'soldier_helm', name: 'Soldier\'s Helm', slot: 'head',
    rarity: 'uncommon', itemLevel: 18, vendorGold: 8,
    stats: { strength: 5, stamina: 5 },
  },
  chain_leggings: {
    id: 'chain_leggings', name: 'Chain Leggings', slot: 'legs',
    rarity: 'uncommon', itemLevel: 20, vendorGold: 10,
    stats: { strength: 6, stamina: 5, armor: 20 },
  },
  stormfury_blade: {
    id: 'stormfury_blade', name: 'Stormfury Blade', slot: 'main_hand',
    rarity: 'rare', itemLevel: 22, vendorGold: 15,
    stats: { agility: 7, strength: 5, attack_power: 10 },
  },
  spellweave_robe: {
    id: 'spellweave_robe', name: 'Spellweave Robe', slot: 'chest',
    rarity: 'rare', itemLevel: 25, vendorGold: 20,
    stats: { intellect: 9, spirit: 7, spell_power: 8 },
  },
  defender_shield: {
    id: 'defender_shield', name: 'Defender\'s Shield', slot: 'off_hand',
    rarity: 'uncommon', itemLevel: 20, vendorGold: 10,
    stats: { stamina: 8, strength: 4, armor: 40 },
  },
  amber_necklace: {
    id: 'amber_necklace', name: 'Amber Necklace', slot: 'neck',
    rarity: 'uncommon', itemLevel: 18, vendorGold: 7,
    stats: { intellect: 5, spirit: 4 },
  },
  marauder_shoulders: {
    id: 'marauder_shoulders', name: 'Marauder\'s Shoulders', slot: 'shoulder',
    rarity: 'uncommon', itemLevel: 19, vendorGold: 9,
    stats: { strength: 5, stamina: 4 },
  },
  ranger_gloves: {
    id: 'ranger_gloves', name: 'Ranger\'s Gloves', slot: 'hands',
    rarity: 'uncommon', itemLevel: 17, vendorGold: 7,
    stats: { agility: 6, stamina: 3 },
  },
  mage_trinket: {
    id: 'mage_trinket', name: 'Mana Crystal Trinket', slot: 'trinket',
    rarity: 'uncommon', itemLevel: 20, vendorGold: 8,
    stats: { intellect: 6, spirit: 4 },
  },
  crusader_belt: {
    id: 'crusader_belt', name: 'Crusader\'s Belt', slot: 'waist',
    rarity: 'uncommon', itemLevel: 18, vendorGold: 7,
    stats: { strength: 5, stamina: 4, armor: 15 },
  },

  // --- Tier 3 (ilvl 30–50, lvl 25–40 zóny) ---
  warlord_plate: {
    id: 'warlord_plate', name: 'Warlord\'s Plate', slot: 'chest',
    rarity: 'rare', itemLevel: 38, vendorGold: 40,
    stats: { strength: 12, stamina: 10, armor: 60 },
  },
  shadow_cowl: {
    id: 'shadow_cowl', name: 'Shadow Cowl', slot: 'head',
    rarity: 'rare', itemLevel: 35, vendorGold: 35,
    stats: { agility: 10, stamina: 8, crit_rating: 5 },
  },
  arcane_robes: {
    id: 'arcane_robes', name: 'Arcane Robes', slot: 'chest',
    rarity: 'epic', itemLevel: 42, vendorGold: 60,
    stats: { intellect: 15, spirit: 11, spell_power: 18 },
  },
  crusader_blade: {
    id: 'crusader_blade', name: 'Crusader\'s Blade', slot: 'main_hand',
    rarity: 'rare', itemLevel: 36, vendorGold: 38,
    stats: { strength: 11, stamina: 8, attack_power: 20 },
  },
  dragonscale_belt: {
    id: 'dragonscale_belt', name: 'Dragonscale Belt', slot: 'waist',
    rarity: 'uncommon', itemLevel: 30, vendorGold: 20,
    stats: { agility: 7, stamina: 6, armor: 25 },
  },
  jade_ring: {
    id: 'jade_ring', name: 'Jade Ring', slot: 'finger',
    rarity: 'rare', itemLevel: 32, vendorGold: 25,
    stats: { intellect: 8, spirit: 6 },
  },
  titan_boots: {
    id: 'titan_boots', name: 'Titan Boots', slot: 'feet',
    rarity: 'rare', itemLevel: 36, vendorGold: 32,
    stats: { strength: 9, stamina: 8, armor: 30 },
  },
  emerald_trinket: {
    id: 'emerald_trinket', name: 'Emerald Trinket', slot: 'trinket',
    rarity: 'uncommon', itemLevel: 28, vendorGold: 15,
    stats: { stamina: 8, spirit: 5 },
  },
  shadow_vambraces: {
    id: 'shadow_vambraces', name: 'Shadow Vambraces', slot: 'wrist',
    rarity: 'rare', itemLevel: 33, vendorGold: 22,
    stats: { agility: 7, stamina: 6 },
  },
  moonfire_cloak: {
    id: 'moonfire_cloak', name: 'Moonfire Cloak', slot: 'back',
    rarity: 'rare', itemLevel: 34, vendorGold: 28,
    stats: { intellect: 8, stamina: 5, spell_power: 6 },
  },

  // --- M5: Dungeon boss loot (vyšší ilvl, instance-only) ---
  taragaman_hammer: {
    id: 'taragaman_hammer', name: 'Taragaman\'s Hammer', slot: 'main_hand',
    rarity: 'rare', itemLevel: 16, vendorGold: 18,
    stats: { strength: 6, stamina: 4, attack_power: 8 },
  },
  smites_mace: {
    id: 'smites_mace', name: 'Smite\'s Reaver', slot: 'main_hand',
    rarity: 'rare', itemLevel: 22, vendorGold: 24,
    stats: { strength: 8, stamina: 5, attack_power: 12 },
  },
  cookies_stirring_rod: {
    id: 'cookies_stirring_rod', name: 'Cookie\'s Stirring Rod', slot: 'main_hand',
    rarity: 'rare', itemLevel: 23, vendorGold: 24,
    stats: { intellect: 9, spirit: 5, spell_power: 12 },
  },
  fang_of_the_deeps: {
    id: 'fang_of_the_deeps', name: 'Fang of the Deeps', slot: 'main_hand',
    rarity: 'rare', itemLevel: 26, vendorGold: 28,
    stats: { agility: 10, stamina: 5, crit_rating: 6 },
  },
  belremil_band: {
    id: 'belremil_band', name: 'Band of Belremil', slot: 'finger',
    rarity: 'rare', itemLevel: 28, vendorGold: 26,
    stats: { intellect: 7, stamina: 5, spell_power: 8 },
  },
  commanders_crest: {
    id: 'commanders_crest', name: 'Commander\'s Crest', slot: 'off_hand',
    rarity: 'epic', itemLevel: 36, vendorGold: 55,
    stats: { stamina: 14, strength: 8, armor: 70 },
  },
  whitemane_chapeau: {
    id: 'whitemane_chapeau', name: 'Whitemane\'s Chapeau', slot: 'head',
    rarity: 'epic', itemLevel: 38, vendorGold: 60,
    stats: { intellect: 16, spirit: 10, spell_power: 16 },
  },
  herod_shoulder: {
    id: 'herod_shoulder', name: 'Herod\'s Shoulder', slot: 'shoulder',
    rarity: 'epic', itemLevel: 37, vendorGold: 58,
    stats: { strength: 14, stamina: 11, attack_power: 18 },
  },

  // --- Craftable gear (Blacksmithing, M6) ---
  copper_dagger: {
    id: 'copper_dagger', name: 'Copper Dagger', slot: 'main_hand',
    rarity: 'common', itemLevel: 8, vendorGold: 2,
    stats: { strength: 2, agility: 3 },
  },
  iron_warhammer: {
    id: 'iron_warhammer', name: 'Iron Warhammer', slot: 'main_hand',
    rarity: 'uncommon', itemLevel: 20, vendorGold: 6,
    stats: { strength: 7, stamina: 4, attack_power: 8 },
  },
  mithril_breastplate: {
    id: 'mithril_breastplate', name: 'Mithril Breastplate', slot: 'chest',
    rarity: 'rare', itemLevel: 34, vendorGold: 14,
    stats: { strength: 9, stamina: 12, armor: 20 },
  },
  masterwork_blade: {
    id: 'masterwork_blade', name: 'Masterwork Blade', slot: 'main_hand',
    rarity: 'epic', itemLevel: 40, vendorGold: 40,
    stats: { strength: 16, agility: 6, attack_power: 22, crit_rating: 6 },
  },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export function isItemId(value: string): value is ItemId {
  return value in ITEMS;
}

/** Mapování equipment slotů na item slot typ (pro validaci equipu). */
export const SLOT_TO_ITEM_SLOT: Record<EquipmentSlot, ItemSlotType> = {
  head: 'head', neck: 'neck', shoulder: 'shoulder', chest: 'chest',
  waist: 'waist', legs: 'legs', feet: 'feet', wrist: 'wrist',
  hands: 'hands', back: 'back', main_hand: 'main_hand', off_hand: 'off_hand',
  finger1: 'finger', finger2: 'finger', trinket1: 'trinket', trinket2: 'trinket',
};

export const EQUIPMENT_SLOTS: EquipmentSlot[] = [
  'head', 'neck', 'shoulder', 'chest', 'waist', 'legs', 'feet', 'wrist',
  'hands', 'back', 'main_hand', 'off_hand', 'finger1', 'finger2', 'trinket1', 'trinket2',
];

export function isEquipmentSlot(value: string): value is EquipmentSlot {
  return EQUIPMENT_SLOTS.includes(value as EquipmentSlot);
}

/** Sečte staty všech equipnutých itemů. */
export function sumEquipmentStats(equippedItems: ItemDef[]): ItemStats {
  const result: ItemStats = {};
  for (const item of equippedItems) {
    for (const [key, val] of Object.entries(item.stats) as [ItemStatKey, number][]) {
      result[key] = (result[key] ?? 0) + val;
    }
  }
  return result;
}
