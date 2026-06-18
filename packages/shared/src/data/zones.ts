/**
 * Definice zón. Zóna gateuje dostupné questy podle levelu postavy (idle smyčka
 * M2). Statická data = jediný zdroj pravdy pro API i web. Balanc (level ranges)
 * se ladí ZDE.
 *
 * MR (deWoWčení): frakce odstraněny — všech 8 zón je NEUTRÁLNÍCH a sdílí je
 * každá postava. Dřívější paralelní Alliance/Horda zóny se stejnými brackety teď
 * tvoří jeden společný leveling track (víc obsahu na bracket). Lore názvy jsou
 * homebrew (setting „The Caldmoor Reaches") — engine/ids beze změny, jen texty.
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
    name: 'Dawnhollow Vale',
    description: 'A peaceful starting vale where every new adventurer takes their first steps.',
    minLevel: 1,
    maxLevel: 10,
  },
  westfall: {
    id: 'westfall',
    name: 'Harrowfield',
    description: 'Windswept farmlands overrun by the Ashen Hand.',
    minLevel: 10,
    maxLevel: 25,
  },
  duskwood: {
    id: 'duskwood',
    name: 'Gloamwood',
    description: 'A shadowed forest where the dead refuse to rest.',
    minLevel: 25,
    maxLevel: 40,
  },
  eastern_plaguelands: {
    id: 'eastern_plaguelands',
    name: 'Blighted Marches',
    description:
      'Blighted heartlands of the fallen kingdom, where the Dawnward Order holds the line against the Pale Legion.',
    minLevel: 40,
    maxLevel: 60,
  },
  durotar: {
    id: 'durotar',
    name: 'Emberwaste',
    description: 'A harsh red desert where every wanderer proves their worth.',
    minLevel: 1,
    maxLevel: 10,
  },
  barrens: {
    id: 'barrens',
    name: 'The Goldgrass Plains',
    description: 'Vast golden savanna crossed by caravans, boarkin, and roaming centaur.',
    minLevel: 10,
    maxLevel: 25,
  },
  thousand_needles: {
    id: 'thousand_needles',
    name: 'Spire Canyons',
    description: 'A canyon of towering mesas held by the Greyhorn and Galuk ogres.',
    minLevel: 25,
    maxLevel: 40,
  },
  felwood: {
    id: 'felwood',
    name: 'Witherwood',
    description:
      'A once-emerald forest rotted by blight corruption, prowled by Duskcabal satyrs and tainted furbolgs.',
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
