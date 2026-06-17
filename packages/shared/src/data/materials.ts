/**
 * Materiály (gathering output) a spotřebáky (alchemy output) — M6.
 *
 * Materiály a spotřebáky žijí ve stejné tabulce `character_inventory` jako gear
 * (jen `itemId` + `quantity`), ale NEJSOU equipovatelné (nemají slot). Equipment
 * katalog (`ITEMS`) zůstává oddělený; tady jsou ne-equip „věci".
 *
 * Jediný zdroj pravdy pro API i web.
 */
import type { ItemRarity, ItemStats } from './items';

export type MaterialId =
  | 'copper_ore'
  | 'iron_ore'
  | 'mithril_ore'
  | 'silver_ore'
  | 'peacebloom'
  | 'briarthorn'
  | 'goldthorn'
  | 'swiftthistle'
  | 'light_leather'
  | 'medium_leather'
  | 'heavy_leather';

export type MaterialKind = 'ore' | 'herb' | 'leather';

export interface MaterialDef {
  id: MaterialId;
  name: string;
  kind: MaterialKind;
  rarity: ItemRarity;
  /** Tier obsahu (1–3), zhruba odpovídá profession skill bracketu. */
  tier: number;
  /** Prodejní cena u vendora (M8). */
  vendorGold: number;
}

export const MATERIALS: Record<MaterialId, MaterialDef> = {
  // --- Ores (mining) ---
  copper_ore: { id: 'copper_ore', name: 'Copper Ore', kind: 'ore', rarity: 'common', tier: 1, vendorGold: 1 },
  iron_ore: { id: 'iron_ore', name: 'Iron Ore', kind: 'ore', rarity: 'common', tier: 2, vendorGold: 3 },
  mithril_ore: { id: 'mithril_ore', name: 'Mithril Ore', kind: 'ore', rarity: 'uncommon', tier: 3, vendorGold: 6 },
  silver_ore: { id: 'silver_ore', name: 'Silver Ore', kind: 'ore', rarity: 'rare', tier: 3, vendorGold: 12 },
  // --- Herbs (herbalism) ---
  peacebloom: { id: 'peacebloom', name: 'Peacebloom', kind: 'herb', rarity: 'common', tier: 1, vendorGold: 1 },
  briarthorn: { id: 'briarthorn', name: 'Briarthorn', kind: 'herb', rarity: 'common', tier: 2, vendorGold: 3 },
  goldthorn: { id: 'goldthorn', name: 'Goldthorn', kind: 'herb', rarity: 'uncommon', tier: 3, vendorGold: 6 },
  swiftthistle: { id: 'swiftthistle', name: 'Swiftthistle', kind: 'herb', rarity: 'rare', tier: 3, vendorGold: 12 },
  // --- Leather (skinning) ---
  light_leather: { id: 'light_leather', name: 'Light Leather', kind: 'leather', rarity: 'common', tier: 1, vendorGold: 2 },
  medium_leather: { id: 'medium_leather', name: 'Medium Leather', kind: 'leather', rarity: 'common', tier: 2, vendorGold: 4 },
  heavy_leather: { id: 'heavy_leather', name: 'Heavy Leather', kind: 'leather', rarity: 'uncommon', tier: 3, vendorGold: 8 },
};

export type ConsumableId =
  | 'minor_healing_potion'
  | 'healing_potion'
  | 'superior_healing_potion'
  | 'elixir_of_strength';

export interface ConsumableDef {
  id: ConsumableId;
  name: string;
  rarity: ItemRarity;
  tier: number;
  /** Popis efektu (UI). Mechanika „use" → timed buff (`CONSUMABLE_BUFFS`). */
  effect: string;
  vendorGold: number;
}

export const CONSUMABLES: Record<ConsumableId, ConsumableDef> = {
  minor_healing_potion: {
    id: 'minor_healing_potion', name: 'Minor Healing Potion', rarity: 'common', tier: 1,
    effect: 'Bolsters vitality (+Stamina) for 10 minutes.', vendorGold: 2,
  },
  healing_potion: {
    id: 'healing_potion', name: 'Healing Potion', rarity: 'uncommon', tier: 2,
    effect: 'Bolsters vitality (+Stamina) for 15 minutes.', vendorGold: 5,
  },
  superior_healing_potion: {
    id: 'superior_healing_potion', name: 'Superior Healing Potion', rarity: 'rare', tier: 3,
    effect: 'Bolsters vitality (+Stamina) for 20 minutes.', vendorGold: 10,
  },
  elixir_of_strength: {
    id: 'elixir_of_strength', name: 'Elixir of Strength', rarity: 'epic', tier: 3,
    effect: 'Grants a potent Strength buff for 30 minutes.', vendorGold: 25,
  },
};

/**
 * Efekt „use" spotřebáku (M10) — **dočasný stat buff** s expirací. Idle hra:
 * vypij lektvar před vysláním na aktivitu/dungeon/raid/arénu → buff se po dobu
 * trvání přičte do bojového profilu (přes `getEquipmentStats`). Jeden stack na
 * spotřebák; opětovné použití expiraci obnoví (refresh, ne stacking). Staty
 * sdílí `ItemStats` (stejný systém jako gear) → žádná nová combat mechanika.
 */
export interface ConsumableBuff {
  /** Bonusové staty po dobu trvání. */
  stats: ItemStats;
  /** Délka trvání v sekundách. */
  durationSec: number;
}

export const CONSUMABLE_BUFFS: Record<ConsumableId, ConsumableBuff> = {
  minor_healing_potion: { stats: { stamina: 6 }, durationSec: 600 },
  healing_potion: { stats: { stamina: 12 }, durationSec: 900 },
  superior_healing_potion: { stats: { stamina: 20 }, durationSec: 1200 },
  elixir_of_strength: { stats: { strength: 15 }, durationSec: 1800 },
};

export function isMaterialId(value: string): value is MaterialId {
  return value in MATERIALS;
}

export function isConsumableId(value: string): value is ConsumableId {
  return value in CONSUMABLES;
}

/** Buff efekt spotřebáku (M10); neznámý ⇒ undefined. */
export function consumableBuff(id: string): ConsumableBuff | undefined {
  return isConsumableId(id) ? CONSUMABLE_BUFFS[id] : undefined;
}
