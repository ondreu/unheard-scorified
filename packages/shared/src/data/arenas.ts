/**
 * Statická data Aren (M7, MP PVP). Jediný zdroj pravdy pro API i web.
 *
 * MVP rozsah (rozhodnutí PM): jeden rated bracket `1v1`, sezónní ladder
 * s resetem ratingu a sezónními odměnami dle dosaženého tieru.
 *
 * Bojové vzorce a Elo matematika žijí v `../pvp.ts` (logika oddělená od dat,
 * stejně jako professions). Veškerá náhoda boje jen přes `SeededRng`.
 */

/** Rated bracket. MVP má jen 1v1; 2v2/3v3 lze přidat bez refaktoru. */
export type ArenaBracket = '1v1';

export const ARENA_BRACKETS: readonly ArenaBracket[] = ['1v1'] as const;
export const DEFAULT_BRACKET: ArenaBracket = '1v1';

export function isArenaBracket(value: string): value is ArenaBracket {
  return (ARENA_BRACKETS as readonly string[]).includes(value);
}

/** Počáteční rating každé postavy v nové sezóně. */
export const STARTING_RATING = 1500;
/** Elo K-faktor (jak rychle se rating hýbe). */
export const ELO_K_FACTOR = 32;
/** Spodní strop ratingu (nemůže klesnout pod). */
export const MIN_RATING = 0;
/** Minimální level postavy pro vstup do arény. */
export const ARENA_MIN_LEVEL = 10;

/** PVP tier (vanilla-inspired tituly). Odvozený z ratingu. */
export type ArenaTier = 'unranked' | 'combatant' | 'rival' | 'duelist' | 'gladiator';

export interface ArenaTierDef {
  tier: ArenaTier;
  name: string;
  /** Spodní hranice ratingu pro tento tier (včetně). */
  min: number;
  /** Sezónní odměna ve zlatě při dosažení tieru na konci sezóny. */
  rewardGold: number;
}

/** Tiery vzestupně dle prahu ratingu. */
export const ARENA_TIERS: readonly ArenaTierDef[] = [
  { tier: 'unranked', name: 'Unranked', min: 0, rewardGold: 0 },
  { tier: 'combatant', name: 'Combatant', min: 1400, rewardGold: 50 },
  { tier: 'rival', name: 'Rival', min: 1600, rewardGold: 200 },
  { tier: 'duelist', name: 'Duelist', min: 1800, rewardGold: 600 },
  { tier: 'gladiator', name: 'Gladiator', min: 2100, rewardGold: 1500 },
] as const;

/**
 * Sezóny ladderu. Každá sezóna má vlastní rating (reset na začátku) a na konci
 * udělí odměny dle dosaženého tieru. Časy jsou ISO UTC; aktivní sezóna se vybírá
 * deterministicky z aktuálního času (`activeSeasonAt`).
 */
export interface ArenaSeasonDef {
  id: string;
  name: string;
  /** Začátek sezóny (epoch ms odvozené z ISO). */
  startsAt: number;
  /** Konec sezóny (epoch ms). Po něm se rating archivuje a uděluje odměna. */
  endsAt: number;
}

function iso(date: string): number {
  return Date.parse(date);
}

/**
 * Definované sezóny (souvislé v čase). Jediný zdroj pravdy; přidání další sezóny
 * = jen nový záznam zde. Sezóna 1 pokrývá aktuální období.
 */
export const ARENA_SEASONS: readonly ArenaSeasonDef[] = [
  {
    id: 'season-1',
    name: 'Season 1: Proving Grounds',
    startsAt: iso('2026-01-01T00:00:00Z'),
    endsAt: iso('2026-07-01T00:00:00Z'),
  },
  {
    id: 'season-2',
    name: 'Season 2: Blood and Glory',
    startsAt: iso('2026-07-01T00:00:00Z'),
    endsAt: iso('2027-01-01T00:00:00Z'),
  },
  {
    id: 'season-3',
    name: 'Season 3: The Eternal Ladder',
    startsAt: iso('2027-01-01T00:00:00Z'),
    endsAt: iso('2030-01-01T00:00:00Z'),
  },
] as const;
