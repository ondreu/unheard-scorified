/**
 * Definice zón. Zóna gateuje dostupné questy podle levelu postavy (idle smyčka
 * M2). Statická data = jediný zdroj pravdy pro API i web. Balanc (level ranges)
 * se ladí ZDE.
 *
 * MR (deWoWčení): frakce odstraněny — všech 8 zón je NEUTRÁLNÍCH a sdílí je
 * každá postava. Dřívější paralelní Alliance/Horda zóny se stejnými brackety teď
 * tvoří jeden společný leveling track (víc obsahu na bracket). Lore názvy se
 * narovnají na homebrew D&D v navazujícím přírůstku.
 */
export type ZoneId =
  | 'northshire'
  | 'westfall'
  | 'duskwood'
  | 'eastern_plaguelands'
  | 'durotar'
  | 'barrens'
  | 'thousand_needles'
  | 'felwood';

export interface ZoneDef {
  id: ZoneId;
  /** Anglický herní název (game language = EN). */
  name: string;
  /** Krátký flavor popis (anglicky). */
  description: string;
  /** Minimální level pro vstup do zóny (questy mají vlastní requiredLevel). */
  minLevel: number;
  /** Doporučený horní level zóny — jen pro UI hint. */
  maxLevel: number;
}

export const ZONES: Record<ZoneId, ZoneDef> = {
  northshire: {
    id: 'northshire',
    name: 'Northshire Valley',
    description: 'A peaceful starting vale where every new adventurer takes their first steps.',
    minLevel: 1,
    maxLevel: 10,
  },
  westfall: {
    id: 'westfall',
    name: 'Westfall',
    description: 'Windswept farmlands overrun by the Defias Brotherhood.',
    minLevel: 10,
    maxLevel: 25,
  },
  duskwood: {
    id: 'duskwood',
    name: 'Duskwood',
    description: 'A shadowed forest where the dead refuse to rest.',
    minLevel: 25,
    maxLevel: 40,
  },
  eastern_plaguelands: {
    id: 'eastern_plaguelands',
    name: 'Eastern Plaguelands',
    description:
      'Blighted heartlands of the fallen kingdom, where the Argent Dawn holds the line against the Scourge.',
    minLevel: 40,
    maxLevel: 60,
  },
  durotar: {
    id: 'durotar',
    name: 'Durotar',
    description: 'A harsh red desert where every wanderer proves their worth.',
    minLevel: 1,
    maxLevel: 10,
  },
  barrens: {
    id: 'barrens',
    name: 'The Barrens',
    description: 'Vast golden savanna crossed by caravans, quilboar, and roaming centaur.',
    minLevel: 10,
    maxLevel: 25,
  },
  thousand_needles: {
    id: 'thousand_needles',
    name: 'Thousand Needles',
    description: 'A canyon of towering mesas held by the Grimtotem and Galak ogres.',
    minLevel: 25,
    maxLevel: 40,
  },
  felwood: {
    id: 'felwood',
    name: 'Felwood',
    description:
      'A once-emerald forest rotted by fel corruption, prowled by Shadow Council satyrs and tainted furbolgs.',
    minLevel: 40,
    maxLevel: 60,
  },
};

export const ZONE_IDS = Object.keys(ZONES) as ZoneId[];

export function isZoneId(value: string): value is ZoneId {
  return value in ZONES;
}

/** Je zóna odemčená pro daný level postavy? */
export function isZoneUnlocked(zone: ZoneId, level: number): boolean {
  return level >= ZONES[zone].minLevel;
}

/** Všechny zóny seřazené podle minLevel (neutrální leveling track). */
export function allZones(): ZoneDef[] {
  return ZONE_IDS.map((id) => ZONES[id]).sort((a, b) => a.minLevel - b.minLevel);
}
