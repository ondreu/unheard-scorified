/**
 * Definice itemů. Jediný zdroj pravdy pro itemy — API i web.
 * M4: základní katalog; M5+ rozšíří o zbraňové typy a set bonusy.
 */
import type { PrimaryStat } from '../character';
import type { ClassId } from './classes';

export type EquipmentSlot =
  | 'head' | 'neck' | 'shoulder' | 'chest' | 'waist' | 'legs' | 'feet' | 'wrist'
  | 'hands' | 'back' | 'main_hand' | 'off_hand' | 'finger1' | 'finger2' | 'trinket1' | 'trinket2';

/**
 * Sloty sdílející "typ" (prsten, trinket → 2 fyzické sloty). `bag` je speciální:
 * NEpatří do equipment slotů (do `SLOT_TO_ITEM_SLOT` se nemapuje), batoh se
 * „equipne" do samostatného bag slotu — viz `inventory.ts`.
 */
export type ItemSlotType =
  | 'head' | 'neck' | 'shoulder' | 'chest' | 'waist' | 'legs' | 'feet' | 'wrist'
  | 'hands' | 'back' | 'main_hand' | 'off_hand' | 'finger' | 'trinket' | 'bag';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/**
 * Vazba itemu (M8.6, ekonomika). `none` = volně obchodovatelný; `bop`
 * (Bind-on-Pickup) = vázaný při sebrání (raid/dungeon personal loot) → na AH
 * neprodejný, obchodovatelný jen v trade-window (M9); `boe` (Bind-on-Equip) =
 * obchodovatelný dokud se neobleče (zatím se „equip bind" netrackuje — chová se
 * jako obchodovatelný). Viz ADR 0015.
 */
export type BindType = 'none' | 'bop' | 'boe';

/**
 * Typ brnění (M10 feat — armor types). Platí jen pro „armor" sloty
 * (`ARMOR_SLOT_TYPES`); zbraně, šperky, plášť a off-hand armorClass nemají
 * (jsou bez omezení podle classy). Classa smí nosit jen typy z
 * `CLASS_ARMOR_PROFICIENCY` (vanilla-style: cloth < leather < mail < plate).
 */
