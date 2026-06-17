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

  // --- M12: 40–60 frontier gear (bracket_4, Eastern Plaguelands / Felwood) ---
  // Vyplňuje díru mezi tier-3 quest gearem (ilvl 30–42) a raid gearem (ilvl 48+).
  // Pokrývá všechny armor typy + zbraň/štít/plášť/šperky; jeden epic na vrcholu.
  plaguebloom_circlet: {
    id: 'plaguebloom_circlet', name: 'Plaguebloom Circlet', slot: 'head',
    rarity: 'rare', itemLevel: 46, vendorGold: 48,
    stats: { intellect: 16, spirit: 10, spell_power: 14 },
  },
  runecloth_robe: {
    id: 'runecloth_robe', name: 'Runecloth Robe', slot: 'chest',
    rarity: 'uncommon', itemLevel: 48, vendorGold: 40,
    stats: { intellect: 14, spirit: 12, spell_power: 10 },
  },
  girdle_of_the_mendicant: {
    id: 'girdle_of_the_mendicant', name: 'Girdle of the Mendicant', slot: 'waist',
    rarity: 'uncommon', itemLevel: 45, vendorGold: 36,
    stats: { intellect: 10, spirit: 8 },
  },
  wildheart_spaulders: {
    id: 'wildheart_spaulders', name: 'Wildheart Spaulders', slot: 'shoulder',
    rarity: 'rare', itemLevel: 47, vendorGold: 46,
    stats: { agility: 14, stamina: 11, crit_rating: 6 },
  },
  feltracker_boots: {
    id: 'feltracker_boots', name: 'Feltracker Boots', slot: 'feet',
    rarity: 'uncommon', itemLevel: 45, vendorGold: 38,
    stats: { agility: 12, stamina: 9 },
  },
  chromatic_chainmail: {
    id: 'chromatic_chainmail', name: 'Chromatic Chainmail', slot: 'chest',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { strength: 8, agility: 8, stamina: 12, armor: 70 },
  },
  plaguehound_leggings: {
    id: 'plaguehound_leggings', name: 'Plaguehound Leggings', slot: 'legs',
    rarity: 'rare', itemLevel: 49, vendorGold: 50,
    stats: { strength: 10, agility: 8, stamina: 11, armor: 55 },
  },
  gauntlets_of_the_fallen: {
    id: 'gauntlets_of_the_fallen', name: 'Gauntlets of the Fallen', slot: 'hands',
    rarity: 'rare', itemLevel: 50, vendorGold: 50,
    stats: { strength: 14, stamina: 12, armor: 60 },
  },
  bracers_of_undeath: {
    id: 'bracers_of_undeath', name: 'Bracers of Undeath', slot: 'wrist',
    rarity: 'uncommon', itemLevel: 47, vendorGold: 40,
    stats: { strength: 9, stamina: 9, armor: 30 },
  },
  bonereaver_greatsword: {
    id: 'bonereaver_greatsword', name: 'Bonereaver Greatsword', slot: 'main_hand',
    rarity: 'rare', itemLevel: 52, vendorGold: 60,
    stats: { strength: 18, stamina: 12, attack_power: 24, crit_rating: 6 },
  },
  wardens_bulwark: {
    id: 'wardens_bulwark', name: "Warden's Bulwark", slot: 'off_hand',
    rarity: 'rare', itemLevel: 48, vendorGold: 48,
    stats: { stamina: 16, strength: 8, armor: 90 },
  },
  corruptors_cloak: {
    id: 'corruptors_cloak', name: "Corruptor's Cloak", slot: 'back',
    rarity: 'rare', itemLevel: 49, vendorGold: 46,
    stats: { agility: 10, stamina: 8, attack_power: 12 },
  },
  cenarion_signet: {
    id: 'cenarion_signet', name: 'Cenarion Signet', slot: 'neck',
    rarity: 'rare', itemLevel: 47, vendorGold: 44,
    stats: { intellect: 10, spirit: 8, spell_power: 8 },
  },
  nightmare_band: {
    id: 'nightmare_band', name: 'Band of the Nightmare', slot: 'finger',
    rarity: 'epic', itemLevel: 56, vendorGold: 90,
    stats: { intellect: 14, stamina: 12, spell_power: 14 },
  },

  // --- M12: Zul'Gurub raid loot (epic, ~lvl 50, ilvl 54–57, raid-only, BoP) ---
  // Vyplňuje progresní krok mezi Molten Core (ilvl ~48–50) a Blackwing Lair
  // (ilvl ~62–66). Pokrývá zbraň + plate/mail/leather/cloth + prsten.
  zg_halberd_of_smiting: {
    id: 'zg_halberd_of_smiting', name: 'Halberd of Smiting', slot: 'main_hand',
    rarity: 'epic', itemLevel: 57, vendorGold: 95,
    stats: { strength: 22, stamina: 15, attack_power: 30, crit_rating: 9 },
  },
  zg_bloodlords_chestplate: {
    id: 'zg_bloodlords_chestplate', name: "Bloodlord's Chestplate", slot: 'chest',
    rarity: 'epic', itemLevel: 56, vendorGold: 92,
    stats: { strength: 20, stamina: 18, armor: 95 },
  },
  zg_primalist_belt: {
    id: 'zg_primalist_belt', name: 'Primalist Belt', slot: 'waist',
    rarity: 'epic', itemLevel: 54, vendorGold: 84,
    stats: { agility: 17, stamina: 13, attack_power: 22 },
  },
  zg_overlord_helmet: {
    id: 'zg_overlord_helmet', name: "Overlord's Helmet", slot: 'head',
    rarity: 'epic', itemLevel: 55, vendorGold: 88,
    stats: { agility: 19, stamina: 14, crit_rating: 10 },
  },
  zg_jindo_mantle: {
    id: 'zg_jindo_mantle', name: 'Mantle of the Blood God', slot: 'shoulder',
    rarity: 'epic', itemLevel: 55, vendorGold: 88,
    stats: { intellect: 20, spirit: 13, spell_power: 22 },
  },
  zg_zanzils_seal: {
    id: 'zg_zanzils_seal', name: "Zanzil's Seal", slot: 'finger',
    rarity: 'epic', itemLevel: 54, vendorGold: 84,
    stats: { intellect: 14, stamina: 12, spell_power: 14 },
  },

  // --- M12: Temple of Ahn'Qiraj raid loot (epic/legendary, ~lvl 58, ilvl 62–68,
  // raid-only, BoP) — nový top-end nad Blackwing Lair. C'Thun roní legendu. ---
  aq_scepter_shifting_sands: {
    id: 'aq_scepter_shifting_sands', name: 'Scepter of the Shifting Sands', slot: 'main_hand',
    rarity: 'legendary', itemLevel: 68, vendorGold: 220,
    stats: { intellect: 32, spirit: 20, spell_power: 40, crit_rating: 14 },
  },
  aq_silithid_carapace: {
    id: 'aq_silithid_carapace', name: 'Silithid Carapace Breastplate', slot: 'chest',
    rarity: 'epic', itemLevel: 65, vendorGold: 160,
    stats: { strength: 28, stamina: 24, armor: 130 },
  },
  aq_qiraji_bindings: {
    id: 'aq_qiraji_bindings', name: 'Qiraji Bindings of Command', slot: 'wrist',
    rarity: 'epic', itemLevel: 63, vendorGold: 145,
    stats: { agility: 22, stamina: 16, attack_power: 24 },
  },
  aq_gloves_of_the_immortal: {
    id: 'aq_gloves_of_the_immortal', name: 'Gloves of the Immortal', slot: 'hands',
    rarity: 'epic', itemLevel: 64, vendorGold: 150,
    stats: { intellect: 24, spirit: 16, spell_power: 24 },
  },
  aq_ring_of_emperors: {
    id: 'aq_ring_of_emperors', name: 'Ring of the Fallen Emperors', slot: 'finger',
    rarity: 'epic', itemLevel: 63, vendorGold: 145,
    stats: { strength: 18, stamina: 16, crit_rating: 14 },
  },
  aq_cloak_of_the_golden_hive: {
    id: 'aq_cloak_of_the_golden_hive', name: 'Cloak of the Golden Hive', slot: 'back',
    rarity: 'epic', itemLevel: 62, vendorGold: 140,
    stats: { agility: 18, stamina: 14, attack_power: 20 },
  },

  // --- M12: nízkoúrovňové dungeon loot (BoP, instance-only) ---
  // Wailing Caverns (~lvl 17–24)
  wc_serpentine_band: {
    id: 'wc_serpentine_band', name: 'Serpentine Band', slot: 'finger',
    rarity: 'rare', itemLevel: 22, vendorGold: 14,
    stats: { intellect: 6, spirit: 5 },
  },
  wc_deviate_hide_pauldrons: {
    id: 'wc_deviate_hide_pauldrons', name: 'Deviate Hide Pauldrons', slot: 'shoulder',
    rarity: 'rare', itemLevel: 23, vendorGold: 16,
    stats: { agility: 7, stamina: 6 },
  },
  // Blackfathom Deeps (~lvl 24–29)
  bfd_rod_of_the_sleeper: {
    id: 'bfd_rod_of_the_sleeper', name: 'Rod of the Sleeper', slot: 'main_hand',
    rarity: 'rare', itemLevel: 28, vendorGold: 22,
    stats: { intellect: 9, spirit: 5, spell_power: 11 },
  },
  bfd_gaze_dreamer_robes: {
    id: 'bfd_gaze_dreamer_robes', name: "Gaze Dreamer's Robes", slot: 'chest',
    rarity: 'rare', itemLevel: 27, vendorGold: 20,
    stats: { intellect: 10, spirit: 7, spell_power: 8 },
  },

  // --- M12: 40–60 dungeon loot (BoP, instance-only). Vyplňuje itemizaci pásma
  // 42–60 vedle bracket_4 quest gearu a raid epiců. ---
  // Zul'Farrak (~lvl 42–47)
  zf_sandstalker_ankleguards: {
    id: 'zf_sandstalker_ankleguards', name: 'Sandstalker Ankleguards', slot: 'feet',
    rarity: 'rare', itemLevel: 47, vendorGold: 42,
    stats: { agility: 13, stamina: 10, crit_rating: 5 },
  },
  zf_jinxed_hoodoo_staff: {
    id: 'zf_jinxed_hoodoo_staff', name: 'Jinxed Hoodoo Staff', slot: 'main_hand',
    rarity: 'rare', itemLevel: 48, vendorGold: 46,
    stats: { intellect: 15, spirit: 9, spell_power: 16 },
  },
  zf_bloodmail_gauntlets: {
    id: 'zf_bloodmail_gauntlets', name: 'Bloodmail Gauntlets', slot: 'hands',
    rarity: 'rare', itemLevel: 47, vendorGold: 42,
    stats: { strength: 13, stamina: 11, armor: 50 },
  },
  // Maraudon (~lvl 46–52)
  mar_theradras_scepter: {
    id: 'mar_theradras_scepter', name: "Theradras' Scepter", slot: 'main_hand',
    rarity: 'rare', itemLevel: 51, vendorGold: 54,
    stats: { intellect: 17, spirit: 10, spell_power: 18 },
  },
  mar_elemental_girdle: {
    id: 'mar_elemental_girdle', name: 'Elemental Rockridge Girdle', slot: 'waist',
    rarity: 'rare', itemLevel: 50, vendorGold: 50,
    stats: { agility: 14, stamina: 12, attack_power: 18 },
  },
  mar_lifegiving_gem: {
    id: 'mar_lifegiving_gem', name: 'Lifegiving Gem', slot: 'trinket',
    rarity: 'rare', itemLevel: 51, vendorGold: 54,
    stats: { stamina: 18, spirit: 8 },
  },
  // Blackrock Depths (~lvl 52–58)
  brd_ironfoe: {
    id: 'brd_ironfoe', name: 'Ironfoe', slot: 'main_hand',
    rarity: 'epic', itemLevel: 56, vendorGold: 92,
    stats: { strength: 20, stamina: 14, attack_power: 26, crit_rating: 8 },
  },
  brd_emperors_seal: {
    id: 'brd_emperors_seal', name: "Emperor's Seal", slot: 'finger',
    rarity: 'rare', itemLevel: 55, vendorGold: 56,
    stats: { strength: 12, stamina: 12, crit_rating: 6 },
  },
  brd_flameweave_cuffs: {
    id: 'brd_flameweave_cuffs', name: 'Flameweave Cuffs', slot: 'wrist',
    rarity: 'rare', itemLevel: 54, vendorGold: 52,
    stats: { intellect: 13, spirit: 8, spell_power: 10 },
  },
  // Stratholme (~lvl 58–60)
  strat_runeblade_rivendare: {
    id: 'strat_runeblade_rivendare', name: 'Runeblade of Baron Rivendare', slot: 'main_hand',
    rarity: 'epic', itemLevel: 60, vendorGold: 110,
    stats: { strength: 24, stamina: 16, attack_power: 30, crit_rating: 10 },
  },
  strat_deathbone_legguards: {
    id: 'strat_deathbone_legguards', name: 'Deathbone Legguards', slot: 'legs',
    rarity: 'epic', itemLevel: 60, vendorGold: 105,
    stats: { strength: 22, stamina: 20, armor: 110 },
  },
  strat_skul_cap: {
    id: 'strat_skul_cap', name: "Skul's Ghastly Touch", slot: 'head',
    rarity: 'rare', itemLevel: 58, vendorGold: 60,
    stats: { intellect: 18, spirit: 11, spell_power: 16 },
  },

  // --- Více gearu (gap fill): trinkets, mail armor, leather legs/waist, neck,
  // caster off-hand, bracket-2 (ilvl 31–44) výplň. Pokrývá kriticko-chybějící sloty. ---

  // Trinkets (kriticky nedostatečné — jen 3 kusy napříč všemi brackety)
  adventurer_charm: {
    id: 'adventurer_charm', name: "Adventurer's Charm", slot: 'trinket',
    rarity: 'common', itemLevel: 10, vendorGold: 3,
    stats: { strength: 3, agility: 3, stamina: 2 },
  },
  wolf_fang_talisman: {
    id: 'wolf_fang_talisman', name: 'Wolf Fang Talisman', slot: 'trinket',
    rarity: 'uncommon', itemLevel: 32, vendorGold: 22,
    stats: { agility: 8, crit_rating: 6 },
  },
  lifeblood_stone: {
    id: 'lifeblood_stone', name: 'Lifeblood Stone', slot: 'trinket',
    rarity: 'rare', itemLevel: 42, vendorGold: 40,
    stats: { stamina: 14, spirit: 8 },
  },
  brd_void_shard: {
    id: 'brd_void_shard', name: 'Void-Etched Shard', slot: 'trinket',
    rarity: 'rare', itemLevel: 55, vendorGold: 60,
    stats: { intellect: 14, spell_power: 12, crit_rating: 8 },
  },

  // Mail armor — chybějící sloty (head, shoulder, feet, hands)
  // Bracket 2 (ilvl 18–25)
  riveted_chainmail_coif: {
    id: 'riveted_chainmail_coif', name: 'Riveted Chainmail Coif', slot: 'head',
    rarity: 'uncommon', itemLevel: 22, vendorGold: 10,
    stats: { strength: 6, stamina: 5, armor: 18 },
  },
  riveted_chainmail_pauldrons: {
    id: 'riveted_chainmail_pauldrons', name: 'Riveted Chainmail Pauldrons', slot: 'shoulder',
    rarity: 'uncommon', itemLevel: 20, vendorGold: 9,
    stats: { strength: 5, stamina: 5, armor: 14 },
  },
  chain_link_boots: {
    id: 'chain_link_boots', name: 'Chain-Link Boots', slot: 'feet',
    rarity: 'uncommon', itemLevel: 22, vendorGold: 10,
    stats: { agility: 6, stamina: 5, armor: 16 },
  },
  chain_link_gauntlets: {
    id: 'chain_link_gauntlets', name: 'Chain-Link Gauntlets', slot: 'hands',
    rarity: 'uncommon', itemLevel: 20, vendorGold: 9,
    stats: { strength: 5, stamina: 5, armor: 14 },
  },
  // Bracket 4 (ilvl 43–45)
  beastmaster_helm: {
    id: 'beastmaster_helm', name: "Beastmaster's Helm", slot: 'head',
    rarity: 'rare', itemLevel: 44, vendorGold: 44,
    stats: { agility: 13, stamina: 11, crit_rating: 5, armor: 40 },
  },
  predators_pauldrons: {
    id: 'predators_pauldrons', name: "Predator's Pauldrons", slot: 'shoulder',
    rarity: 'rare', itemLevel: 43, vendorGold: 42,
    stats: { agility: 12, stamina: 10, armor: 35 },
  },
  swifthunter_boots: {
    id: 'swifthunter_boots', name: 'Swifthunter Boots', slot: 'feet',
    rarity: 'rare', itemLevel: 45, vendorGold: 44,
    stats: { agility: 12, stamina: 10, armor: 36 },
  },
  elementalist_gauntlets: {
    id: 'elementalist_gauntlets', name: 'Elementalist Gauntlets', slot: 'hands',
    rarity: 'rare', itemLevel: 44, vendorGold: 42,
    stats: { strength: 8, agility: 8, stamina: 10, armor: 38 },
  },

  // Leather legs a waist (kriticky chybějící — 0 kusů v obou slotech)
  pantherskin_leggings: {
    id: 'pantherskin_leggings', name: 'Pantherskin Leggings', slot: 'legs',
    rarity: 'uncommon', itemLevel: 28, vendorGold: 14,
    stats: { agility: 7, stamina: 6 },
  },
  rogue_sash: {
    id: 'rogue_sash', name: "Rogue's Sash", slot: 'waist',
    rarity: 'uncommon', itemLevel: 22, vendorGold: 9,
    stats: { agility: 6, stamina: 4 },
  },
  savage_leather_leggings: {
    id: 'savage_leather_leggings', name: 'Savage Leather Leggings', slot: 'legs',
    rarity: 'rare', itemLevel: 44, vendorGold: 42,
    stats: { agility: 13, stamina: 11, crit_rating: 5 },
  },
  stalker_cord: {
    id: 'stalker_cord', name: "Stalker's Cord", slot: 'waist',
    rarity: 'uncommon', itemLevel: 38, vendorGold: 26,
    stats: { agility: 9, stamina: 7 },
  },

  // Neck (chybí fyzický DPS + tank; jen 4 kusy celkem)
  iron_pendant_of_valor: {
    id: 'iron_pendant_of_valor', name: 'Iron Pendant of Valor', slot: 'neck',
    rarity: 'uncommon', itemLevel: 30, vendorGold: 16,
    stats: { strength: 7, stamina: 6 },
  },
  hawks_eye_amulet: {
    id: 'hawks_eye_amulet', name: "Hawk's Eye Amulet", slot: 'neck',
    rarity: 'rare', itemLevel: 40, vendorGold: 34,
    stats: { agility: 10, crit_rating: 7 },
  },
  bloodforged_choker: {
    id: 'bloodforged_choker', name: 'Bloodforged Choker', slot: 'neck',
    rarity: 'rare', itemLevel: 52, vendorGold: 52,
    stats: { strength: 13, stamina: 13 },
  },

  // Caster off-hand (chybí — jen štíty/plátová věc; žádný orb/tome)
  arcane_focus: {
    id: 'arcane_focus', name: 'Arcane Focus Orb', slot: 'off_hand',
    rarity: 'uncommon', itemLevel: 28, vendorGold: 14,
    stats: { intellect: 7, spirit: 5, spell_power: 8 },
  },
  spirit_orb_of_elune: {
    id: 'spirit_orb_of_elune', name: 'Spirit Orb of Elune', slot: 'off_hand',
    rarity: 'rare', itemLevel: 45, vendorGold: 44,
    stats: { intellect: 14, spirit: 9, spell_power: 14 },
  },

  // Bracket 2 výplň (ilvl 31–44 — mezera mezi tier-3 a frontier gearem)
  forest_warden_vest: {
    id: 'forest_warden_vest', name: 'Forest Warden Vest', slot: 'chest',
    rarity: 'uncommon', itemLevel: 32, vendorGold: 22,
    stats: { agility: 8, stamina: 8 },
  },
  spellcaster_shoulderguards: {
    id: 'spellcaster_shoulderguards', name: 'Spellcaster Shoulderguards', slot: 'shoulder',
    rarity: 'uncommon', itemLevel: 32, vendorGold: 20,
    stats: { intellect: 8, spirit: 6, spell_power: 4 },
  },
  templar_legplates: {
    id: 'templar_legplates', name: 'Templar Legplates', slot: 'legs',
    rarity: 'rare', itemLevel: 40, vendorGold: 36,
    stats: { strength: 10, stamina: 12, armor: 52 },
  },
  ironbark_bracers: {
    id: 'ironbark_bracers', name: 'Ironbark Bracers', slot: 'wrist',
    rarity: 'rare', itemLevel: 38, vendorGold: 28,
    stats: { agility: 9, stamina: 8 },
  },
  warpath_sabatons: {
    id: 'warpath_sabatons', name: 'Warpath Sabatons', slot: 'feet',
    rarity: 'uncommon', itemLevel: 38, vendorGold: 28,
    stats: { strength: 9, stamina: 8, armor: 32 },
  },
  sundered_battleaxe: {
    id: 'sundered_battleaxe', name: 'Sundered Battleaxe', slot: 'main_hand',
    rarity: 'rare', itemLevel: 40, vendorGold: 36,
    stats: { strength: 13, stamina: 8, attack_power: 18 },
  },
  wanderer_band: {
    id: 'wanderer_band', name: "Wanderer's Band", slot: 'finger',
    rarity: 'uncommon', itemLevel: 35, vendorGold: 22,
    stats: { agility: 8, crit_rating: 5 },
  },

  // --- Diverzita Round 2: back, wrist, finger, chest, trinket, off-hand,
  // zbraně, shoulders, neck, cloth chybějící sloty, dungeon BoP ---

  // Back — chybí mid-game (ilvl 24–52); jen 4 kusy celkem
  spellweave_cloak: {
    id: 'spellweave_cloak', name: 'Spellweave Cloak', slot: 'back',
    rarity: 'uncommon', itemLevel: 24, vendorGold: 11,
    stats: { intellect: 6, spirit: 5 },
  },
  ironweave_cloak: {
    id: 'ironweave_cloak', name: 'Ironweave Cloak', slot: 'back',
    rarity: 'uncommon', itemLevel: 30, vendorGold: 16,
    stats: { stamina: 8, armor: 22, dodge_rating: 4 },
  },
  shadowstep_cloak: {
    id: 'shadowstep_cloak', name: 'Shadowstep Cloak', slot: 'back',
    rarity: 'rare', itemLevel: 42, vendorGold: 38,
    stats: { agility: 11, stamina: 7, attack_power: 14 },
  },
  runed_cloak_of_power: {
    id: 'runed_cloak_of_power', name: 'Runed Cloak of Power', slot: 'back',
    rarity: 'rare', itemLevel: 52, vendorGold: 52,
    stats: { intellect: 13, spirit: 8, spell_power: 12 },
  },

  // Wrist — chybí mid-game cloth/mail/plate (ilvl 28–42)
  silk_cuffs: {
    id: 'silk_cuffs', name: 'Silk Cuffs', slot: 'wrist',
    rarity: 'uncommon', itemLevel: 28, vendorGold: 13,
    stats: { intellect: 7, spirit: 5, spell_power: 4 },
  },
  chainmail_bracers: {
    id: 'chainmail_bracers', name: 'Chainmail Bracers', slot: 'wrist',
    rarity: 'uncommon', itemLevel: 30, vendorGold: 14,
    stats: { agility: 7, stamina: 6, armor: 12 },
  },
  ironplate_wristguards: {
    id: 'ironplate_wristguards', name: 'Ironplate Wristguards', slot: 'wrist',
    rarity: 'uncommon', itemLevel: 36, vendorGold: 22,
    stats: { strength: 8, stamina: 8, armor: 22 },
  },
  arcane_wristwraps: {
    id: 'arcane_wristwraps', name: 'Arcane Wristwraps', slot: 'wrist',
    rarity: 'rare', itemLevel: 44, vendorGold: 38,
    stats: { intellect: 11, spell_power: 10, crit_rating: 4 },
  },

  // Finger — physical DPS a tank rings chybějí v mid-game
  signet_of_strength: {
    id: 'signet_of_strength', name: 'Signet of Strength', slot: 'finger',
    rarity: 'uncommon', itemLevel: 14, vendorGold: 5,
    stats: { strength: 4, attack_power: 6 },
  },
  swiftblade_ring: {
    id: 'swiftblade_ring', name: 'Swiftblade Ring', slot: 'finger',
    rarity: 'rare', itemLevel: 38, vendorGold: 30,
    stats: { agility: 10, crit_rating: 6, attack_power: 12 },
  },
  guardian_signet: {
    id: 'guardian_signet', name: 'Guardian Signet', slot: 'finger',
    rarity: 'rare', itemLevel: 46, vendorGold: 42,
    stats: { stamina: 14, armor: 30, dodge_rating: 8 },
  },
  enchanters_band: {
    id: 'enchanters_band', name: "Enchanter's Band", slot: 'finger',
    rarity: 'uncommon', itemLevel: 18, vendorGold: 7,
    stats: { intellect: 5, spirit: 4, spell_power: 4 },
  },

  // Chest — plate tier 2 chybí; leather mid hybridní
  platemail_hauberk: {
    id: 'platemail_hauberk', name: 'Platemail Hauberk', slot: 'chest',
    rarity: 'uncommon', itemLevel: 25, vendorGold: 14,
    stats: { strength: 7, stamina: 8, armor: 35 },
  },
  druidic_tunic: {
    id: 'druidic_tunic', name: 'Druidic Tunic', slot: 'chest',
    rarity: 'rare', itemLevel: 36, vendorGold: 32,
    stats: { agility: 9, intellect: 6, stamina: 8 },
  },

  // Trinkets — fyzický DPS + low-level caster
  shard_of_the_void: {
    id: 'shard_of_the_void', name: 'Shard of the Void', slot: 'trinket',
    rarity: 'uncommon', itemLevel: 22, vendorGold: 10,
    stats: { intellect: 6, spell_power: 8 },
  },
  warriors_bloodstone: {
    id: 'warriors_bloodstone', name: "Warrior's Bloodstone", slot: 'trinket',
    rarity: 'rare', itemLevel: 46, vendorGold: 44,
    stats: { strength: 14, attack_power: 18 },
  },

  // Off-hand — tank shield low tier + mid-tier
  battered_heater: {
    id: 'battered_heater', name: 'Battered Heater', slot: 'off_hand',
    rarity: 'common', itemLevel: 14, vendorGold: 3,
    stats: { stamina: 5, armor: 28 },
  },
  tower_shield_of_endurance: {
    id: 'tower_shield_of_endurance', name: 'Tower Shield of Endurance', slot: 'off_hand',
    rarity: 'rare', itemLevel: 40, vendorGold: 36,
    stats: { stamina: 14, armor: 75, dodge_rating: 10 },
  },
  tome_of_forbidden_rites: {
    id: 'tome_of_forbidden_rites', name: 'Tome of Forbidden Rites', slot: 'off_hand',
    rarity: 'rare', itemLevel: 56, vendorGold: 60,
    stats: { intellect: 16, spirit: 10, spell_power: 18 },
  },

  // Weapons — starter wand, executioner axe, fast rogue dagger
  oak_wand: {
    id: 'oak_wand', name: 'Oak Wand', slot: 'main_hand',
    rarity: 'common', itemLevel: 14, vendorGold: 3,
    stats: { intellect: 4, spirit: 3 },
  },
  executioner_axe: {
    id: 'executioner_axe', name: 'Executioner Axe', slot: 'main_hand',
    rarity: 'rare', itemLevel: 48, vendorGold: 50,
    stats: { strength: 17, stamina: 10, attack_power: 22, crit_rating: 6 },
  },
  dirge_blade: {
    id: 'dirge_blade', name: 'Dirge', slot: 'main_hand',
    rarity: 'epic', itemLevel: 58, vendorGold: 100,
    stats: { agility: 22, stamina: 12, attack_power: 28, crit_rating: 10 },
  },

  // Shoulders — leather mid + mail mid (still underserved)
  sentinel_mantle: {
    id: 'sentinel_mantle', name: 'Sentinel Mantle', slot: 'shoulder',
    rarity: 'uncommon', itemLevel: 36, vendorGold: 24,
    stats: { agility: 9, stamina: 8 },
  },
  ironmail_spaulders: {
    id: 'ironmail_spaulders', name: 'Ironmail Spaulders', slot: 'shoulder',
    rarity: 'rare', itemLevel: 38, vendorGold: 28,
    stats: { strength: 9, stamina: 9, armor: 30 },
  },

  // Neck — healer archetype chybí; high-end phys
  healers_pendant: {
    id: 'healers_pendant', name: "Healer's Pendant", slot: 'neck',
    rarity: 'uncommon', itemLevel: 26, vendorGold: 12,
    stats: { intellect: 7, spirit: 6, spell_power: 5 },
  },
  necklace_of_the_warchief: {
    id: 'necklace_of_the_warchief', name: 'Necklace of the Warchief', slot: 'neck',
    rarity: 'epic', itemLevel: 60, vendorGold: 90,
    stats: { strength: 20, stamina: 16, attack_power: 22 },
  },

  // Cloth — chybí waist a nové wrist ve vyšším bracketu
  mystic_sash: {
    id: 'mystic_sash', name: 'Mystic Sash', slot: 'waist',
    rarity: 'uncommon', itemLevel: 38, vendorGold: 24,
    stats: { intellect: 10, spirit: 7, spell_power: 6 },
  },
  council_robes: {
    id: 'council_robes', name: 'Council Robes', slot: 'chest',
    rarity: 'uncommon', itemLevel: 44, vendorGold: 36,
    stats: { intellect: 13, spirit: 9, spell_power: 10 },
  },

  // Dungeon BoP — Dire Maul (~lvl 52–58)
  dm_gordok_ring: {
    id: 'dm_gordok_ring', name: "Gordok's Seal", slot: 'finger',
    rarity: 'rare', itemLevel: 52, vendorGold: 54,
    stats: { agility: 14, stamina: 12, crit_rating: 8 },
  },
  dm_mark_of_the_wild: {
    id: 'dm_mark_of_the_wild', name: 'Mark of the Wild Staff', slot: 'main_hand',
    rarity: 'rare', itemLevel: 54, vendorGold: 58,
    stats: { agility: 12, intellect: 12, spirit: 10, spell_power: 12 },
  },
  // Scholomance (~lvl 57–60)
  sch_death_whisper_leggings: {
    id: 'sch_death_whisper_leggings', name: 'Death Whisper Leggings', slot: 'legs',
    rarity: 'epic', itemLevel: 57, vendorGold: 95,
    stats: { intellect: 20, spirit: 13, spell_power: 20 },
  },
  sch_bone_ring_of_command: {
    id: 'sch_bone_ring_of_command', name: 'Bone Ring of Command', slot: 'finger',
    rarity: 'rare', itemLevel: 56, vendorGold: 60,
    stats: { strength: 14, stamina: 14, dodge_rating: 8 },
  },

  // --- Healer parity (audit fix): plate/mail/leather healing sets.
  // Všechny tři healing archetypy (holy paladin, resto/ele shaman, resto/balance
  // druid) měly 0 kusů s int/spirit/spell_power ve svém tipu brnění. ---

  // HOLY PALADIN — plate + int/spirit/spell_power (tier 2 ilvl 17–22, tier 3 ilvl 34–40, epic ilvl 52–56)
  vambraces_of_light: {
    id: 'vambraces_of_light', name: 'Vambraces of Light', slot: 'wrist',
    rarity: 'uncommon', itemLevel: 17, vendorGold: 7,
    stats: { intellect: 4, spirit: 3 },
  },
  boots_of_the_healer: {
    id: 'boots_of_the_healer', name: 'Boots of the Healer', slot: 'feet',
    rarity: 'uncommon', itemLevel: 19, vendorGold: 8,
    stats: { intellect: 5, spirit: 4 },
  },
  gauntlets_of_devotion: {
    id: 'gauntlets_of_devotion', name: 'Gauntlets of Devotion', slot: 'hands',
    rarity: 'uncommon', itemLevel: 19, vendorGold: 8,
    stats: { intellect: 5, spirit: 4 },
  },
  legplates_of_faith: {
    id: 'legplates_of_faith', name: 'Legplates of Faith', slot: 'legs',
    rarity: 'uncommon', itemLevel: 20, vendorGold: 9,
    stats: { intellect: 6, spirit: 5 },
  },
  holy_crown_of_light: {
    id: 'holy_crown_of_light', name: 'Holy Crown of Light', slot: 'head',
    rarity: 'uncommon', itemLevel: 20, vendorGold: 9,
    stats: { intellect: 5, spirit: 4 },
  },
  belt_of_benediction: {
    id: 'belt_of_benediction', name: 'Belt of Benediction', slot: 'waist',
    rarity: 'uncommon', itemLevel: 18, vendorGold: 7,
    stats: { intellect: 5, spirit: 4 },
  },
  mantle_of_devotion: {
    id: 'mantle_of_devotion', name: 'Mantle of Devotion', slot: 'shoulder',
    rarity: 'uncommon', itemLevel: 20, vendorGold: 9,
    stats: { intellect: 5, spirit: 4 },
  },
  breastplate_of_devotion: {
    id: 'breastplate_of_devotion', name: 'Breastplate of Devotion', slot: 'chest',
    rarity: 'uncommon', itemLevel: 22, vendorGold: 11,
    stats: { intellect: 7, spirit: 5 },
  },
  // Tier 3 plate healing (ilvl 34–40)
  bracers_of_benediction: {
    id: 'bracers_of_benediction', name: 'Bracers of Benediction', slot: 'wrist',
    rarity: 'rare', itemLevel: 34, vendorGold: 26,
    stats: { intellect: 8, spirit: 6, spell_power: 6 },
  },
  sabatons_of_benediction: {
    id: 'sabatons_of_benediction', name: 'Sabatons of Benediction', slot: 'feet',
    rarity: 'rare', itemLevel: 37, vendorGold: 30,
    stats: { intellect: 10, spirit: 7, spell_power: 7 },
  },
  gauntlets_of_the_lightbringer: {
    id: 'gauntlets_of_the_lightbringer', name: 'Gauntlets of the Lightbringer', slot: 'hands',
    rarity: 'rare', itemLevel: 38, vendorGold: 32,
    stats: { intellect: 10, spirit: 7, spell_power: 8 },
  },
  greaves_of_the_redeemer: {
    id: 'greaves_of_the_redeemer', name: 'Greaves of the Redeemer', slot: 'legs',
    rarity: 'rare', itemLevel: 38, vendorGold: 32,
    stats: { intellect: 11, spirit: 8, spell_power: 10 },
  },
  sacred_visor: {
    id: 'sacred_visor', name: 'Sacred Visor', slot: 'head',
    rarity: 'rare', itemLevel: 36, vendorGold: 30,
    stats: { intellect: 10, spirit: 7, spell_power: 8 },
  },
  girdle_of_the_holy: {
    id: 'girdle_of_the_holy', name: 'Girdle of the Holy', slot: 'waist',
    rarity: 'rare', itemLevel: 36, vendorGold: 28,
    stats: { intellect: 9, spirit: 7, spell_power: 6 },
  },
  spaulders_of_the_lightbringer: {
    id: 'spaulders_of_the_lightbringer', name: 'Spaulders of the Lightbringer', slot: 'shoulder',
    rarity: 'rare', itemLevel: 38, vendorGold: 30,
    stats: { intellect: 10, spirit: 7, spell_power: 8 },
  },
  blessed_breastplate: {
    id: 'blessed_breastplate', name: 'Blessed Breastplate', slot: 'chest',
    rarity: 'rare', itemLevel: 40, vendorGold: 36,
    stats: { intellect: 13, spirit: 9, spell_power: 12 },
  },
  // Epic plate healing (ilvl 52–56)
  crown_of_the_redeemer: {
    id: 'crown_of_the_redeemer', name: 'Crown of the Redeemer', slot: 'head',
    rarity: 'epic', itemLevel: 52, vendorGold: 80,
    stats: { intellect: 18, spirit: 12, spell_power: 16 },
  },
  raiment_of_the_light: {
    id: 'raiment_of_the_light', name: 'Raiment of the Light', slot: 'chest',
    rarity: 'epic', itemLevel: 56, vendorGold: 92,
    stats: { intellect: 22, spirit: 14, spell_power: 22 },
  },

  // RESTO / ELE SHAMAN — mail + int/spirit/spell_power (tier 2, tier 3, epic)
  shamanic_wristbands: {
    id: 'shamanic_wristbands', name: 'Shamanic Wristbands', slot: 'wrist',
    rarity: 'uncommon', itemLevel: 17, vendorGold: 7,
    stats: { intellect: 4, spirit: 3 },
  },
  shamanic_boots: {
    id: 'shamanic_boots', name: 'Shamanic Boots', slot: 'feet',
    rarity: 'uncommon', itemLevel: 19, vendorGold: 8,
    stats: { intellect: 5, spirit: 4 },
  },
  totemic_grips: {
    id: 'totemic_grips', name: 'Totemic Grips', slot: 'hands',
    rarity: 'uncommon', itemLevel: 19, vendorGold: 8,
    stats: { intellect: 5, spirit: 4 },
  },
  shamanic_leggings: {
    id: 'shamanic_leggings', name: 'Shamanic Leggings', slot: 'legs',
    rarity: 'uncommon', itemLevel: 20, vendorGold: 9,
    stats: { intellect: 6, spirit: 5 },
  },
  stormcaller_coif: {
    id: 'stormcaller_coif', name: 'Stormcaller Coif', slot: 'head',
    rarity: 'uncommon', itemLevel: 20, vendorGold: 9,
    stats: { intellect: 5, spirit: 4 },
  },
  sash_of_the_elements: {
    id: 'sash_of_the_elements', name: 'Sash of the Elements', slot: 'waist',
    rarity: 'uncommon', itemLevel: 18, vendorGold: 7,
    stats: { intellect: 5, spirit: 3 },
  },
  earth_mantle: {
    id: 'earth_mantle', name: 'Earth Mantle', slot: 'shoulder',
    rarity: 'uncommon', itemLevel: 20, vendorGold: 9,
    stats: { intellect: 5, spirit: 4 },
  },
  totemic_hauberk: {
    id: 'totemic_hauberk', name: 'Totemic Hauberk', slot: 'chest',
    rarity: 'uncommon', itemLevel: 22, vendorGold: 11,
    stats: { intellect: 7, spirit: 5 },
  },
  // Tier 3 mail healing (ilvl 34–40)
  cuffs_of_the_elements: {
    id: 'cuffs_of_the_elements', name: 'Cuffs of the Elements', slot: 'wrist',
    rarity: 'rare', itemLevel: 34, vendorGold: 26,
    stats: { intellect: 8, spirit: 6, spell_power: 5 },
  },
  treads_of_the_earthcaller: {
    id: 'treads_of_the_earthcaller', name: 'Treads of the Earthcaller', slot: 'feet',
    rarity: 'rare', itemLevel: 36, vendorGold: 28,
    stats: { intellect: 10, spirit: 7, spell_power: 7 },
  },
  gauntlets_of_the_earthcaller: {
    id: 'gauntlets_of_the_earthcaller', name: 'Gauntlets of the Earthcaller', slot: 'hands',
    rarity: 'rare', itemLevel: 38, vendorGold: 30,
    stats: { intellect: 10, spirit: 7, spell_power: 8 },
  },
  leggings_of_the_earthbinder: {
    id: 'leggings_of_the_earthbinder', name: 'Leggings of the Earthbinder', slot: 'legs',
    rarity: 'rare', itemLevel: 40, vendorGold: 34,
    stats: { intellect: 11, spirit: 8, spell_power: 10 },
  },
  spiritcaller_helm: {
    id: 'spiritcaller_helm', name: 'Spiritcaller Helm', slot: 'head',
    rarity: 'rare', itemLevel: 38, vendorGold: 30,
    stats: { intellect: 11, spirit: 8, spell_power: 9 },
  },
  totemic_girdle: {
    id: 'totemic_girdle', name: 'Totemic Girdle', slot: 'waist',
    rarity: 'rare', itemLevel: 36, vendorGold: 26,
    stats: { intellect: 9, spirit: 7, spell_power: 6 },
  },
  shamanic_spaulders: {
    id: 'shamanic_spaulders', name: 'Shamanic Spaulders', slot: 'shoulder',
    rarity: 'rare', itemLevel: 36, vendorGold: 28,
    stats: { intellect: 10, spirit: 7, spell_power: 7 },
  },
  chain_of_the_earthcaller: {
    id: 'chain_of_the_earthcaller', name: 'Chain of the Earthcaller', slot: 'chest',
    rarity: 'rare', itemLevel: 40, vendorGold: 34,
    stats: { intellect: 13, spirit: 9, spell_power: 11 },
  },
  // Epic mail healing (ilvl 54)
  crown_of_the_elements: {
    id: 'crown_of_the_elements', name: 'Crown of the Elements', slot: 'head',
    rarity: 'epic', itemLevel: 54, vendorGold: 85,
    stats: { intellect: 18, spirit: 12, spell_power: 18 },
  },

  // RESTO DRUID / BALANCE — leather + int/spirit/spell_power (tier 2, tier 3, epic)
  nature_wristbands: {
    id: 'nature_wristbands', name: 'Nature Wristbands', slot: 'wrist',
    rarity: 'uncommon', itemLevel: 16, vendorGold: 6,
    stats: { intellect: 4, spirit: 3 },
  },
  naturalist_boots: {
    id: 'naturalist_boots', name: 'Naturalist Boots', slot: 'feet',
    rarity: 'uncommon', itemLevel: 18, vendorGold: 7,
    stats: { intellect: 5, spirit: 4 },
  },
  druid_handwraps: {
    id: 'druid_handwraps', name: 'Druid Handwraps', slot: 'hands',
    rarity: 'uncommon', itemLevel: 18, vendorGold: 7,
    stats: { intellect: 5, spirit: 4 },
  },
  druid_leggings: {
    id: 'druid_leggings', name: 'Druid Leggings', slot: 'legs',
    rarity: 'uncommon', itemLevel: 20, vendorGold: 9,
    stats: { intellect: 6, spirit: 5 },
  },
  druid_headband: {
    id: 'druid_headband', name: 'Druid Headband', slot: 'head',
    rarity: 'uncommon', itemLevel: 16, vendorGold: 6,
    stats: { intellect: 4, spirit: 4 },
  },
  cord_of_nature: {
    id: 'cord_of_nature', name: 'Cord of Nature', slot: 'waist',
    rarity: 'uncommon', itemLevel: 18, vendorGold: 7,
    stats: { intellect: 5, spirit: 4 },
  },
  nature_spaulders: {
    id: 'nature_spaulders', name: 'Nature Spaulders', slot: 'shoulder',
    rarity: 'uncommon', itemLevel: 18, vendorGold: 7,
    stats: { intellect: 5, spirit: 4 },
  },
  naturalist_vest: {
    id: 'naturalist_vest', name: 'Naturalist Vest', slot: 'chest',
    rarity: 'uncommon', itemLevel: 20, vendorGold: 9,
    stats: { intellect: 6, spirit: 5 },
  },
  // Tier 3 leather healing (ilvl 32–38)
  bracers_of_the_grove: {
    id: 'bracers_of_the_grove', name: 'Bracers of the Grove', slot: 'wrist',
    rarity: 'rare', itemLevel: 32, vendorGold: 24,
    stats: { intellect: 8, spirit: 6, spell_power: 5 },
  },
  boots_of_the_dreamgrove: {
    id: 'boots_of_the_dreamgrove', name: 'Boots of the Dreamgrove', slot: 'feet',
    rarity: 'rare', itemLevel: 36, vendorGold: 28,
    stats: { intellect: 9, spirit: 7, spell_power: 6 },
  },
  handwraps_of_the_dreamgrove: {
    id: 'handwraps_of_the_dreamgrove', name: 'Handwraps of the Dreamgrove', slot: 'hands',
    rarity: 'rare', itemLevel: 36, vendorGold: 28,
    stats: { intellect: 10, spirit: 7, spell_power: 7 },
  },
  leggings_of_the_dreamgrove: {
    id: 'leggings_of_the_dreamgrove', name: 'Leggings of the Dreamgrove', slot: 'legs',
    rarity: 'rare', itemLevel: 38, vendorGold: 30,
    stats: { intellect: 11, spirit: 8, spell_power: 9 },
  },
  moonkin_headpiece: {
    id: 'moonkin_headpiece', name: 'Moonkin Headpiece', slot: 'head',
    rarity: 'rare', itemLevel: 34, vendorGold: 26,
    stats: { intellect: 9, spirit: 7, spell_power: 7 },
  },
  dream_sash: {
    id: 'dream_sash', name: 'Dream Sash', slot: 'waist',
    rarity: 'rare', itemLevel: 36, vendorGold: 26,
    stats: { intellect: 9, spirit: 7, spell_power: 6 },
  },
  mantle_of_the_dreamgrove: {
    id: 'mantle_of_the_dreamgrove', name: 'Mantle of the Dreamgrove', slot: 'shoulder',
    rarity: 'rare', itemLevel: 36, vendorGold: 28,
    stats: { intellect: 10, spirit: 7, spell_power: 7 },
  },
  robes_of_the_dreamgrove: {
    id: 'robes_of_the_dreamgrove', name: 'Robes of the Dreamgrove', slot: 'chest',
    rarity: 'rare', itemLevel: 38, vendorGold: 32,
    stats: { intellect: 12, spirit: 9, spell_power: 10 },
  },
  // Epic leather healing (ilvl 52)
  cowl_of_the_dreamgrove: {
    id: 'cowl_of_the_dreamgrove', name: 'Cowl of the Dreamgrove', slot: 'head',
    rarity: 'epic', itemLevel: 52, vendorGold: 80,
    stats: { intellect: 18, spirit: 12, spell_power: 16 },
  },

  // ROGUE parity: mid-bracket daggers (ilvl 26→58 byl 32-level skok)
  venomtip_shiv: {
    id: 'venomtip_shiv', name: 'Venomtip Shiv', slot: 'main_hand',
    rarity: 'rare', itemLevel: 34, vendorGold: 28,
    stats: { agility: 10, stamina: 6, attack_power: 14, crit_rating: 4 },
  },
  shadowfang_dagger: {
    id: 'shadowfang_dagger', name: 'Shadowfang Dagger', slot: 'main_hand',
    rarity: 'rare', itemLevel: 46, vendorGold: 46,
    stats: { agility: 14, stamina: 8, attack_power: 18, crit_rating: 6 },
  },

  // PHYSICAL DPS off-hand (rogues/hunters měli jen caster orbs a tank štíty)
  swiftblade_offhand: {
    id: 'swiftblade_offhand', name: 'Swiftblade Off-Hand', slot: 'off_hand',
    rarity: 'uncommon', itemLevel: 30, vendorGold: 16,
    stats: { agility: 8, attack_power: 12 },
  },
  razor_edge_offhand: {
    id: 'razor_edge_offhand', name: 'Razor Edge Offhand', slot: 'off_hand',
    rarity: 'rare', itemLevel: 46, vendorGold: 44,
    stats: { agility: 13, attack_power: 18, crit_rating: 6 },
  },


  // === BRACKET 4 PARITY (ilvl 46–60) ===
  // Cíl: 50–80 % gearu pro level 40–60. Pokrývá všechny typy brnění × role × sloty.

  // PLATE PHYS DPS — B4 chybí head/shoulder/waist; přidáme i epic vrchol
  conquerors_helm: { id: 'conquerors_helm', name: "Conqueror's Helm", slot: 'head',
    rarity: 'rare', itemLevel: 48, vendorGold: 50,
    stats: { strength: 15, stamina: 12, attack_power: 16, crit_rating: 5 } },
  vanguard_pauldrons: { id: 'vanguard_pauldrons', name: 'Vanguard Pauldrons', slot: 'shoulder',
    rarity: 'rare', itemLevel: 50, vendorGold: 54,
    stats: { strength: 14, stamina: 12, attack_power: 14, armor: 55 } },
  warbringer_girdle: { id: 'warbringer_girdle', name: 'Warbringer Girdle', slot: 'waist',
    rarity: 'rare', itemLevel: 48, vendorGold: 48,
    stats: { strength: 13, stamina: 11, armor: 42 } },
  ironbreaker_helm: { id: 'ironbreaker_helm', name: 'Ironbreaker Helm', slot: 'head',
    rarity: 'epic', itemLevel: 58, vendorGold: 95,
    stats: { strength: 20, stamina: 16, attack_power: 24, crit_rating: 8 } },
  warmaster_pauldrons: { id: 'warmaster_pauldrons', name: 'Warmaster Pauldrons', slot: 'shoulder',
    rarity: 'epic', itemLevel: 60, vendorGold: 100,
    stats: { strength: 22, stamina: 18, attack_power: 26, armor: 90 } },

  // PLATE HEAL (holy paladin) — B4 všechny sloty prázdné
  high_inquisitors_visor: { id: 'high_inquisitors_visor', name: "High Inquisitor's Visor", slot: 'head',
    rarity: 'rare', itemLevel: 50, vendorGold: 54,
    stats: { intellect: 17, spirit: 12, spell_power: 14 } },
  pauldrons_of_faith: { id: 'pauldrons_of_faith', name: 'Pauldrons of Faith', slot: 'shoulder',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { intellect: 16, spirit: 11, spell_power: 12 } },
  chestguard_of_the_faithful: { id: 'chestguard_of_the_faithful', name: 'Chestguard of the Faithful', slot: 'chest',
    rarity: 'rare', itemLevel: 52, vendorGold: 58,
    stats: { intellect: 19, spirit: 13, spell_power: 18 } },
  belt_of_the_blessed: { id: 'belt_of_the_blessed', name: 'Belt of the Blessed', slot: 'waist',
    rarity: 'rare', itemLevel: 48, vendorGold: 48,
    stats: { intellect: 14, spirit: 10, spell_power: 10 } },
  greaves_of_the_blessed: { id: 'greaves_of_the_blessed', name: 'Greaves of the Blessed', slot: 'legs',
    rarity: 'rare', itemLevel: 52, vendorGold: 56,
    stats: { intellect: 17, spirit: 12, spell_power: 14 } },
  sabatons_of_grace: { id: 'sabatons_of_grace', name: 'Sabatons of Grace', slot: 'feet',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { intellect: 15, spirit: 11, spell_power: 12 } },
  bracers_of_the_blessed: { id: 'bracers_of_the_blessed', name: 'Bracers of the Blessed', slot: 'wrist',
    rarity: 'rare', itemLevel: 48, vendorGold: 46,
    stats: { intellect: 13, spirit: 10, spell_power: 9 } },
  gauntlets_of_the_blessed: { id: 'gauntlets_of_the_blessed', name: 'Gauntlets of the Blessed', slot: 'hands',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { intellect: 15, spirit: 11, spell_power: 12 } },

  // MAIL PHYS DPS — B4 chybí head/shoulder/hands/feet/wrist
  savage_chainmail_coif: { id: 'savage_chainmail_coif', name: 'Savage Chainmail Coif', slot: 'head',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { agility: 15, stamina: 12, attack_power: 16, crit_rating: 5 } },
  pauldrons_of_the_predator: { id: 'pauldrons_of_the_predator', name: 'Pauldrons of the Predator', slot: 'shoulder',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { agility: 14, stamina: 11, attack_power: 14, armor: 40 } },
  grasps_of_the_tracker: { id: 'grasps_of_the_tracker', name: 'Grasps of the Tracker', slot: 'hands',
    rarity: 'rare', itemLevel: 48, vendorGold: 48,
    stats: { agility: 13, stamina: 11, attack_power: 14, crit_rating: 5 } },
  tracker_sabatons: { id: 'tracker_sabatons', name: 'Tracker Sabatons', slot: 'feet',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { agility: 14, stamina: 10, attack_power: 14, crit_rating: 4 } },
  bracers_of_the_predator: { id: 'bracers_of_the_predator', name: 'Bracers of the Predator', slot: 'wrist',
    rarity: 'rare', itemLevel: 48, vendorGold: 46,
    stats: { agility: 12, stamina: 10, attack_power: 12 } },

  // MAIL HEAL (resto/ele shaman) — B4 všechny sloty prázdné ("tempest" série)
  coif_of_the_tempest: { id: 'coif_of_the_tempest', name: 'Coif of the Tempest', slot: 'head',
    rarity: 'rare', itemLevel: 50, vendorGold: 54,
    stats: { intellect: 17, spirit: 12, spell_power: 14 } },
  mantle_of_the_tempest: { id: 'mantle_of_the_tempest', name: 'Mantle of the Tempest', slot: 'shoulder',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { intellect: 16, spirit: 11, spell_power: 12 } },
  hauberk_of_the_tempest: { id: 'hauberk_of_the_tempest', name: 'Hauberk of the Tempest', slot: 'chest',
    rarity: 'rare', itemLevel: 52, vendorGold: 58,
    stats: { intellect: 19, spirit: 13, spell_power: 18 } },
  girdle_of_the_tempest: { id: 'girdle_of_the_tempest', name: 'Girdle of the Tempest', slot: 'waist',
    rarity: 'rare', itemLevel: 48, vendorGold: 48,
    stats: { intellect: 14, spirit: 10, spell_power: 10 } },
  leggings_of_the_tempest: { id: 'leggings_of_the_tempest', name: 'Leggings of the Tempest', slot: 'legs',
    rarity: 'rare', itemLevel: 52, vendorGold: 56,
    stats: { intellect: 17, spirit: 12, spell_power: 14 } },
  treads_of_the_tempest: { id: 'treads_of_the_tempest', name: 'Treads of the Tempest', slot: 'feet',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { intellect: 15, spirit: 11, spell_power: 12 } },
  wristbands_of_the_tempest: { id: 'wristbands_of_the_tempest', name: 'Wristbands of the Tempest', slot: 'wrist',
    rarity: 'rare', itemLevel: 48, vendorGold: 46,
    stats: { intellect: 13, spirit: 10, spell_power: 9 } },
  gauntlets_of_the_tempest: { id: 'gauntlets_of_the_tempest', name: 'Gauntlets of the Tempest', slot: 'hands',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { intellect: 15, spirit: 11, spell_power: 12 } },

  // LEATHER PHYS DPS — B4 chybí chest/waist/hands/legs/wrist ("shadowprowler" série)
  shadowprowler_vest: { id: 'shadowprowler_vest', name: 'Shadowprowler Vest', slot: 'chest',
    rarity: 'rare', itemLevel: 52, vendorGold: 58,
    stats: { agility: 17, stamina: 13, attack_power: 18, crit_rating: 6 } },
  shadowprowler_girdle: { id: 'shadowprowler_girdle', name: 'Shadowprowler Girdle', slot: 'waist',
    rarity: 'rare', itemLevel: 48, vendorGold: 46,
    stats: { agility: 13, stamina: 10, attack_power: 14 } },
  shadowprowler_grips: { id: 'shadowprowler_grips', name: 'Shadowprowler Grips', slot: 'hands',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { agility: 14, stamina: 11, attack_power: 16, crit_rating: 5 } },
  shadowprowler_leggings: { id: 'shadowprowler_leggings', name: 'Shadowprowler Leggings', slot: 'legs',
    rarity: 'rare', itemLevel: 52, vendorGold: 56,
    stats: { agility: 16, stamina: 12, attack_power: 18, crit_rating: 7 } },
  shadowprowler_wristguards: { id: 'shadowprowler_wristguards', name: 'Shadowprowler Wristguards', slot: 'wrist',
    rarity: 'rare', itemLevel: 48, vendorGold: 46,
    stats: { agility: 12, stamina: 10, attack_power: 12 } },

  // LEATHER HEAL (resto/balance druid) — B4 jen head; zbytek prázdný ("grove keeper" série)
  mantle_of_the_grove: { id: 'mantle_of_the_grove', name: 'Mantle of the Grove', slot: 'shoulder',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { intellect: 16, spirit: 11, spell_power: 12 } },
  vest_of_the_grove: { id: 'vest_of_the_grove', name: 'Vest of the Grove', slot: 'chest',
    rarity: 'rare', itemLevel: 52, vendorGold: 58,
    stats: { intellect: 19, spirit: 13, spell_power: 18 } },
  sash_of_the_grove: { id: 'sash_of_the_grove', name: 'Sash of the Grove', slot: 'waist',
    rarity: 'rare', itemLevel: 48, vendorGold: 46,
    stats: { intellect: 14, spirit: 10, spell_power: 10 } },
  leggings_of_the_grove: { id: 'leggings_of_the_grove', name: 'Leggings of the Grove', slot: 'legs',
    rarity: 'rare', itemLevel: 52, vendorGold: 56,
    stats: { intellect: 17, spirit: 12, spell_power: 14 } },
  treestride_sabatons: { id: 'treestride_sabatons', name: 'Treestride Sabatons', slot: 'feet',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { intellect: 15, spirit: 11, spell_power: 12 } },
  wristguards_of_the_keeper: { id: 'wristguards_of_the_keeper', name: 'Wristguards of the Keeper', slot: 'wrist',
    rarity: 'rare', itemLevel: 48, vendorGold: 46,
    stats: { intellect: 13, spirit: 10, spell_power: 9 } },
  grips_of_the_keeper: { id: 'grips_of_the_keeper', name: 'Grips of the Keeper', slot: 'hands',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { intellect: 15, spirit: 11, spell_power: 12 } },

  // CLOTH HEAL — B4 chybí shoulder/waist/feet/hands
  mantle_of_the_arcane: { id: 'mantle_of_the_arcane', name: 'Mantle of the Arcane', slot: 'shoulder',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { intellect: 16, spirit: 11, spell_power: 12 } },
  arcane_sash: { id: 'arcane_sash', name: 'Arcane Sash', slot: 'waist',
    rarity: 'rare', itemLevel: 50, vendorGold: 50,
    stats: { intellect: 14, spirit: 10, spell_power: 12 } },
  arcane_sandals: { id: 'arcane_sandals', name: 'Arcane Sandals', slot: 'feet',
    rarity: 'rare', itemLevel: 48, vendorGold: 48,
    stats: { intellect: 14, spirit: 10, spell_power: 10 } },
  spellbinder_gloves: { id: 'spellbinder_gloves', name: 'Spellbinder Gloves', slot: 'hands',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { intellect: 15, spirit: 11, spell_power: 14, crit_rating: 4 } },

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


  // === BRACKET 5 — T3 epic sets (ilvl 62–66, raid-only BoP) ===
  // Každá classa/role dostane kompletní 8-dílný set na endgame úrovni.

  // T3 CLOTH — Frostfire (mage/priest/warlock)
  t3_frostfire_circlet: { id: 't3_frostfire_circlet', name: 'Frostfire Circlet', slot: 'head',
    rarity: 'epic', itemLevel: 66, vendorGold: 180,
    stats: { intellect: 30, spirit: 18, spell_power: 38, crit_rating: 12 } },
  t3_frostfire_shoulderpads: { id: 't3_frostfire_shoulderpads', name: 'Frostfire Shoulderpads', slot: 'shoulder',
    rarity: 'epic', itemLevel: 64, vendorGold: 165,
    stats: { intellect: 26, spirit: 16, spell_power: 32, crit_rating: 10 } },
  t3_frostfire_robe: { id: 't3_frostfire_robe', name: 'Frostfire Robe', slot: 'chest',
    rarity: 'epic', itemLevel: 66, vendorGold: 180,
    stats: { intellect: 32, spirit: 20, spell_power: 40, crit_rating: 12 } },
  t3_frostfire_belt: { id: 't3_frostfire_belt', name: 'Frostfire Belt', slot: 'waist',
    rarity: 'epic', itemLevel: 64, vendorGold: 160,
    stats: { intellect: 24, spirit: 16, spell_power: 30, crit_rating: 10 } },
  t3_frostfire_leggings: { id: 't3_frostfire_leggings', name: 'Frostfire Leggings', slot: 'legs',
    rarity: 'epic', itemLevel: 64, vendorGold: 165,
    stats: { intellect: 28, spirit: 18, spell_power: 34, crit_rating: 12 } },
  t3_frostfire_boots: { id: 't3_frostfire_boots', name: 'Frostfire Boots', slot: 'feet',
    rarity: 'epic', itemLevel: 64, vendorGold: 160,
    stats: { intellect: 24, spirit: 16, spell_power: 28, crit_rating: 8 } },
  t3_frostfire_cuffs: { id: 't3_frostfire_cuffs', name: 'Frostfire Cuffs', slot: 'wrist',
    rarity: 'epic', itemLevel: 62, vendorGold: 150,
    stats: { intellect: 22, spirit: 14, spell_power: 26, crit_rating: 8 } },
  t3_frostfire_gloves: { id: 't3_frostfire_gloves', name: 'Frostfire Gloves', slot: 'hands',
    rarity: 'epic', itemLevel: 64, vendorGold: 160,
    stats: { intellect: 24, spirit: 16, spell_power: 30, crit_rating: 10 } },

  // T3 LEATHER PHYS — Cryptstalker (rogue/feral druid)
  t3_cryptstalker_headpiece: { id: 't3_cryptstalker_headpiece', name: 'Cryptstalker Headpiece', slot: 'head',
    rarity: 'epic', itemLevel: 66, vendorGold: 180,
    stats: { agility: 30, stamina: 22, attack_power: 42, crit_rating: 14 } },
  t3_cryptstalker_spaulders: { id: 't3_cryptstalker_spaulders', name: 'Cryptstalker Spaulders', slot: 'shoulder',
    rarity: 'epic', itemLevel: 64, vendorGold: 165,
    stats: { agility: 26, stamina: 20, attack_power: 36, crit_rating: 12 } },
  t3_cryptstalker_tunic: { id: 't3_cryptstalker_tunic', name: 'Cryptstalker Tunic', slot: 'chest',
    rarity: 'epic', itemLevel: 66, vendorGold: 180,
    stats: { agility: 30, stamina: 24, attack_power: 42, crit_rating: 14 } },
  t3_cryptstalker_girdle: { id: 't3_cryptstalker_girdle', name: 'Cryptstalker Girdle', slot: 'waist',
    rarity: 'epic', itemLevel: 64, vendorGold: 155,
    stats: { agility: 24, stamina: 18, attack_power: 32, crit_rating: 10 } },
  t3_cryptstalker_legguards: { id: 't3_cryptstalker_legguards', name: 'Cryptstalker Legguards', slot: 'legs',
    rarity: 'epic', itemLevel: 64, vendorGold: 165,
    stats: { agility: 28, stamina: 20, attack_power: 38, crit_rating: 12 } },
  t3_cryptstalker_boots: { id: 't3_cryptstalker_boots', name: 'Cryptstalker Boots', slot: 'feet',
    rarity: 'epic', itemLevel: 64, vendorGold: 155,
    stats: { agility: 24, stamina: 18, attack_power: 32, crit_rating: 10 } },
  t3_cryptstalker_wristguards: { id: 't3_cryptstalker_wristguards', name: 'Cryptstalker Wristguards', slot: 'wrist',
    rarity: 'epic', itemLevel: 62, vendorGold: 145,
    stats: { agility: 22, stamina: 16, attack_power: 28, crit_rating: 8 } },
  t3_cryptstalker_gloves: { id: 't3_cryptstalker_gloves', name: 'Cryptstalker Gloves', slot: 'hands',
    rarity: 'epic', itemLevel: 64, vendorGold: 155,
    stats: { agility: 24, stamina: 18, attack_power: 32, crit_rating: 10 } },

  // T3 LEATHER HEAL — Dreamwalker (resto/balance druid)
  t3_dreamwalker_headguard: { id: 't3_dreamwalker_headguard', name: 'Dreamwalker Headguard', slot: 'head',
    rarity: 'epic', itemLevel: 66, vendorGold: 180,
    stats: { intellect: 30, spirit: 20, spell_power: 38 } },
  t3_dreamwalker_spaulders: { id: 't3_dreamwalker_spaulders', name: 'Dreamwalker Spaulders', slot: 'shoulder',
    rarity: 'epic', itemLevel: 64, vendorGold: 165,
    stats: { intellect: 26, spirit: 18, spell_power: 32 } },
  t3_dreamwalker_vestments: { id: 't3_dreamwalker_vestments', name: 'Dreamwalker Vestments', slot: 'chest',
    rarity: 'epic', itemLevel: 66, vendorGold: 180,
    stats: { intellect: 30, spirit: 22, spell_power: 40 } },
  t3_dreamwalker_girdle: { id: 't3_dreamwalker_girdle', name: 'Dreamwalker Girdle', slot: 'waist',
    rarity: 'epic', itemLevel: 64, vendorGold: 155,
    stats: { intellect: 24, spirit: 16, spell_power: 28 } },
  t3_dreamwalker_leggings: { id: 't3_dreamwalker_leggings', name: 'Dreamwalker Leggings', slot: 'legs',
    rarity: 'epic', itemLevel: 64, vendorGold: 165,
    stats: { intellect: 28, spirit: 18, spell_power: 34 } },
  t3_dreamwalker_boots: { id: 't3_dreamwalker_boots', name: 'Dreamwalker Boots', slot: 'feet',
    rarity: 'epic', itemLevel: 64, vendorGold: 155,
    stats: { intellect: 22, spirit: 16, spell_power: 26 } },
  t3_dreamwalker_wristguards: { id: 't3_dreamwalker_wristguards', name: 'Dreamwalker Wristguards', slot: 'wrist',
    rarity: 'epic', itemLevel: 62, vendorGold: 145,
    stats: { intellect: 20, spirit: 14, spell_power: 24 } },
  t3_dreamwalker_gloves: { id: 't3_dreamwalker_gloves', name: 'Dreamwalker Gloves', slot: 'hands',
    rarity: 'epic', itemLevel: 64, vendorGold: 155,
    stats: { intellect: 22, spirit: 16, spell_power: 28 } },

  // T3 MAIL PHYS — Bonescythe (hunter/enhance shaman)
  t3_bonescythe_helm: { id: 't3_bonescythe_helm', name: 'Bonescythe Helm', slot: 'head',
    rarity: 'epic', itemLevel: 66, vendorGold: 180,
    stats: { agility: 28, stamina: 20, attack_power: 40, crit_rating: 14 } },
  t3_bonescythe_pauldrons: { id: 't3_bonescythe_pauldrons', name: 'Bonescythe Pauldrons', slot: 'shoulder',
    rarity: 'epic', itemLevel: 64, vendorGold: 165,
    stats: { agility: 24, stamina: 18, attack_power: 34, crit_rating: 12 } },
  t3_bonescythe_breastplate: { id: 't3_bonescythe_breastplate', name: 'Bonescythe Breastplate', slot: 'chest',
    rarity: 'epic', itemLevel: 66, vendorGold: 180,
    stats: { agility: 28, stamina: 22, attack_power: 40, crit_rating: 14 } },
  t3_bonescythe_waistguard: { id: 't3_bonescythe_waistguard', name: 'Bonescythe Waistguard', slot: 'waist',
    rarity: 'epic', itemLevel: 64, vendorGold: 155,
    stats: { agility: 22, stamina: 16, attack_power: 30, crit_rating: 10 } },
  t3_bonescythe_legplates: { id: 't3_bonescythe_legplates', name: 'Bonescythe Legplates', slot: 'legs',
    rarity: 'epic', itemLevel: 64, vendorGold: 165,
    stats: { agility: 26, stamina: 18, attack_power: 36, crit_rating: 12 } },
  t3_bonescythe_sabatons: { id: 't3_bonescythe_sabatons', name: 'Bonescythe Sabatons', slot: 'feet',
    rarity: 'epic', itemLevel: 64, vendorGold: 155,
    stats: { agility: 22, stamina: 16, attack_power: 30, crit_rating: 10 } },
  t3_bonescythe_bracers: { id: 't3_bonescythe_bracers', name: 'Bonescythe Bracers', slot: 'wrist',
    rarity: 'epic', itemLevel: 62, vendorGold: 145,
    stats: { agility: 20, stamina: 14, attack_power: 26, crit_rating: 8 } },
  t3_bonescythe_gauntlets: { id: 't3_bonescythe_gauntlets', name: 'Bonescythe Gauntlets', slot: 'hands',
    rarity: 'epic', itemLevel: 64, vendorGold: 155,
    stats: { agility: 22, stamina: 16, attack_power: 30, crit_rating: 10 } },

  // T3 MAIL HEAL — Earthshatter (resto/ele shaman)
  t3_earthshatter_headpiece: { id: 't3_earthshatter_headpiece', name: 'Earthshatter Headpiece', slot: 'head',
    rarity: 'epic', itemLevel: 66, vendorGold: 180,
    stats: { intellect: 30, spirit: 20, spell_power: 40 } },
  t3_earthshatter_spaulders: { id: 't3_earthshatter_spaulders', name: 'Earthshatter Spaulders', slot: 'shoulder',
    rarity: 'epic', itemLevel: 64, vendorGold: 165,
    stats: { intellect: 26, spirit: 18, spell_power: 34 } },
  t3_earthshatter_tunic: { id: 't3_earthshatter_tunic', name: 'Earthshatter Tunic', slot: 'chest',
    rarity: 'epic', itemLevel: 66, vendorGold: 180,
    stats: { intellect: 30, spirit: 22, spell_power: 42 } },
  t3_earthshatter_girdle: { id: 't3_earthshatter_girdle', name: 'Earthshatter Girdle', slot: 'waist',
    rarity: 'epic', itemLevel: 64, vendorGold: 155,
    stats: { intellect: 24, spirit: 16, spell_power: 30 } },
  t3_earthshatter_legguards: { id: 't3_earthshatter_legguards', name: 'Earthshatter Legguards', slot: 'legs',
    rarity: 'epic', itemLevel: 64, vendorGold: 165,
    stats: { intellect: 28, spirit: 18, spell_power: 36 } },
  t3_earthshatter_boots: { id: 't3_earthshatter_boots', name: 'Earthshatter Boots', slot: 'feet',
    rarity: 'epic', itemLevel: 64, vendorGold: 155,
    stats: { intellect: 22, spirit: 16, spell_power: 28 } },
  t3_earthshatter_wristguards: { id: 't3_earthshatter_wristguards', name: 'Earthshatter Wristguards', slot: 'wrist',
    rarity: 'epic', itemLevel: 62, vendorGold: 145,
    stats: { intellect: 20, spirit: 14, spell_power: 24 } },
  t3_earthshatter_gauntlets: { id: 't3_earthshatter_gauntlets', name: 'Earthshatter Gauntlets', slot: 'hands',
    rarity: 'epic', itemLevel: 64, vendorGold: 155,
    stats: { intellect: 22, spirit: 16, spell_power: 28 } },

  // T3 PLATE PHYS — Dreadnaught (warrior/paladin DPS)
  t3_dreadnaught_helm: { id: 't3_dreadnaught_helm', name: 'Dreadnaught Helm', slot: 'head',
    rarity: 'epic', itemLevel: 66, vendorGold: 180,
    stats: { strength: 28, stamina: 24, attack_power: 36, crit_rating: 10, armor: 120 } },
  t3_dreadnaught_pauldrons: { id: 't3_dreadnaught_pauldrons', name: 'Dreadnaught Pauldrons', slot: 'shoulder',
    rarity: 'epic', itemLevel: 64, vendorGold: 165,
    stats: { strength: 24, stamina: 22, attack_power: 30, armor: 110 } },
  t3_dreadnaught_breastplate: { id: 't3_dreadnaught_breastplate', name: 'Dreadnaught Breastplate', slot: 'chest',
    rarity: 'epic', itemLevel: 66, vendorGold: 180,
    stats: { strength: 30, stamina: 26, attack_power: 38, armor: 140 } },
  t3_dreadnaught_waistguard: { id: 't3_dreadnaught_waistguard', name: 'Dreadnaught Waistguard', slot: 'waist',
    rarity: 'epic', itemLevel: 64, vendorGold: 155,
    stats: { strength: 24, stamina: 20, attack_power: 28, armor: 100 } },
  t3_dreadnaught_legguards: { id: 't3_dreadnaught_legguards', name: 'Dreadnaught Legguards', slot: 'legs',
    rarity: 'epic', itemLevel: 64, vendorGold: 165,
    stats: { strength: 26, stamina: 24, attack_power: 32, armor: 120 } },
  t3_dreadnaught_sabatons: { id: 't3_dreadnaught_sabatons', name: 'Dreadnaught Sabatons', slot: 'feet',
    rarity: 'epic', itemLevel: 64, vendorGold: 155,
    stats: { strength: 22, stamina: 20, attack_power: 26, armor: 90 } },
  t3_dreadnaught_wristguards: { id: 't3_dreadnaught_wristguards', name: 'Dreadnaught Wristguards', slot: 'wrist',
    rarity: 'epic', itemLevel: 62, vendorGold: 145,
    stats: { strength: 20, stamina: 18, attack_power: 22, armor: 80 } },
  t3_dreadnaught_gauntlets: { id: 't3_dreadnaught_gauntlets', name: 'Dreadnaught Gauntlets', slot: 'hands',
    rarity: 'epic', itemLevel: 64, vendorGold: 155,
    stats: { strength: 22, stamina: 20, attack_power: 26, armor: 90 } },

  // T3 PLATE HEAL — Redemption (holy paladin)
  t3_redemption_helm: { id: 't3_redemption_helm', name: 'Redemption Helm', slot: 'head',
    rarity: 'epic', itemLevel: 66, vendorGold: 180,
    stats: { intellect: 30, spirit: 20, spell_power: 40 } },
  t3_redemption_spaulders: { id: 't3_redemption_spaulders', name: 'Redemption Spaulders', slot: 'shoulder',
    rarity: 'epic', itemLevel: 64, vendorGold: 165,
    stats: { intellect: 26, spirit: 18, spell_power: 34 } },
  t3_redemption_breastplate: { id: 't3_redemption_breastplate', name: 'Redemption Breastplate', slot: 'chest',
    rarity: 'epic', itemLevel: 66, vendorGold: 180,
    stats: { intellect: 32, spirit: 22, spell_power: 42 } },
  t3_redemption_girdle: { id: 't3_redemption_girdle', name: 'Redemption Girdle', slot: 'waist',
    rarity: 'epic', itemLevel: 64, vendorGold: 155,
    stats: { intellect: 24, spirit: 16, spell_power: 30 } },
  t3_redemption_legguards: { id: 't3_redemption_legguards', name: 'Redemption Legguards', slot: 'legs',
    rarity: 'epic', itemLevel: 64, vendorGold: 165,
    stats: { intellect: 28, spirit: 18, spell_power: 36 } },
  t3_redemption_boots: { id: 't3_redemption_boots', name: 'Redemption Boots', slot: 'feet',
    rarity: 'epic', itemLevel: 64, vendorGold: 155,
    stats: { intellect: 24, spirit: 16, spell_power: 28 } },
  t3_redemption_wristguards: { id: 't3_redemption_wristguards', name: 'Redemption Wristguards', slot: 'wrist',
    rarity: 'epic', itemLevel: 62, vendorGold: 145,
    stats: { intellect: 20, spirit: 14, spell_power: 24 } },
  t3_redemption_gauntlets: { id: 't3_redemption_gauntlets', name: 'Redemption Gauntlets', slot: 'hands',
    rarity: 'epic', itemLevel: 64, vendorGold: 155,
    stats: { intellect: 22, spirit: 16, spell_power: 28 } },

  // === NON-ARMOR B4–B5: weapons, neck, trinket, back, finger ===

  // Healing weapons (B2-B4 thin — 22 phys vs 8 healing)
  oaken_healing_mace: { id: 'oaken_healing_mace', name: 'Oaken Healing Mace', slot: 'main_hand',
    rarity: 'uncommon', itemLevel: 24, vendorGold: 11,
    stats: { intellect: 7, spirit: 5, spell_power: 8 } },
  blessed_staff_of_the_temple: { id: 'blessed_staff_of_the_temple', name: 'Blessed Staff of the Temple', slot: 'main_hand',
    rarity: 'rare', itemLevel: 36, vendorGold: 30,
    stats: { intellect: 11, spirit: 7, spell_power: 12 } },
  scepter_of_holy_light: { id: 'scepter_of_holy_light', name: 'Scepter of Holy Light', slot: 'main_hand',
    rarity: 'rare', itemLevel: 50, vendorGold: 54,
    stats: { intellect: 16, spirit: 10, spell_power: 18 } },
  staff_of_the_ancients: { id: 'staff_of_the_ancients', name: 'Staff of the Ancients', slot: 'main_hand',
    rarity: 'epic', itemLevel: 64, vendorGold: 165,
    stats: { intellect: 28, spirit: 18, spell_power: 36, crit_rating: 10 } },

  // Neck B4–B5
  necklace_of_wisdom: { id: 'necklace_of_wisdom', name: 'Necklace of Wisdom', slot: 'neck',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { intellect: 14, spirit: 10, spell_power: 12 } },
  pendant_of_battle: { id: 'pendant_of_battle', name: 'Pendant of Battle', slot: 'neck',
    rarity: 'rare', itemLevel: 48, vendorGold: 48,
    stats: { agility: 12, attack_power: 16, crit_rating: 7 } },
  amulet_of_the_crusader: { id: 'amulet_of_the_crusader', name: 'Amulet of the Crusader', slot: 'neck',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { strength: 13, stamina: 12, attack_power: 14 } },
  pendant_of_eternal_flame: { id: 'pendant_of_eternal_flame', name: 'Pendant of Eternal Flame', slot: 'neck',
    rarity: 'epic', itemLevel: 64, vendorGold: 160,
    stats: { intellect: 22, spirit: 16, spell_power: 28 } },

  // Trinket B2 + B4 + B5
  battle_totem: { id: 'battle_totem', name: 'Battle Totem', slot: 'trinket',
    rarity: 'uncommon', itemLevel: 24, vendorGold: 10,
    stats: { strength: 7, attack_power: 10 } },
  claw_of_the_beast: { id: 'claw_of_the_beast', name: 'Claw of the Beast', slot: 'trinket',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { agility: 14, attack_power: 18, crit_rating: 6 } },
  focusing_crystal: { id: 'focusing_crystal', name: 'Focusing Crystal', slot: 'trinket',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { intellect: 14, spell_power: 16, crit_rating: 6 } },
  mark_of_the_champion: { id: 'mark_of_the_champion', name: 'Mark of the Champion', slot: 'trinket',
    rarity: 'epic', itemLevel: 64, vendorGold: 160,
    stats: { strength: 20, attack_power: 30, crit_rating: 12 } },
  eye_of_the_oracle: { id: 'eye_of_the_oracle', name: 'Eye of the Oracle', slot: 'trinket',
    rarity: 'epic', itemLevel: 64, vendorGold: 160,
    stats: { intellect: 22, spell_power: 28, crit_rating: 12 } },

  // Back B4–B5
  cloak_of_the_slayer: { id: 'cloak_of_the_slayer', name: 'Cloak of the Slayer', slot: 'back',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { strength: 12, attack_power: 16, crit_rating: 6 } },
  velvet_spellcloak: { id: 'velvet_spellcloak', name: 'Velvet Spellcloak', slot: 'back',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { intellect: 13, spirit: 8, spell_power: 14 } },
  shroud_of_the_eternal: { id: 'shroud_of_the_eternal', name: 'Shroud of the Eternal', slot: 'back',
    rarity: 'epic', itemLevel: 64, vendorGold: 160,
    stats: { agility: 20, stamina: 14, attack_power: 26, crit_rating: 10 } },

  // Finger B4–B5
  band_of_the_crusader: { id: 'band_of_the_crusader', name: 'Band of the Crusader', slot: 'finger',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { strength: 14, stamina: 12, attack_power: 16 } },
  ring_of_the_tempest: { id: 'ring_of_the_tempest', name: 'Ring of the Tempest', slot: 'finger',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { intellect: 14, spirit: 10, spell_power: 12 } },
  band_of_the_predator: { id: 'band_of_the_predator', name: 'Band of the Predator', slot: 'finger',
    rarity: 'rare', itemLevel: 50, vendorGold: 52,
    stats: { agility: 14, attack_power: 16, crit_rating: 8 } },
  seal_of_the_fallen_king: { id: 'seal_of_the_fallen_king', name: 'Seal of the Fallen King', slot: 'finger',
    rarity: 'epic', itemLevel: 66, vendorGold: 180,
    stats: { strength: 26, stamina: 20, attack_power: 34, crit_rating: 12 } },
  band_of_infinite_wisdom: { id: 'band_of_infinite_wisdom', name: 'Band of Infinite Wisdom', slot: 'finger',
    rarity: 'epic', itemLevel: 66, vendorGold: 180,
    stats: { intellect: 28, spirit: 18, spell_power: 36, crit_rating: 10 } },

  // --- Craftovatelné kožené batohy (Leatherworking): vzácnější kůže = větší
  // batoh. Větší než vendorové (až 16 slotů). Obchodovatelné (ne BoP). ---
  light_leather_satchel: {
    id: 'light_leather_satchel', name: 'Light Leather Satchel', slot: 'bag',
    rarity: 'common', itemLevel: 1, vendorGold: 20, stats: {}, bagSlots: 8,
  },
  medium_leather_pack: {
    id: 'medium_leather_pack', name: 'Medium Leather Pack', slot: 'bag',
    rarity: 'uncommon', itemLevel: 1, vendorGold: 60, stats: {}, bagSlots: 12,
  },
  heavy_leather_bag: {
    id: 'heavy_leather_bag', name: 'Heavy Leather Bag', slot: 'bag',
    rarity: 'rare', itemLevel: 1, vendorGold: 150, stats: {}, bagSlots: 16,
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
  // M12 Zul'Gurub raid loot
  'zg_halberd_of_smiting', 'zg_bloodlords_chestplate', 'zg_primalist_belt',
  'zg_overlord_helmet', 'zg_jindo_mantle', 'zg_zanzils_seal',
  // M12 Temple of Ahn'Qiraj raid loot
  'aq_scepter_shifting_sands', 'aq_silithid_carapace', 'aq_qiraji_bindings',
  'aq_gloves_of_the_immortal', 'aq_ring_of_emperors', 'aq_cloak_of_the_golden_hive',
  // M12 40–60 dungeon loot
  'zf_sandstalker_ankleguards', 'zf_jinxed_hoodoo_staff', 'zf_bloodmail_gauntlets',
  'mar_theradras_scepter', 'mar_elemental_girdle', 'mar_lifegiving_gem',
  'brd_ironfoe', 'brd_emperors_seal', 'brd_flameweave_cuffs',
  'strat_runeblade_rivendare', 'strat_deathbone_legguards', 'strat_skul_cap',
  // M12 nízkoúrovňové dungeon loot
  'wc_serpentine_band', 'wc_deviate_hide_pauldrons',
  'bfd_rod_of_the_sleeper', 'bfd_gaze_dreamer_robes',
  // Více gearu: BRD dungeon trinket (BoP)
  'brd_void_shard',
  // Diverzita Round 2: Dire Maul + Scholomance dungeon loot
  'dm_gordok_ring', 'dm_mark_of_the_wild',
  'sch_death_whisper_leggings', 'sch_bone_ring_of_command',
  // T3 epic raid sets (Naxxramas-tier, BoP)
  't3_frostfire_circlet', 't3_frostfire_shoulderpads', 't3_frostfire_robe',
  't3_frostfire_belt', 't3_frostfire_leggings', 't3_frostfire_boots',
  't3_frostfire_cuffs', 't3_frostfire_gloves',
  't3_cryptstalker_headpiece', 't3_cryptstalker_spaulders', 't3_cryptstalker_tunic',
  't3_cryptstalker_girdle', 't3_cryptstalker_legguards', 't3_cryptstalker_boots',
  't3_cryptstalker_wristguards', 't3_cryptstalker_gloves',
  't3_dreamwalker_headguard', 't3_dreamwalker_spaulders', 't3_dreamwalker_vestments',
  't3_dreamwalker_girdle', 't3_dreamwalker_leggings', 't3_dreamwalker_boots',
  't3_dreamwalker_wristguards', 't3_dreamwalker_gloves',
  't3_bonescythe_helm', 't3_bonescythe_pauldrons', 't3_bonescythe_breastplate',
  't3_bonescythe_waistguard', 't3_bonescythe_legplates', 't3_bonescythe_sabatons',
  't3_bonescythe_bracers', 't3_bonescythe_gauntlets',
  't3_earthshatter_headpiece', 't3_earthshatter_spaulders', 't3_earthshatter_tunic',
  't3_earthshatter_girdle', 't3_earthshatter_legguards', 't3_earthshatter_boots',
  't3_earthshatter_wristguards', 't3_earthshatter_gauntlets',
  't3_dreadnaught_helm', 't3_dreadnaught_pauldrons', 't3_dreadnaught_breastplate',
  't3_dreadnaught_waistguard', 't3_dreadnaught_legguards', 't3_dreadnaught_sabatons',
  't3_dreadnaught_wristguards', 't3_dreadnaught_gauntlets',
  't3_redemption_helm', 't3_redemption_spaulders', 't3_redemption_breastplate',
  't3_redemption_girdle', 't3_redemption_legguards', 't3_redemption_boots',
  't3_redemption_wristguards', 't3_redemption_gauntlets',
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
    'plaguebloom_circlet', 'runecloth_robe', 'girdle_of_the_mendicant',
    'zg_jindo_mantle', 'aq_gloves_of_the_immortal',
    'brd_flameweave_cuffs', 'strat_skul_cap',
    'bfd_gaze_dreamer_robes',
    // Více gearu
    'spellcaster_shoulderguards',
    // Diverzita Round 2: cloth wrist/waist/chest
    'silk_cuffs', 'arcane_wristwraps', 'mystic_sash', 'council_robes',
    // Scholomance cloth legs
    'sch_death_whisper_leggings',
    // B4 cloth heal
    'mantle_of_the_arcane', 'arcane_sash', 'arcane_sandals', 'spellbinder_gloves',
    // T3 Frostfire (cloth — epic raid BoP)
    't3_frostfire_circlet', 't3_frostfire_shoulderpads', 't3_frostfire_robe',
    't3_frostfire_belt', 't3_frostfire_leggings', 't3_frostfire_boots',
    't3_frostfire_cuffs', 't3_frostfire_gloves',
  ],
  leather: [
    'leather_cap', 'scout_vest', 'ranger_gloves', 'shadow_cowl',
    'shadow_vambraces', 'aged_core_leather_gloves', 'traveler_boots',
    'simple_bracers',
    'wildheart_spaulders', 'feltracker_boots',
    'zg_overlord_helmet',
    'zf_sandstalker_ankleguards',
    'wc_deviate_hide_pauldrons',
    // Více gearu: chybějící leather legs + waist + bracket-2 fills
    'pantherskin_leggings', 'rogue_sash',
    'savage_leather_leggings', 'stalker_cord',
    'forest_warden_vest', 'ironbark_bracers',
    // Diverzita Round 2: leather shoulders, hybrid chest
    'sentinel_mantle', 'druidic_tunic',
    // Healer parity: leather healing (resto druid / balance)
    'nature_wristbands', 'naturalist_boots', 'druid_handwraps', 'druid_leggings',
    'druid_headband', 'cord_of_nature', 'nature_spaulders', 'naturalist_vest',
    'bracers_of_the_grove', 'boots_of_the_dreamgrove', 'handwraps_of_the_dreamgrove',
    'leggings_of_the_dreamgrove', 'moonkin_headpiece', 'dream_sash',
    'mantle_of_the_dreamgrove', 'robes_of_the_dreamgrove', 'cowl_of_the_dreamgrove',
    // B4 leather phys (shadowprowler)
    'shadowprowler_vest', 'shadowprowler_girdle', 'shadowprowler_grips',
    'shadowprowler_leggings', 'shadowprowler_wristguards',
    // B4 leather heal (grove keeper)
    'mantle_of_the_grove', 'vest_of_the_grove', 'sash_of_the_grove',
    'leggings_of_the_grove', 'treestride_sabatons', 'wristguards_of_the_keeper', 'grips_of_the_keeper',
    // T3 Cryptstalker (leather phys — epic raid BoP)
    't3_cryptstalker_headpiece', 't3_cryptstalker_spaulders', 't3_cryptstalker_tunic',
    't3_cryptstalker_girdle', 't3_cryptstalker_legguards', 't3_cryptstalker_boots',
    't3_cryptstalker_wristguards', 't3_cryptstalker_gloves',
    // T3 Dreamwalker (leather heal — epic raid BoP)
    't3_dreamwalker_headguard', 't3_dreamwalker_spaulders', 't3_dreamwalker_vestments',
    't3_dreamwalker_girdle', 't3_dreamwalker_leggings', 't3_dreamwalker_boots',
    't3_dreamwalker_wristguards', 't3_dreamwalker_gloves',
  ],
  mail: [
    'chain_leggings', 'dragonscale_belt', 'mithril_breastplate',
    'chromatic_chainmail', 'plaguehound_leggings',
    'zg_primalist_belt', 'aq_qiraji_bindings',
    'mar_elemental_girdle',
    // Více gearu: chybějící mail head/shoulder/feet/hands
    'riveted_chainmail_coif', 'riveted_chainmail_pauldrons',
    'chain_link_boots', 'chain_link_gauntlets',
    'beastmaster_helm', 'predators_pauldrons',
    'swifthunter_boots', 'elementalist_gauntlets',
    // Diverzita Round 2: mail wrist, shoulder
    'chainmail_bracers', 'ironmail_spaulders',
    // Healer parity: mail healing (resto/ele shaman)
    'shamanic_wristbands', 'shamanic_boots', 'totemic_grips', 'shamanic_leggings',
    'stormcaller_coif', 'sash_of_the_elements', 'earth_mantle', 'totemic_hauberk',
    'cuffs_of_the_elements', 'treads_of_the_earthcaller', 'gauntlets_of_the_earthcaller',
    'leggings_of_the_earthbinder', 'spiritcaller_helm', 'totemic_girdle',
    'shamanic_spaulders', 'chain_of_the_earthcaller', 'crown_of_the_elements',
    // B4 mail phys (predator)
    'savage_chainmail_coif', 'pauldrons_of_the_predator', 'grasps_of_the_tracker',
    'tracker_sabatons', 'bracers_of_the_predator',
    // B4 mail heal (tempest)
    'coif_of_the_tempest', 'mantle_of_the_tempest', 'hauberk_of_the_tempest',
    'girdle_of_the_tempest', 'leggings_of_the_tempest', 'treads_of_the_tempest',
    'wristbands_of_the_tempest', 'gauntlets_of_the_tempest',
    // T3 Bonescythe (mail phys — epic raid BoP)
    't3_bonescythe_helm', 't3_bonescythe_pauldrons', 't3_bonescythe_breastplate',
    't3_bonescythe_waistguard', 't3_bonescythe_legplates', 't3_bonescythe_sabatons',
    't3_bonescythe_bracers', 't3_bonescythe_gauntlets',
    // T3 Earthshatter (mail heal — epic raid BoP)
    't3_earthshatter_headpiece', 't3_earthshatter_spaulders', 't3_earthshatter_tunic',
    't3_earthshatter_girdle', 't3_earthshatter_legguards', 't3_earthshatter_boots',
    't3_earthshatter_wristguards', 't3_earthshatter_gauntlets',
  ],
  plate: [
    'soldier_helm', 'marauder_shoulders', 'crusader_belt', 'warlord_plate',
    'titan_boots', 'sentinel_legguards', 'herod_shoulder',
    'sabatons_of_the_flamewalker', 'drake_talon_pauldrons',
    'gauntlets_of_the_fallen', 'bracers_of_undeath',
    'zg_bloodlords_chestplate', 'aq_silithid_carapace',
    'zf_bloodmail_gauntlets', 'strat_deathbone_legguards',
    // Více gearu: bracket-2 plate fills
    'templar_legplates', 'warpath_sabatons',
    // Diverzita Round 2: plate chest tier-2, wrist
    'platemail_hauberk', 'ironplate_wristguards',
    // Healer parity: plate healing (holy paladin)
    'vambraces_of_light', 'boots_of_the_healer', 'gauntlets_of_devotion',
    'legplates_of_faith', 'holy_crown_of_light', 'belt_of_benediction',
    'mantle_of_devotion', 'breastplate_of_devotion',
    'bracers_of_benediction', 'sabatons_of_benediction', 'gauntlets_of_the_lightbringer',
    'greaves_of_the_redeemer', 'sacred_visor', 'girdle_of_the_holy',
    'spaulders_of_the_lightbringer', 'blessed_breastplate',
    'crown_of_the_redeemer', 'raiment_of_the_light',
    // B4 plate phys
    'conquerors_helm', 'vanguard_pauldrons', 'warbringer_girdle',
    'ironbreaker_helm', 'warmaster_pauldrons',
    // B4 plate heal (blessed)
    'high_inquisitors_visor', 'pauldrons_of_faith', 'chestguard_of_the_faithful',
    'belt_of_the_blessed', 'greaves_of_the_blessed', 'sabatons_of_grace',
    'bracers_of_the_blessed', 'gauntlets_of_the_blessed',
    // T3 Dreadnaught (plate phys — epic raid BoP)
    't3_dreadnaught_helm', 't3_dreadnaught_pauldrons', 't3_dreadnaught_breastplate',
    't3_dreadnaught_waistguard', 't3_dreadnaught_legguards', 't3_dreadnaught_sabatons',
    't3_dreadnaught_wristguards', 't3_dreadnaught_gauntlets',
    // T3 Redemption (plate heal — epic raid BoP)
    't3_redemption_helm', 't3_redemption_spaulders', 't3_redemption_breastplate',
    't3_redemption_girdle', 't3_redemption_legguards', 't3_redemption_boots',
    't3_redemption_wristguards', 't3_redemption_gauntlets',
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
