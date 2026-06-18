/**
 * Definice dungeonů (SP PVE instance, M5). Statická herní data — jediný zdroj
 * pravdy pro API i web. Balanc (HP/AP nepřátel, XP, loot) se ladí ZDE (vyladí
 * se v M9).
 *
 * Dungeon = sekvence nepřátel (`EnemyDef`: trash + boss) + odměny + odkaz na
 * boss loot tabulku (`DUNGEON_LOOT_TABLES` v `loot.ts`). Dungeony jsou PVE
 * neutrální (frakce odstraněny v MR), gated `requiredLevel` (content gating,
 * viz ADR 0008). Lore názvy jsou homebrew. Combat z `combat.ts` z nich postaví
 * `CombatActor`y.
 */
import type { EnemyStats } from '../combat';

/** Nepřítel v dungeonu (statická data → `buildEnemyActor`). */
export interface EnemyDef extends EnemyStats {
  id: string;
}

/**
 * Attunement dungeonu (M9): kromě levelu vyžaduje dokončený questline. `questAnyOf`
 * = stačí JEDEN z uvedených questů (typicky paralelní Coalition/Warband varianty).
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
  // ── Emberfire Chasm (3–5) ──────────────────────────────────────────────────
  ragefire_chasm: {
    id: 'ragefire_chasm',
    name: 'Emberfire Chasm',
    description: 'A volcanic warren beneath Karngar crawling with Ember Cult cultists.',
    requiredLevel: 3,
    // Attunement (M9): vyžaduje dokončený startovní questline (Coalition/Warband paralelně).
    attunement: { questAnyOf: ['al_ragefire_attunement', 'ho_ragefire_attunement'] },
    recommendedLevel: 5,
    baseXp: 320,
    baseGold: 25,
    goldVariance: 0.25,
    encounters: [
      enemy('rfc_cultist', 'Ember Cultist', 110, 9, 2.6),
      enemy('rfc_warlock', 'Earthborer Warlock', 130, 11, 2.8),
      enemy('rfc_taragaman', 'Tarrakal the Hungerer', 280, 14, 2.4, { armor: 40, isBoss: true }),
    ],
  },

  // ── The Drowned Mines (6–7) ──────────────────────────────────────────────────
  deadmines: {
    id: 'deadmines',
    name: 'The Drowned Mines',
    description: 'The Ashen Hand\'s hidden goblin shipyard carved into the Harrowfield cliffs.',
    requiredLevel: 6,
    attunement: { questAnyOf: ['al_dm_attune_2', 'ho_dm_attune_2'] },
    recommendedLevel: 7,
    baseXp: 760,
    baseGold: 45,
    goldVariance: 0.25,
    encounters: [
      enemy('dm_miner', 'Ashen Hand Overseer', 200, 14, 2.5),
      enemy('dm_evoker', 'Ashen Hand Evoker', 230, 17, 2.7),
      enemy('dm_rhahkzor', 'Rahkzor', 380, 20, 2.4, { armor: 60 }),
      enemy('dm_vancleef', 'Edmund Vance', 560, 24, 2.3, { armor: 80, isBoss: true }),
    ],
  },

  // ── Wailing Hollows (6–8, M12) ────────────────────────────────────────────
  wailing_caverns: {
    id: 'wailing_caverns',
    name: 'Wailing Hollows',
    description: 'A humid network of vine-choked tunnels beneath the Goldgrass Plains, where the druid Naralen dreams a nightmare into the world.',
    requiredLevel: 6,
    attunement: { questAnyOf: ['al_wc_attune_2', 'ho_wc_attune_2'] },
    recommendedLevel: 8,
    baseXp: 1050,
    baseGold: 55,
    goldVariance: 0.25,
    encounters: [
      enemy('wc_adder', 'Deviate Adder', 250, 16, 2.5),
      enemy('wc_druid', 'Fang Warden', 280, 19, 2.6),
      enemy('wc_serpent', 'Deviate Ravager', 360, 22, 2.4, { armor: 40 }),
      enemy('wc_mutanus', 'Mutanis the Devourer', 640, 27, 2.3, { armor: 60, isBoss: true }),
    ],
  },

  // ── Shadowmaw Keep (7–9) ────────────────────────────────────────────────
  shadowfang_keep: {
    id: 'shadowfang_keep',
    name: 'Shadowmaw Keep',
    description: 'A cursed fortress where Archmage Argol\'s lycan prowl the moonlit halls.',
    requiredLevel: 7,
    attunement: { questAnyOf: ['al_sfk_attune_2', 'ho_sfk_attune_2'] },
    recommendedLevel: 9,
    baseXp: 1500,
    baseGold: 70,
    goldVariance: 0.2,
    encounters: [
      enemy('sfk_worgen', 'Shadowmaw Moonwalker', 300, 20, 2.5),
      enemy('sfk_ghost', 'Tormented Officer', 340, 23, 2.6),
      enemy('sfk_fenrus', 'Fenris the Devourer', 520, 27, 2.2, { armor: 70 }),
      enemy('sfk_arugal', 'Archmage Argol', 720, 30, 2.4, { armor: 60, isBoss: true }),
    ],
  },

  // ── Drownfathom Deeps (8–10, M12) ──────────────────────────────────────────
  blackfathom_deeps: {
    id: 'blackfathom_deeps',
    name: 'Drownfathom Deeps',
    description: 'A sunken temple of the moon goddess off the Greywood coast, now a flooded lair where naga and the Duskhammer rouse the beast Akhumai.',
    requiredLevel: 8,
    attunement: { questAnyOf: ['al_bfd_attune_2', 'ho_bfd_attune_2'] },
    recommendedLevel: 10,
    baseXp: 2600,
    baseGold: 95,
    goldVariance: 0.2,
    encounters: [
      enemy('bfd_acolyte', 'Dusk Acolyte', 380, 25, 2.5),
      enemy('bfd_naga', 'Akhumai Servant', 420, 28, 2.6),
      enemy('bfd_priestess', 'Dusk Priestess', 560, 31, 2.4, { armor: 50 }),
      enemy('bfd_akumai', 'Akhumai', 880, 35, 2.3, { armor: 70, isBoss: true }),
    ],
  },

  // ── Crimson Cloister (10–13) ──────────────────────────────────────────────
  scarlet_monastery: {
    id: 'scarlet_monastery',
    name: 'Crimson Cloister',
    description: 'The fanatical Crimson Tribunal\'s stronghold, led by the zealot Herrod and High Inquisitor Palevane.',
    requiredLevel: 10,
    attunement: { questAnyOf: ['al_sm_attune_2', 'ho_sm_attune_2'] },
    recommendedLevel: 13,
    baseXp: 4200,
    baseGold: 140,
    goldVariance: 0.2,
    weeklyLockout: true,
    encounters: [
      enemy('sm_zealot', 'Crimson Zealot', 460, 30, 2.5),
      enemy('sm_monk', 'Crimson Monk', 500, 33, 2.6),
      enemy('sm_herod', 'Herrod the Champion', 820, 38, 2.2, { armor: 90 }),
      enemy('sm_whitemane', 'High Inquisitor Palevane', 1050, 42, 2.4, { armor: 70, isBoss: true }),
    ],
  },

  // ── Zarfarai (14–16, M12) ─────────────────────────────────────────────────
  zulfarrak: {
    id: 'zulfarrak',
    name: "Zarfarai",
    description: 'A Dunescale troll city baking in the Sunscar desert, where blood rituals call a serpent god from the sacred pool.',
    requiredLevel: 14,
    attunement: { questAnyOf: ['al_zf_attunement', 'ho_zf_attunement'] },
    recommendedLevel: 16,
    baseXp: 6500,
    baseGold: 200,
    goldVariance: 0.2,
    encounters: [
      enemy('zf_axethrower', 'Dunescale Axe Thrower', 560, 44, 2.5),
      enemy('zf_hoodoo', 'Dunescale Hoodoo Priest', 600, 47, 2.6),
      enemy('zf_gahzrilla', "Gazrilla", 980, 52, 2.3, { armor: 80 }),
      enemy('zf_ukorz', 'Chief Ukor Dunescalp', 1300, 56, 2.4, { armor: 90, isBoss: true }),
    ],
  },

  // ── Maradoth (15–17, M12) ───────────────────────────────────────────────────
  maraudon: {
    id: 'maraudon',
    name: 'Maradoth',
    description: 'A crystalline cavern poisoned by the union of an earth elemental and the demigod Zaethar, ruled now by their daughter Princess Theradris.',
    requiredLevel: 15,
    attunement: { questAnyOf: ['al_mar_attunement', 'ho_mar_attunement'] },
    recommendedLevel: 17,
    baseXp: 8200,
    baseGold: 250,
    goldVariance: 0.2,
    encounters: [
      enemy('mar_noxxion', 'Noxxion Spawn', 700, 50, 2.5),
      enemy('mar_treant', 'Corrupted Treant', 760, 54, 2.6),
      enemy('mar_landslide', 'Landslide', 1150, 58, 2.3, { armor: 100 }),
      enemy('mar_theradras', 'Princess Theradris', 1600, 62, 2.4, { armor: 90, isBoss: true }),
    ],
  },

  // ── Cinderdeep Halls (17–19, M12) ───────────────────────────────────────────
  blackrock_depths: {
    id: 'blackrock_depths',
    name: 'Cinderdeep Halls',
    description: 'The vast Cinderforge dwarf city deep in the mountain, where Emperor Dagran Embermane rules over forge, arena, and prison.',
    requiredLevel: 17,
    attunement: { questAnyOf: ['al_brd_attunement', 'ho_brd_attunement'] },
    recommendedLevel: 19,
    baseXp: 11000,
    baseGold: 320,
    goldVariance: 0.2,
    weeklyLockout: true,
    encounters: [
      enemy('brd_guard', 'Anvilrage Guardsman', 900, 60, 2.5, { armor: 80 }),
      enemy('brd_geologist', 'Cinderforge Geologist', 950, 64, 2.6),
      enemy('brd_angerforge', 'General Emberforge', 1500, 70, 2.3, { armor: 110 }),
      enemy('brd_thaurissan', 'Emperor Dagran Embermane', 2100, 74, 2.4, { armor: 120, isBoss: true }),
    ],
  },

  // ── Pyrehold (19–20, M12) ─────────────────────────────────────────────────
  stratholme: {
    id: 'stratholme',
    name: 'Pyrehold',
    description: 'The plagued city of Caldmoor, half claimed by the Crimson Tribunal and half by the Pale Legion under the dreadlord-served Baron Ravendere.',
    requiredLevel: 19,
    // Attunement (M12): capstone dungeon gated vlastní questline navazující na
    // frontier zóny (Blighted Marches / Witherwood).
    attunement: { questAnyOf: ['al_culling_stratholme', 'ho_culling_stratholme'] },
    recommendedLevel: 20,
    baseXp: 14500,
    baseGold: 400,
    goldVariance: 0.2,
    weeklyLockout: true,
    encounters: [
      enemy('strat_zombie', 'Plagued Zombie', 1100, 72, 2.5),
      enemy('strat_cryptfiend', 'Crypt Fiend', 1180, 76, 2.6, { armor: 70 }),
      enemy('strat_ramstein', 'Ramstein the Gorger', 1900, 82, 2.3, { armor: 120 }),
      enemy('strat_baron', 'Baron Ravendere', 2600, 88, 2.4, { armor: 130, isBoss: true }),
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