export type ArmorClass = 'cloth' | 'leather' | 'mail' | 'plate';

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
  /**
   * Vazba itemu (M8.6). Volitelné — chybí ⇒ `none` (volně obchodovatelný).
   * Naplňuje se z katalogových seznamů `BIND_ON_PICKUP` / `BIND_ON_EQUIP` níže
   * (jediný zdroj pravdy), aby zůstal explicitní a na jednom místě.
   */
  bindType?: BindType;
  /**
   * Typ brnění (M10 feat). Vyplněné jen u kusů v „armor" slotech
   * (`ARMOR_SLOT_TYPES`); naplňuje se z `ARMOR_CLASS_BY_ITEM` níže. Chybí ⇒
   * item nemá armor omezení (zbraně/šperky/plášť/off-hand → nosí každá classa).
   */
  armorClass?: ArmorClass;
  /**
   * Počet slotů, které batoh přidá, je-li vložen do bag slotu (M10 limited
   * inventory). Vyplněné jen u `slot: 'bag'`. Viz `inventory.ts`.
   */
  bagSlots?: number;
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

  // --- M8: Raid loot (epic/legendary, raid-only) ---
  // Tier 1 raid (Molten Core, ~lvl 40)
  earthshaker: {
    id: 'earthshaker', name: 'Earthshaker', slot: 'main_hand',
    rarity: 'epic', itemLevel: 50, vendorGold: 80,
    stats: { strength: 20, stamina: 14, attack_power: 28, crit_rating: 8 },
  },
  robe_of_volatile_power: {
    id: 'robe_of_volatile_power', name: 'Robe of Volatile Power', slot: 'chest',
    rarity: 'epic', itemLevel: 50, vendorGold: 80,
    stats: { intellect: 22, spirit: 14, spell_power: 26 },
  },
  aged_core_leather_gloves: {
    id: 'aged_core_leather_gloves', name: 'Aged Core Leather Gloves', slot: 'hands',
    rarity: 'epic', itemLevel: 48, vendorGold: 70,
    stats: { agility: 18, stamina: 12, crit_rating: 10 },
  },
  sabatons_of_the_flamewalker: {
    id: 'sabatons_of_the_flamewalker', name: 'Sabatons of the Flamewalker', slot: 'feet',
    rarity: 'epic', itemLevel: 49, vendorGold: 72,
    stats: { strength: 16, stamina: 16, armor: 80 },
  },
  choker_of_enlightenment: {
    id: 'choker_of_enlightenment', name: 'Choker of Enlightenment', slot: 'neck',
    rarity: 'epic', itemLevel: 48, vendorGold: 70,
    stats: { intellect: 14, spirit: 10, spell_power: 12 },
  },
  // Tier 2 raid (Blackwing Lair, ~lvl 55)
  ashkandi: {
    id: 'ashkandi', name: 'Ashkandi, Greatsword of the Brotherhood', slot: 'main_hand',
    rarity: 'legendary', itemLevel: 66, vendorGold: 200,
    stats: { strength: 34, stamina: 22, attack_power: 44, crit_rating: 12 },
  },
  netherwind_crown: {
    id: 'netherwind_crown', name: 'Netherwind Crown', slot: 'head',
    rarity: 'epic', itemLevel: 64, vendorGold: 150,
    stats: { intellect: 30, spirit: 18, spell_power: 34, crit_rating: 10 },
  },
  drake_talon_pauldrons: {
    id: 'drake_talon_pauldrons', name: 'Drake Talon Pauldrons', slot: 'shoulder',
    rarity: 'epic', itemLevel: 63, vendorGold: 145,
    stats: { strength: 26, stamina: 22, armor: 120 },
  },
  ringo_drakefire: {
    id: 'ringo_drakefire', name: 'Band of Drakefire', slot: 'finger',
    rarity: 'epic', itemLevel: 62, vendorGold: 140,
    stats: { agility: 22, stamina: 16, crit_rating: 14 },
  },
  cloak_of_draconic_might: {
    id: 'cloak_of_draconic_might', name: 'Cloak of Draconic Might', slot: 'back',
    rarity: 'epic', itemLevel: 62, vendorGold: 140,
    stats: { strength: 18, stamina: 14, attack_power: 20 },
  },
  // --- Doplňkový gear (M9): víc voleb napříč tiery ---
  oak_buckler: {
    id: 'oak_buckler', name: 'Oak Buckler', slot: 'off_hand',
    rarity: 'common', itemLevel: 8, vendorGold: 2,
    stats: { stamina: 4, armor: 18 },
  },
  huntsman_cloak: {
    id: 'huntsman_cloak', name: "Huntsman's Cloak", slot: 'back',
    rarity: 'uncommon', itemLevel: 20, vendorGold: 14,
    stats: { agility: 7, stamina: 5, crit_rating: 4 },
  },
  sentinel_legguards: {
    id: 'sentinel_legguards', name: 'Sentinel Legguards', slot: 'legs',
    rarity: 'rare', itemLevel: 34, vendorGold: 34,
    stats: { strength: 9, stamina: 11, armor: 48 },
  },

  // --- Cloth set (M10 armor types): základní výbava pro cloth-only classy
  // (mage/priest/warlock) napříč sloty, kde dosud chyběla. Dostupné u vendora. ---
  acolyte_hood: {
    id: 'acolyte_hood', name: "Acolyte's Hood", slot: 'head',
    rarity: 'common', itemLevel: 8, vendorGold: 2,
    stats: { intellect: 3, spirit: 2 },
  },
  apprentice_mantle: {
    id: 'apprentice_mantle', name: "Apprentice's Mantle", slot: 'shoulder',
    rarity: 'common', itemLevel: 12, vendorGold: 3,
    stats: { intellect: 4, spirit: 2 },
  },
  silk_girdle: {
    id: 'silk_girdle', name: 'Silk Girdle', slot: 'waist',
    rarity: 'common', itemLevel: 14, vendorGold: 3,
    stats: { intellect: 4, spirit: 3 },
  },
  woven_wristwraps: {
    id: 'woven_wristwraps', name: 'Woven Wristwraps', slot: 'wrist',
    rarity: 'common', itemLevel: 10, vendorGold: 2,
    stats: { intellect: 3, spirit: 2 },
  },
  enchanters_gloves: {
    id: 'enchanters_gloves', name: "Enchanter's Gloves", slot: 'hands',
    rarity: 'uncommon', itemLevel: 16, vendorGold: 6,
    stats: { intellect: 5, spirit: 3, spell_power: 4 },
  },
  sandals_of_insight: {
    id: 'sandals_of_insight', name: 'Sandals of Insight', slot: 'feet',
    rarity: 'uncommon', itemLevel: 18, vendorGold: 7,
    stats: { intellect: 5, spirit: 4 },
  },
  mystic_leggings: {
    id: 'mystic_leggings', name: 'Mystic Leggings', slot: 'legs',
    rarity: 'uncommon', itemLevel: 22, vendorGold: 11,
    stats: { intellect: 7, spirit: 5, spell_power: 5 },
  },

  // --- Batohy (M10 limited inventory): vloží se do bag slotu a přidají sloty.
  // Žádné staty; vendor prodává malé, větší jsou cíl craftu (follow-up). ---
  small_pouch: {
    id: 'small_pouch', name: 'Small Pouch', slot: 'bag',
    rarity: 'common', itemLevel: 1, vendorGold: 2, stats: {}, bagSlots: 4,
  },
  traveler_backpack: {
    id: 'traveler_backpack', name: "Traveler's Backpack", slot: 'bag',
    rarity: 'common', itemLevel: 1, vendorGold: 8, stats: {}, bagSlots: 6,
  },
  reinforced_pack: {
    id: 'reinforced_pack', name: 'Reinforced Pack', slot: 'bag',
    rarity: 'uncommon', itemLevel: 1, vendorGold: 25, stats: {}, bagSlots: 8,
  },
  woven_satchel: {
    id: 'woven_satchel', name: 'Woven Satchel', slot: 'bag',
    rarity: 'uncommon', itemLevel: 1, vendorGold: 50, stats: {}, bagSlots: 10,
  },
  enchanted_runecloth_bag: {
    id: 'enchanted_runecloth_bag', name: 'Enchanted Runecloth Bag', slot: 'bag',
    rarity: 'rare', itemLevel: 1, vendorGold: 120, stats: {}, bagSlots: 12,
  },
};

