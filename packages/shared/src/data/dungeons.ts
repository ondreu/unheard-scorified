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

/**
 * Attunement dungeonu (M9): kromě levelu vyžaduje dokončený questline. `questAnyOf`
 * = stačí JEDEN z uvedených questů (typicky paralelní Alliance/Horde varianty).
 * Chybí ⇒ dungeon gated jen levelem (jako dosud). Mirroruje `RaidAttunement`.
 */
export interface DungeonAttunement {
  questAnyOf: string[];
}

export interface DungeonDef {
  id: string;
  /** Anglický herní název (game language = EN). */
  name: string;
  /** Flavor popis (anglicky). */
  description: string;
  /** Minimální level pro vstup (content gating). */
  requiredLevel: number;
  /** Volitelný attunement (level + dokončený questline). Chybí ⇒ jen level. */
  attunement?: DungeonAttunement;
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
  /**
   * Spadá dungeon pod **týdenní lockout** (M8.6)? Jen „vyšší" dungeony s epic
   * lootem — opakované idle farmení nezaplaví AH. Nižší dungeony zůstávají volně
   * farmitelné (idle-friendly). Chybí ⇒ false. Viz ADR 0015.
   */
  weeklyLockout?: boolean;
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
    // Attunement (M9): vyžaduje dokončený startovní questline (Alliance/Horde paralelně).
    attunement: { questAnyOf: ['al_ragefire_attunement', 'ho_ragefire_attunement'] },
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
    weeklyLockout: true,
    encounters: [
      enemy('sm_zealot', 'Scarlet Zealot', 460, 30, 2.5),
      enemy('sm_monk', 'Scarlet Monk', 500, 33, 2.6),
      enemy('sm_herod', 'Herod the Champion', 820, 38, 2.2, { armor: 90 }),
      enemy('sm_whitemane', 'High Inquisitor Whitemane', 1050, 42, 2.4, { armor: 70, isBoss: true }),
    ],
  },

  // ── Zul'Farrak (42–47, M12) ─────────────────────────────────────────────────
  zulfarrak: {
    id: 'zulfarrak',
    name: "Zul'Farrak",
    description: 'A Sandfury troll city baking in the Tanaris desert, where blood rituals call a serpent god from the sacred pool.',
    requiredLevel: 42,
    attunement: { questAnyOf: ['al_zf_attunement', 'ho_zf_attunement'] },
    recommendedLevel: 47,
    baseXp: 6500,
    baseGold: 200,
    goldVariance: 0.2,
    encounters: [
      enemy('zf_axethrower', 'Sandfury Axe Thrower', 560, 44, 2.5),
      enemy('zf_hoodoo', 'Sandfury Hoodoo Priest', 600, 47, 2.6),
      enemy('zf_gahzrilla', "Gahz'rilla", 980, 52, 2.3, { armor: 80 }),
      enemy('zf_ukorz', 'Chief Ukorz Sandscalp', 1300, 56, 2.4, { armor: 90, isBoss: true }),
    ],
  },

  // ── Maraudon (46–52, M12) ───────────────────────────────────────────────────
  maraudon: {
    id: 'maraudon',
    name: 'Maraudon',
    description: 'A crystalline cavern poisoned by the union of an earth elemental and the demigod Zaetar, ruled now by their daughter Princess Theradras.',
    requiredLevel: 46,
    attunement: { questAnyOf: ['al_mar_attunement', 'ho_mar_attunement'] },
    recommendedLevel: 52,
    baseXp: 8200,
    baseGold: 250,
    goldVariance: 0.2,
    encounters: [
      enemy('mar_noxxion', 'Noxxion Spawn', 700, 50, 2.5),
      enemy('mar_treant', 'Corrupted Treant', 760, 54, 2.6),
      enemy('mar_landslide', 'Landslide', 1150, 58, 2.3, { armor: 100 }),
      enemy('mar_theradras', 'Princess Theradras', 1600, 62, 2.4, { armor: 90, isBoss: true }),
    ],
  },

  // ── Blackrock Depths (52–58, M12) ───────────────────────────────────────────
  blackrock_depths: {
    id: 'blackrock_depths',
    name: 'Blackrock Depths',
    description: 'The vast Dark Iron dwarf city deep in the mountain, where Emperor Dagran Thaurissan rules over forge, arena, and prison.',
    requiredLevel: 52,
    attunement: { questAnyOf: ['al_brd_attunement', 'ho_brd_attunement'] },
    recommendedLevel: 58,
    baseXp: 11000,
    baseGold: 320,
    goldVariance: 0.2,
    weeklyLockout: true,
    encounters: [
      enemy('brd_guard', 'Anvilrage Guardsman', 900, 60, 2.5, { armor: 80 }),
      enemy('brd_geologist', 'Dark Iron Geologist', 950, 64, 2.6),
      enemy('brd_angerforge', 'General Angerforge', 1500, 70, 2.3, { armor: 110 }),
      enemy('brd_thaurissan', 'Emperor Dagran Thaurissan', 2100, 74, 2.4, { armor: 120, isBoss: true }),
    ],
  },

  // ── Stratholme (58–60, M12) ─────────────────────────────────────────────────
  stratholme: {
    id: 'stratholme',
    name: 'Stratholme',
    description: 'The plagued city of Lordaeron, half claimed by the Scarlet Crusade and half by the Scourge under the dreadlord-served Baron Rivendare.',
    requiredLevel: 58,
    // Attunement (M12): capstone dungeon gated vlastní questline navazující na
    // frontier zóny (Eastern Plaguelands / Felwood).
    attunement: { questAnyOf: ['al_culling_stratholme', 'ho_culling_stratholme'] },
    recommendedLevel: 60,
    baseXp: 14500,
    baseGold: 400,
    goldVariance: 0.2,
    weeklyLockout: true,
    encounters: [
      enemy('strat_zombie', 'Plagued Zombie', 1100, 72, 2.5),
      enemy('strat_cryptfiend', 'Crypt Fiend', 1180, 76, 2.6, { armor: 70 }),
      enemy('strat_ramstein', 'Ramstein the Gorger', 1900, 82, 2.3, { armor: 120 }),
      enemy('strat_baron', 'Baron Rivendare', 2600, 88, 2.4, { armor: 130, isBoss: true }),
    ],
  },
};

