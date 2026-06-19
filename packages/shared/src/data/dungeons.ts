/**
 * Definice dungeonů (SP PVE instance, M5). Statická herní data — jediný zdroj
 * pravdy pro API i web. Balanc (HP/AP nepřátel, XP, loot) se ladí ZDE.
 *
 * Dungeon = **sekvence encounterů** (`EncounterDef`), kde každý encounter je
 * **skupina nepřátel** bojovaná naráz (`EnemyDef[]`) — trash packy (2–3 nepřátelé),
 * sólo bossové i boss+adds. Tým fokusuje cíle, nepřátelé útočí na tanka/threat.
 * Trash v packu jsou „oslabení minioni" (nižší efektivní level → nižší CR HP/dmg),
 * aby byl pack férový i pro at-level solo idle (dungeon overhaul, ADR 0037).
 *
 * Dungeony jsou PVE neutrální (frakce odstraněny v MR), gated `requiredLevel`
 * (content gating, viz ADR 0008). Lore názvy jsou homebrew. Combat z `combat.ts`
 * z nich postaví `CombatActor`y (`buildEnemyActor` per nepřítel).
 */
import type { EnemyStats } from '../combat';

/** Nepřítel v dungeonu (statická data → `buildEnemyActor`). */
export interface EnemyDef extends EnemyStats {
  id: string;
}

/**
 * Jeden encounter dungeonu = **skupina nepřátel** bojovaná naráz (dungeon
 * overhaul, ADR 0037). Většinou trash pack (2–3) nebo boss (případně boss+adds).
 * Pořadí ve `enemies` je jen kosmetické (engine cílí dle HP/threat); boss-flag
 * drží `EnemyDef.isBoss`.
 */