/**
 * Bind-on-Pickup itemy (M8.6) — raid/dungeon **personal loot** je vázané při
 * sebrání: na AH neprodejné (viz `isAuctionable`), obchodovatelné jen v
 * trade-window (M9). Zahrnuje boss-only dungeon drop (M5) + raid epicy/legendary
 * (M8). Běžný gear, který padá i z otevřeného světa, vázaný NENÍ.
 */
const BIND_ON_PICKUP: ItemId[] = [
  // M5 dungeon boss-only loot
  'taragaman_hammer', 'smites_mace', 'cookies_stirring_rod', 'fang_of_the_deeps',
  'belremil_band', 'commanders_crest', 'whitemane_chapeau', 'herod_shoulder',
  // M8 raid loot (epic/legendary, raid-only)
  'earthshaker', 'robe_of_volatile_power', 'aged_core_leather_gloves',
  'sabatons_of_the_flamewalker', 'choker_of_enlightenment', 'ashkandi',
  'netherwind_crown', 'drake_talon_pauldrons', 'ringo_drakefire',
  'cloak_of_draconic_might',
];

/**
 * Bind-on-Equip itemy (M8.6) — vysoko-end gear dostupný i mimo instance
 * (crafting / world drop). Obchodovatelný (dokud se „equip bind" netrackuje;
 * to je M9 follow-up), tj. na AH prodejný.
 */
const BIND_ON_EQUIP: ItemId[] = ['masterwork_blade', 'arcane_robes'];

for (const id of BIND_ON_PICKUP) ITEMS[id]!.bindType = 'bop';
for (const id of BIND_ON_EQUIP) ITEMS[id]!.bindType = 'boe';

/** Item slot typy, které jsou „armor" (podléhají typu brnění). */
export const ARMOR_SLOT_TYPES: ReadonlySet<ItemSlotType> = new Set<ItemSlotType>([
  'head', 'shoulder', 'chest', 'waist', 'legs', 'feet', 'wrist', 'hands',
]);

