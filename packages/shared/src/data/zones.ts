/**
 * Definice zón. Zóna gateuje dostupné questy podle levelu a FRAKCE postavy
 * (idle smyčka M2). Statická data = jediný zdroj pravdy pro API i web.
 * Balanc (level ranges) se ladí ZDE.
 *
 * Frakce je zatím kosmetická (viz ADR 0003): aliance i horda mají PARALELNÍ
 * zóny se stejnými level brackety a odměnami — liší se jen lore/názvy a tím,
 * kterou sadu která frakce vidí. Žádný herní (power) rozdíl mezi frakcemi.
 */
import type { Faction } from './races';

export type ZoneId =
  // Alliance
  | 'northshire'
  | 'westfall'
  | 'duskwood'
  | 'eastern_plaguelands'
  // Horde
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
  /** Frakce, které zóna patří (kosmetické — lore/vizuál). */
  faction: Faction;
  /** Minimální level pro vstup do zóny (questy mají vlastní requiredLevel). */
  minLevel: number;
  /** Doporučený horní level zóny — jen pro UI hint. */
  maxLevel: number;
}

export const ZONES: Record<ZoneId, ZoneDef> = {
  // ── Alliance ─────────────────────────────────────────────────────────────
  northshire: {
    id: 'northshire',
    name: 'Northshire Valley',
    description: 'A peaceful starting vale where every Alliance recruit takes their first steps.',
    faction: 'alliance',
    minLevel: 1,
    maxLevel: 10,
  },
  westfall: {
    id: 'westfall',
    name: 'Westfall',
    description: 'Windswept farmlands overrun by the Defias Brotherhood.',
    faction: 'alliance',
    minLevel: 10,
    maxLevel: 25,
  },
  duskwood: {
    id: 'duskwood',
    name: 'Duskwood',
    description: 'A shadowed forest where the dead refuse to rest.',
    faction: 'alliance',
    minLevel: 25,
    maxLevel: 40,
  },
  eastern_plaguelands: {
    id: 'eastern_plaguelands',
    name: 'Eastern Plaguelands',
    description:
      'Blighted heartlands of the fallen kingdom, where the Argent Dawn holds the line against the Scourge.',
    faction: 'alliance',
    minLevel: 40,
    maxLevel: 60,
  },

  // ── Horde ────────────────────────────────────────────────────────────────
  durotar: {
    id: 'durotar',
    name: 'Durotar',
    description: 'A harsh red desert where every Horde recruit proves their worth.',
    faction: 'horde',
    minLevel: 1,
    maxLevel: 10,
  },
  barrens: {
    id: 'barrens',
    name: 'The Barrens',
    description: 'Vast golden savanna crossed by caravans, quilboar, and roaming centaur.',
    faction: 'horde',
    minLevel: 10,
    maxLevel: 25,
  },
  thousand_needles: {
    id: 'thousand_needles',
    name: 'Thousand Needles',
    description: 'A canyon of towering mesas held by the Grimtotem and Galak ogres.',
    faction: 'horde',
    minLevel: 25,
    maxLevel: 40,
  },
  felwood: {
    id: 'felwood',
    name: 'Felwood',
    description:
      'A once-emerald forest rotted by fel corruption, prowled by Shadow Council satyrs and tainted furbolgs.',
    faction: 'horde',
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

/** Zóny dané frakce (kosmetické dělení). */
export function zonesForFaction(faction: Faction): ZoneDef[] {
  return ZONE_IDS.map((id) => ZONES[id]).filter((z) => z.faction === faction);
}
