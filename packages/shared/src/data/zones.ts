/**
 * Definice zón. Zóna gateuje dostupné questy podle levelu postavy
 * (idle smyčka M2). Statická data = jediný zdroj pravdy pro API i web.
 * Balanc (level ranges) se ladí ZDE.
 */

export type ZoneId = 'northshire' | 'westfall' | 'duskwood';

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
    description: 'A peaceful starting vale where every adventurer takes their first steps.',
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
};

export const ZONE_IDS = Object.keys(ZONES) as ZoneId[];

export function isZoneId(value: string): value is ZoneId {
  return value in ZONES;
}

/** Je zóna odemčená pro daný level postavy? */
export function isZoneUnlocked(zone: ZoneId, level: number): boolean {
  return level >= ZONES[zone].minLevel;
}
