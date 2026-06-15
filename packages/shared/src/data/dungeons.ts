/**
 * Definice dungeonů (SP PVE instance, M5). Statická herní data — jediný zdroj
 * pravdy pro API i web. Balanc (HP/AP nepřátel, XP, loot) se ladí ZDE (vyladí
 * se v M9).
 *
 * Dungeon = sekvence nepřátel (`EnemyDef`: trash + boss) + odměny + odkaz na
 * boss loot tabulku (`DUNGEON_LOOT_TABLES` v `loot.ts`). Dungeony jsou PVE
 * neutrální (obě frakce vidí stejnou sadu), gated `requiredLevel` (content
 * gating, viz ADR 0008). Combat z `combat.ts` z nich postaví `CombatActor`y.
 */
import type { EnemyStats } from '../combat';

/** Nepřítel v dungeonu (statická data → `buildEnemyActor`). */
export interface EnemyDef extends EnemyStats {
  id: string;
}

export interface DungeonDef {
  id: string;
  /** Anglický herní název (game language = EN). */
  name: string;
  /** Flavor popis (anglicky). */
  description: string;
  /** Minimální level pro vstup (content gating). */
  requiredLevel: number;
  /** Doporučený horní level (jen UI hint). */
  recommendedLevel: number;
  /** Sekvence nepřátel: trash → boss (poslední je obvykle `isBoss`). */
  encounters: EnemyDef[];
  /** Základní XP odměna za vyčištění (fixní). */
  baseXp: number;
  /** Základní zlato (rolluje se s variancí přes SeededRng). */
  baseGold: number;
  /** Variance zlata (0..1). */
  goldVariance: number;
}

function enemy(
  id: string,
  name: string,
  maxHealth: number,
  attackPower: number,
  swingInterval: number,
  opts: { armor?: number; isBoss?: boolean } = {},
): EnemyDef {
  return { id, name, maxHealth, attackPower, swingInterval, ...opts };
}

export const DUNGEONS: Record<string, DungeonDef> = {
  // ── Ragefire Chasm (8–13) ──────────────────────────────────────────────────
  ragefire_chasm: {
    id: 'ragefire_chasm',
    name: 'Ragefire Chasm',
    description: 'A volcanic warren beneath Orgrimmar crawling with Searing Blade cultists.',
    requiredLevel: 8,
    recommendedLevel: 13,
    baseXp: 320,
    baseGold: 25,
    goldVariance: 0.25,
    encounters: [
      enemy('rfc_cultist', 'Searing Blade Cultist', 110, 9, 2.6),
      enemy('rfc_warlock', 'Earthborer Warlock', 130, 11, 2.8),
      enemy('rfc_taragaman', 'Taragaman the Hungerer', 280, 14, 2.4, { armor: 40, isBoss: true }),
    ],
  },

  // ── The Deadmines (15–20) ──────────────────────────────────────────────────
  deadmines: {
    id: 'deadmines',
    name: 'The Deadmines',
    description: 'The Defias Brotherhood\'s hidden goblin shipyard carved into the Westfall cliffs.',
    requiredLevel: 15,
    recommendedLevel: 20,
    baseXp: 760,
    baseGold: 45,
    goldVariance: 0.25,
    encounters: [
      enemy('dm_miner', 'Defias Overseer', 200, 14, 2.5),
      enemy('dm_evoker', 'Defias Evoker', 230, 17, 2.7),
      enemy('dm_rhahkzor', 'Rhahk\'Zor', 380, 20, 2.4, { armor: 60 }),
      enemy('dm_vancleef', 'Edwin VanCleef', 560, 24, 2.3, { armor: 80, isBoss: true }),
    ],
  },

  // ── Shadowfang Keep (20–26) ────────────────────────────────────────────────
  shadowfang_keep: {
    id: 'shadowfang_keep',
    name: 'Shadowfang Keep',
    description: 'A cursed fortress where Archmage Arugal\'s worgen prowl the moonlit halls.',
    requiredLevel: 20,
    recommendedLevel: 26,
    baseXp: 1500,
    baseGold: 70,
    goldVariance: 0.2,
    encounters: [
      enemy('sfk_worgen', 'Shadowfang Moonwalker', 300, 20, 2.5),
      enemy('sfk_ghost', 'Tormented Officer', 340, 23, 2.6),
      enemy('sfk_fenrus', 'Fenrus the Devourer', 520, 27, 2.2, { armor: 70 }),
      enemy('sfk_arugal', 'Archmage Arugal', 720, 30, 2.4, { armor: 60, isBoss: true }),
    ],
  },

  // ── Scarlet Monastery (30–38) ──────────────────────────────────────────────
  scarlet_monastery: {
    id: 'scarlet_monastery',
    name: 'Scarlet Monastery',
    description: 'The fanatical Scarlet Crusade\'s stronghold, led by the zealot Herod and High Inquisitor Whitemane.',
    requiredLevel: 30,
    recommendedLevel: 38,
    baseXp: 4200,
    baseGold: 140,
    goldVariance: 0.2,
    encounters: [
      enemy('sm_zealot', 'Scarlet Zealot', 460, 30, 2.5),
      enemy('sm_monk', 'Scarlet Monk', 500, 33, 2.6),
      enemy('sm_herod', 'Herod the Champion', 820, 38, 2.2, { armor: 90 }),
      enemy('sm_whitemane', 'High Inquisitor Whitemane', 1050, 42, 2.4, { armor: 70, isBoss: true }),
    ],
  },
};

export const DUNGEON_IDS = Object.keys(DUNGEONS);

export function isDungeonId(value: string): value is string {
  return value in DUNGEONS;
}

/** Je dungeon odemčený pro daný level postavy? */
export function isDungeonUnlocked(dungeonId: string, level: number): boolean {
  const dungeon = DUNGEONS[dungeonId];
  return dungeon !== undefined && level >= dungeon.requiredLevel;
}

/** Dungeony dostupné pro daný level (seřazené dle requiredLevel). */
export function availableDungeons(level: number): DungeonDef[] {
  return DUNGEON_IDS.map((id) => DUNGEONS[id]!)
    .filter((d) => level >= d.requiredLevel)
    .sort((a, b) => a.requiredLevel - b.requiredLevel);
}