/**
 * Typ brnění per item (M10 armor types) — jediný zdroj pravdy. Vyplňuje
 * `ItemDef.armorClass` u kusů v armor slotech. Volené dle stat afinity
 * (cloth=int/spirit, leather=agi, mail=mix str/agi+stam, plate=str/stam).
 */
const ARMOR_CLASS_BY_ITEM: Record<ArmorClass, ItemId[]> = {
  cloth: [
    'worn_robe', 'spellweave_robe', 'arcane_robes', 'robe_of_volatile_power',
    'whitemane_chapeau', 'netherwind_crown',
    'acolyte_hood', 'apprentice_mantle', 'silk_girdle', 'woven_wristwraps',
    'enchanters_gloves', 'sandals_of_insight', 'mystic_leggings',
  ],
  leather: [
    'leather_cap', 'scout_vest', 'ranger_gloves', 'shadow_cowl',
    'shadow_vambraces', 'aged_core_leather_gloves', 'traveler_boots',
    'simple_bracers',
  ],
  mail: [
    'chain_leggings', 'dragonscale_belt', 'mithril_breastplate',
  ],
  plate: [
    'soldier_helm', 'marauder_shoulders', 'crusader_belt', 'warlord_plate',
    'titan_boots', 'sentinel_legguards', 'herod_shoulder',
    'sabatons_of_the_flamewalker', 'drake_talon_pauldrons',
  ],
};

for (const [cls, ids] of Object.entries(ARMOR_CLASS_BY_ITEM) as [ArmorClass, ItemId[]][]) {
  for (const id of ids) {
    const def = ITEMS[id];
    if (def && ARMOR_SLOT_TYPES.has(def.slot)) def.armorClass = cls;
  }
}

/**
 * Co která classa umí nosit (vanilla-style proficiency na cap levelu;
 * leveling progrese se neřeší). Nižší typy umí každý, kdo umí vyšší.
 */
export const CLASS_ARMOR_PROFICIENCY: Record<ClassId, ArmorClass[]> = {
  warrior: ['cloth', 'leather', 'mail', 'plate'],
  paladin: ['cloth', 'leather', 'mail', 'plate'],
  hunter: ['cloth', 'leather', 'mail'],
  shaman: ['cloth', 'leather', 'mail'],
  rogue: ['cloth', 'leather'],
  druid: ['cloth', 'leather'],
  priest: ['cloth'],
  mage: ['cloth'],
  warlock: ['cloth'],
};

/** Typ brnění itemu (M10); item bez armorClass (zbraň/šperk/plášť) ⇒ undefined. */
export function itemArmorClass(itemId: string): ArmorClass | undefined {
  return ITEMS[itemId]?.armorClass;
}

/**
 * Smí daná classa nosit tento item? Itemy bez armorClass (zbraně, šperky,
 * plášť, off-hand) může nosit kdokoli. Armor kusy gateuje proficiency.
 */
export function canEquipArmor(klass: ClassId, itemId: string): boolean {
  const ac = itemArmorClass(itemId);
  if (!ac) return true;
  return CLASS_ARMOR_PROFICIENCY[klass]?.includes(ac) ?? false;
}

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export function isItemId(value: string): value is ItemId {
  return value in ITEMS;
}

/** Vazba itemu (M8.6); neznámý/nevyznačený item ⇒ `none`. */
export function itemBindType(itemId: string): BindType {
  return ITEMS[itemId]?.bindType ?? 'none';
}

/** Je item soulbound (Bind-on-Pickup) — tj. nepřevoditelný přes AH? */
export function isSoulbound(itemId: string): boolean {
  return itemBindType(itemId) === 'bop';
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

/** Id všech batohů (slot 'bag'). */
export const BAG_IDS: ItemId[] = (Object.values(ITEMS) as ItemDef[])
  .filter((i) => i.slot === 'bag')
  .map((i) => i.id);

/** Je item batoh (vkládá se do bag slotu)? */
export function isBagId(itemId: string): boolean {
  return ITEMS[itemId]?.slot === 'bag';
}

/** Počet slotů, které batoh přidá; 0 pokud item není batoh. */
export function bagSlots(itemId: string): number {
  return ITEMS[itemId]?.bagSlots ?? 0;
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