export interface EncounterDef {
  id: string;
  /** Nepřátelé ve skupině (1..N), bojovaní naráz. */
  enemies: EnemyDef[];
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
  /** Sekvence encounterů (skupin nepřátel): trash packy → boss (poslední). */
  encounters: EncounterDef[];
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

/** Volitelné staty nepřítele nad rámec pozičních argumentů (`enemy`). */
type EnemyOpts = Partial<
  Pick<
    EnemyStats,
    | 'armor'
    | 'isBoss'
    | 'damageType'
    | 'resistances'
    | 'vulnerabilities'
    | 'immunities'
    | 'level'
    | 'challengeRating'
  >
>;

// HP/poškození se NEzadávají ručně — odvodí je `buildEnemyActor` z Challenge
// Ratingu (`crEnemyMagnitude`, ADR 0032). CR plyne z `level`/`challengeRating`
// (per-nepřítel doladění), jinak z `dungeon.requiredLevel` (+boss flag).
function enemy(
  id: string,
  name: string,
  swingInterval: number,
  opts: EnemyOpts = {},
): EnemyDef {
  return { id, name, swingInterval, ...opts };
}

/** Encounter (skupina nepřátel bojovaná naráz). */
function pack(id: string, ...enemies: EnemyDef[]): EncounterDef {
  return { id, enemies };
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
      pack(
        'rfc_e1',
        enemy('rfc_cultist', 'Ember Cultist', 2.6),
        enemy('rfc_cultist_b', 'Ember Acolyte', 2.6, { level: 1 }),
      ),
      pack('rfc_e2', enemy('rfc_warlock', 'Earthborer Warlock', 2.8)),
      pack('rfc_e3', enemy('rfc_taragaman', 'Tarrakal the Hungerer', 2.4, { armor: 40, isBoss: true })),
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
      pack(
        'dm_e1',
        enemy('dm_miner', 'Ashen Hand Overseer', 2.5),
        enemy('dm_miner_b', 'Ashen Hand Digger', 2.5, { level: 4 }),
      ),
      pack('dm_e2', enemy('dm_evoker', 'Ashen Hand Evoker', 2.7)),
      pack('dm_e3', enemy('dm_rhahkzor', 'Rahkzor', 2.4, { armor: 60 })),
      // Boss + add: VanCleef nastoupí s posledním kopáčem.
      pack(
        'dm_e4',
        enemy('dm_vancleef', 'Edmund Vance', 2.3, { armor: 80, isBoss: true }),
        enemy('dm_miner_c', 'Ashen Hand Digger', 2.5, { level: 4 }),
      ),
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
      pack(
        'wc_e1',
        enemy('wc_adder', 'Deviate Adder', 2.5),
        enemy('wc_adder_b', 'Deviate Hatchling', 2.5, { level: 4 }),
      ),
      pack('wc_e2', enemy('wc_druid', 'Fang Warden', 2.6)),
      pack('wc_e3', enemy('wc_serpent', 'Deviate Ravager', 2.4, { armor: 40 })),
      pack('wc_e4', enemy('wc_mutanus', 'Mutanis the Devourer', 2.3, { armor: 60, isBoss: true })),
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
      pack(
        'sfk_e1',
        enemy('sfk_worgen', 'Shadowmaw Moonwalker', 2.5),
        enemy('sfk_worgen_b', 'Shadowmaw Whelp', 2.5, { level: 5 }),
      ),
      pack('sfk_e2', enemy('sfk_ghost', 'Tormented Officer', 2.6)),
      pack('sfk_e3', enemy('sfk_fenrus', 'Fenris the Devourer', 2.2, { armor: 70 })),
      pack('sfk_e4', enemy('sfk_arugal', 'Archmage Argol', 2.4, { armor: 60, isBoss: true })),
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
      pack(
        'bfd_e1',
        enemy('bfd_acolyte', 'Dusk Acolyte', 2.5),
        enemy('bfd_naga', 'Akhumai Servant', 2.6),
      ),
      pack('bfd_e2', enemy('bfd_priestess', 'Dusk Priestess', 2.4, { armor: 50 })),
      pack('bfd_e3', enemy('bfd_akumai', 'Akhumai', 2.3, { armor: 70, isBoss: true })),
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
      pack(
        'sm_e1',
        enemy('sm_zealot', 'Crimson Zealot', 2.5),
        enemy('sm_monk', 'Crimson Monk', 2.6),
      ),
      pack('sm_e2', enemy('sm_herod', 'Herrod the Champion', 2.2, { armor: 90 })),
      // Boss + add: Palevane sesílá s posledním zealotem.
      pack(
        'sm_e3',
        enemy('sm_whitemane', 'High Inquisitor Palevane', 2.4, { armor: 70, isBoss: true }),
        enemy('sm_zealot_b', 'Crimson Zealot', 2.5, { level: 8 }),
      ),
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
    // Bestiář (MR-10d): trollí hoodoo = nekrotická magie, hadí bůh = jed; krvavý
    // chief je zranitelný radiant (holy smite). Aktivuje typové obrany (MR-7/10b).
    encounters: [
      pack(
        'zf_e1',
        enemy('zf_axethrower', 'Dunescale Axe Thrower', 2.5, { damageType: 'slashing' }),
        enemy('zf_axethrower_b', 'Dunescale Brave', 2.5, { level: 12, damageType: 'slashing' }),
      ),
      pack('zf_e2', enemy('zf_hoodoo', 'Dunescale Hoodoo Priest', 2.6, {
        damageType: 'necrotic',
        resistances: ['necrotic'],
      })),
      pack('zf_e3', enemy('zf_gahzrilla', 'Gazrilla', 2.3, {
        armor: 80,
        damageType: 'poison',
        resistances: ['poison'],
      })),
      pack('zf_e4', enemy('zf_ukorz', 'Chief Ukor Dunescalp', 2.4, {
        armor: 90,
        isBoss: true,
        damageType: 'slashing',
        vulnerabilities: ['radiant'],
      })),
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
    // Bestiář (MR-10d): nature/earth téma — treant i elementál odolávají fyzickému
    // poškození (martiali si škrtnou), ale hoří (caster fire excels). „Bring a caster."
    encounters: [
      pack(
        'mar_e1',
        enemy('mar_noxxion', 'Noxxion Spawn', 2.5, {
          damageType: 'poison',
          resistances: ['poison'],
          vulnerabilities: ['fire'],
        }),
        enemy('mar_noxxion_b', 'Noxxion Spawnling', 2.5, {
          level: 13,
          damageType: 'poison',
          resistances: ['poison'],
          vulnerabilities: ['fire'],
        }),
      ),
      pack('mar_e2', enemy('mar_treant', 'Corrupted Treant', 2.6, {
        damageType: 'bludgeoning',
        resistances: ['bludgeoning', 'piercing'],
        vulnerabilities: ['fire'],
      })),
      pack('mar_e3', enemy('mar_landslide', 'Landslide', 2.3, {
        armor: 100,
        damageType: 'bludgeoning',
        resistances: ['slashing', 'piercing', 'bludgeoning'],
      })),
      pack('mar_e4', enemy('mar_theradras', 'Princess Theradris', 2.4, {
        armor: 90,
        isBoss: true,
        damageType: 'poison',
        vulnerabilities: ['fire'],
      })),
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
    // Bestiář (MR-10d): forge/fire téma — obyvatelé jsou žárovzdorní (resist fire),
    // takže fire casteři tu nezáří; martiali a ostatní normálně.
    encounters: [
      pack(
        'brd_e1',
        enemy('brd_guard', 'Anvilrage Guardsman', 2.5, { armor: 80, damageType: 'slashing' }),
        enemy('brd_guard_b', 'Anvilrage Footman', 2.5, { level: 15, armor: 60, damageType: 'slashing' }),
      ),
      pack('brd_e2', enemy('brd_geologist', 'Cinderforge Geologist', 2.6, {
        damageType: 'bludgeoning',
        resistances: ['fire'],
      })),
      pack('brd_e3', enemy('brd_angerforge', 'General Emberforge', 2.3, {
        armor: 110,
        damageType: 'fire',
        resistances: ['fire'],
      })),
      pack('brd_e4', enemy('brd_thaurissan', 'Emperor Dagran Embermane', 2.4, {
        armor: 120,
        isBoss: true,
        damageType: 'fire',
        resistances: ['fire'],
      })),
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
    // Bestiář (MR-10d): undead capstone — vše zranitelné radiant (immune jedu,
    // resist nekrotice). Holy classy (Cleric/Paladin = radiant) tu DOMINUJÍ; dreadlord
    // Baron navíc odolá ohni (fiend). Vrchol „class counter" identity 14–20.
    encounters: [
      pack(
        'strat_e1',
        enemy('strat_zombie', 'Plagued Zombie', 2.5, {
          damageType: 'necrotic',
          resistances: ['necrotic'],
          immunities: ['poison'],
          vulnerabilities: ['radiant'],
        }),
        enemy('strat_zombie_b', 'Plagued Ghoul', 2.5, {
          level: 17,
          damageType: 'necrotic',
          resistances: ['necrotic'],
          immunities: ['poison'],
          vulnerabilities: ['radiant'],
        }),
      ),
      pack('strat_e2', enemy('strat_cryptfiend', 'Crypt Fiend', 2.6, {
        armor: 70,
        damageType: 'piercing',
        resistances: ['necrotic'],
        vulnerabilities: ['radiant'],
      })),
      pack('strat_e3', enemy('strat_ramstein', 'Ramstein the Gorger', 2.3, {
        armor: 120,
        damageType: 'bludgeoning',
        resistances: ['necrotic'],
        vulnerabilities: ['radiant', 'fire'],
      })),
      pack('strat_e4', enemy('strat_baron', 'Baron Ravendere', 2.4, {
        armor: 130,
        isBoss: true,
        damageType: 'necrotic',
        resistances: ['necrotic', 'fire'],
        vulnerabilities: ['radiant'],
      })),
    ],
  },
};

export const DUNGEON_IDS = Object.keys(DUNGEONS);

export function isDungeonId(value: string): value is string {
  return value in DUNGEONS;
}

/** Všichni nepřátelé dungeonu napříč encountery (ploché pole). */
export function dungeonEnemies(dungeon: DungeonDef): EnemyDef[] {
  return dungeon.encounters.flatMap((e) => e.enemies);
}

/**
 * „Boss" dungeonu pro UI/label = boss-flagnutý nepřítel posledního encounteru
 * (fallback poslední nepřítel poslední skupiny). `undefined`, pokud dungeon nemá
 * encountery.
 */
export function dungeonBoss(dungeon: DungeonDef): EnemyDef | undefined {
  const last = dungeon.encounters.at(-1);
  if (!last) return undefined;
  return last.enemies.find((e) => e.isBoss) ?? last.enemies.at(-1);
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