export const DUNGEON_IDS = Object.keys(DUNGEONS);

export function isDungeonId(value: string): value is string {
  return value in DUNGEONS;
}

/** Je dungeon odemčený pro daný level postavy? */
export function isDungeonUnlocked(
  dungeonId: string,
  level: number,
  completedQuestIds: ReadonlySet<string> | readonly string[] = [],
): boolean {
  const dungeon = DUNGEONS[dungeonId];
  if (dungeon === undefined) return false;
  if (level < dungeon.requiredLevel) return false;
  const att = dungeon.attunement;
  if (att && att.questAnyOf.length > 0) {
    const completed =
      completedQuestIds instanceof Set ? completedQuestIds : new Set(completedQuestIds);
    if (!att.questAnyOf.some((q) => completed.has(q))) return false;
  }
  return true;
}

/** Má dungeon attunement (questline gate nad rámec levelu)? */
export function dungeonAttunementQuests(dungeonId: string): string[] {
  return DUNGEONS[dungeonId]?.attunement?.questAnyOf ?? [];
}

/** Dungeony dostupné pro daný level (seřazené dle requiredLevel). */
export function availableDungeons(level: number): DungeonDef[] {
  return DUNGEON_IDS.map((id) => DUNGEONS[id]!)
    .filter((d) => level >= d.requiredLevel)
    .sort((a, b) => a.requiredLevel - b.requiredLevel);
}
