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
import { instantiateEnemy, type EnemyInstanceOverrides } from './enemies';

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

/**
 * Kontextové přepisy dungeon nepřítele nad rámec šablony katalogu. Identita
 * (jméno, typ útoku, obrany, creatureType) plyne z katalogu (`enemies.ts`,
 * ADR 0043); tady řešíme jen magnitudu/pacing instance (armor, oslabený minion
 * přes `level`/`name`, boss flag, variantní `id`). Typové obrany se NEpíšou ZDE —
 * žijí ve šabloně.
 */
type EnemyOpts = Pick<
  EnemyInstanceOverrides,
  'id' | 'name' | 'armor' | 'isBoss' | 'level' | 'challengeRating'
>;

// Instancuje dungeon nepřítele z katalogu (jediný zdroj pravdy enemy identity).
// HP/poškození se NEzadávají — odvodí je `buildEnemyActor` z Challenge Ratingu
// (`crEnemyMagnitude`, ADR 0032), kde CR plyne z `level` (per-nepřítel doladění),
// jinak z `dungeon.requiredLevel` (+boss flag) v `group.ts`/dungeon enginu.
function e(templateId: string, swingInterval: number, opts: EnemyOpts = {}): EnemyDef {
  return instantiateEnemy(templateId, { swingInterval, ...opts });
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
        e('rfc_cultist', 2.6),
        e('rfc_cultist', 2.6, { id: 'rfc_cultist_b', name: 'Ember Acolyte', level: 1 }),
      ),
      pack('rfc_e2', e('rfc_warlock', 2.8)),
      pack('rfc_e3', e('rfc_taragaman', 2.4, { armor: 40, isBoss: true })),
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
        e('dm_miner', 2.5),
        e('dm_miner', 2.5, { id: 'dm_miner_b', name: 'Ashen Hand Digger', level: 4 }),
      ),
      pack('dm_e2', e('dm_evoker', 2.7)),
      pack('dm_e3', e('dm_rhahkzor', 2.4, { armor: 60 })),
      // Boss + add: VanCleef nastoupí s posledním kopáčem.
      pack(
        'dm_e4',
        e('dm_vancleef', 2.3, { armor: 80, isBoss: true }),
        e('dm_miner', 2.5, { id: 'dm_miner_c', name: 'Ashen Hand Digger', level: 4 }),
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
        e('wc_adder', 2.5),
        e('wc_adder', 2.5, { id: 'wc_adder_b', name: 'Deviate Hatchling', level: 4 }),
      ),
      pack('wc_e2', e('wc_druid', 2.6)),
      pack('wc_e3', e('wc_serpent', 2.4, { armor: 40 })),
      pack('wc_e4', e('wc_mutanus', 2.3, { armor: 60, isBoss: true })),
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
        e('sfk_worgen', 2.5),
        e('sfk_worgen', 2.5, { id: 'sfk_worgen_b', name: 'Shadowmaw Whelp', level: 5 }),
      ),
      pack('sfk_e2', e('sfk_ghost', 2.6)),
      pack('sfk_e3', e('sfk_fenrus', 2.2, { armor: 70 })),
      pack('sfk_e4', e('sfk_arugal', 2.4, { armor: 60, isBoss: true })),
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
        e('bfd_acolyte', 2.5),
        e('bfd_naga', 2.6),
      ),
      pack('bfd_e2', e('bfd_priestess', 2.4, { armor: 50 })),
      pack('bfd_e3', e('bfd_akumai', 2.3, { armor: 70, isBoss: true })),
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
        e('sm_zealot', 2.5),
        e('sm_monk', 2.6),
      ),
      pack('sm_e2', e('sm_herod', 2.2, { armor: 90 })),
      // Boss + add: Palevane sesílá s posledním zealotem.
      pack(
        'sm_e3',
        e('sm_whitemane', 2.4, { armor: 70, isBoss: true }),
        e('sm_zealot', 2.5, { id: 'sm_zealot_b', level: 8 }),
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
        e('zf_axethrower', 2.5),
        e('zf_axethrower', 2.5, { id: 'zf_axethrower_b', name: 'Dunescale Brave', level: 12 }),
      ),
      pack('zf_e2', e('zf_hoodoo', 2.6)),
      pack('zf_e3', e('zf_gahzrilla', 2.3, { armor: 80 })),
      pack('zf_e4', e('zf_ukorz', 2.4, { armor: 90, isBoss: true })),
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
        e('mar_noxxion', 2.5),
        e('mar_noxxion', 2.5, { id: 'mar_noxxion_b', name: 'Noxxion Spawnling', level: 13 }),
      ),
      pack('mar_e2', e('mar_treant', 2.6)),
      pack('mar_e3', e('mar_landslide', 2.3, { armor: 100 })),
      pack('mar_e4', e('mar_theradras', 2.4, { armor: 90, isBoss: true })),
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
        e('brd_guard', 2.5, { armor: 80 }),
        e('brd_guard', 2.5, { id: 'brd_guard_b', name: 'Anvilrage Footman', level: 15, armor: 60 }),
      ),
      pack('brd_e2', e('brd_geologist', 2.6)),
      pack('brd_e3', e('brd_angerforge', 2.3, { armor: 110 })),
      pack('brd_e4', e('brd_thaurissan', 2.4, { armor: 120, isBoss: true })),
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
        e('strat_zombie', 2.5),
        e('strat_zombie', 2.5, { id: 'strat_zombie_b', name: 'Plagued Ghoul', level: 17 }),
      ),
      pack('strat_e2', e('strat_cryptfiend', 2.6, { armor: 70 })),
      pack('strat_e3', e('strat_ramstein', 2.3, { armor: 120 })),
      pack('strat_e4', e('strat_baron', 2.4, { armor: 130, isBoss: true })),
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
