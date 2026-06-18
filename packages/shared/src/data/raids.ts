/**
 * Definice raidů (MP PVE, M8). Statická herní data — jediný zdroj pravdy pro API
 * i web. Balanc (boss HP/AP, loot, XP) se ladí ZDE (vyladí se v M9).
 *
 * Raid = sekvence bossů + attunement gating (level + dokončený questline,
 * rozhodnutí PM). Party se skládá jen z reálných hráčů (NPC backfill odebrán).
 * Loot tabulky žijí v `loot.ts` (`RAID_LOOT_TABLES`).
 *
 * Raidy jsou PVE neutrální (frakce odstraněny v MR); attunement questline je
 * sdílený. Lore názvy jsou homebrew (setting „The Caldmoor Reaches").
 */
import { SeededRng } from '../rng';
import { buildEnemyActor, wipeRewardMultiplier, type CombatActor, type EnemyStats } from '../combat';
import { rollLoot, RAID_LOOT_TABLES } from '../loot';

/** Boss v raidu (statická data → `buildRaidBoss`). Volitelné signature abilities. */
export interface RaidBossDef extends EnemyStats {
  id: string;
  /** Periodické silné údery bosse (např. cleave/breath). */
  abilities?: { name: string; cooldownSec: number; damageMult: number }[];
}

export interface RaidAttunement {
  /** Minimální level pro vstup (content gating). */
  requiredLevel: number;
  /**
   * Postava musí mít dokončený alespoň JEDEN z těchto story questů (per-frakce
   * questline). Prázdné pole = jen level requirement.
   */
  questAnyOf: string[];
}

export interface RaidDef {
  id: string;
  /** Anglický herní název (game language = EN). */
  name: string;
  /** Flavor popis (anglicky). */
  description: string;
  attunement: RaidAttunement;
  /** Povolené velikosti party (modern-WoW flex: 5/10/20). První = default. */
  sizes: number[];
  /** Sekvence bossů (poslední je „end boss"). Staty se škálují dle velikosti. */
  bosses: RaidBossDef[];
  /** Základní XP odměna za vyčištění (per účastník, fixní). */
  baseXp: number;
  /** Základní zlato (rolluje se s variancí). */
  baseGold: number;
  /** Variance zlata (0..1). */
  goldVariance: number;
}

/** Volitelné staty bosse nad rámec pozičních argumentů (`boss`). */
type BossOpts = Partial<
  Pick<
    EnemyStats,
    | 'armor'
    | 'damageType'
    | 'resistances'
    | 'vulnerabilities'
    | 'immunities'
    | 'level'
    | 'challengeRating'
  >
> & { abilities?: RaidBossDef['abilities'] };

// HP/poškození se NEzadávají ručně — odvodí je `buildEnemyActor` z Challenge
// Ratingu (`crEnemyMagnitude`, ADR 0032). Bossové gradují přes explicitní
// `challengeRating` (vzestupně od `attunement.requiredLevel`).
function boss(
  id: string,
  name: string,
  swingInterval: number,
  opts: BossOpts = {},
): RaidBossDef {
  const { abilities, ...stats } = opts;
  return { id, name, swingInterval, isBoss: true, ...stats, abilities };
}

export const RAIDS: Record<string, RaidDef> = {
  // ── Cinderforge Depths (tier 1 raid, ~lvl 14) ──────────────────────────────────────
  molten_core: {
    id: 'molten_core',
    name: 'Cinderforge Depths',
    description: 'The molten heart of Cinderpeak, where Ignaroth the Flamelord smolders in his throne.',
    attunement: { requiredLevel: 14, questAnyOf: ['dw_morbent_fel', 'tn_galak_ogres'] },
    sizes: [5, 10, 20],
    baseXp: 9000,
    baseGold: 300,
    goldVariance: 0.2,
    // Bestiář (MR-10d): fire raid — obyvatelé žárovzdorní (resist fire), Flamelord
    // ohni IMUNNÍ. Díky per-ability typům (MR-10d) má i fire caster ne-fire kouzlo
    // (Magic Missile = force, Chromatic Orb = lightning…) → puzzle, ne dead-weight.
    bosses: [
      boss('mc_lucifron', 'Pyrothul', 2.4, {
        challengeRating: 14,
        armor: 80,
        damageType: 'fire',
        resistances: ['fire'],
      }),
      boss('mc_magmadar', 'Cindermaw', 2.6, {
        challengeRating: 15,
        armor: 90,
        damageType: 'fire',
        resistances: ['fire'],
        abilities: [{ name: 'Lava Breath', cooldownSec: 12, damageMult: 2.2 }],
      }),
      boss('mc_ragnaros', 'Ignaroth the Flamelord', 2.5, {
        challengeRating: 16,
        armor: 120,
        damageType: 'fire',
        immunities: ['fire'],
        abilities: [{ name: 'Wrath of Ignaroth', cooldownSec: 14, damageMult: 2.6 }],
      }),
    ],
  },

  // ── Drakefell Spire (tier 2 raid, ~lvl 18) ───────────────────────────────────
  blackwing_lair: {
    id: 'blackwing_lair',
    name: 'Drakefell Spire',
    description: 'Nefarius\'s dread fortress atop Cinderpeak Spire, home to his twisted prismatic experiments.',
    attunement: { requiredLevel: 18, questAnyOf: ['al_drakefire_attunement', 'ho_drakefire_attunement'] },
    sizes: [10, 20],
    baseXp: 18000,
    baseGold: 520,
    goldVariance: 0.2,
    // Bestiář (MR-10d): draci — žárovzdorní (resist fire); Nefarius (shadowflame)
    // navíc odolá nekrotice. Fyzické útoky beze změny.
    bosses: [
      boss('bwl_razorgore', 'Razorwing the Untamed', 2.4, {
        challengeRating: 18,
        armor: 120,
        damageType: 'fire',
        resistances: ['fire'],
      }),
      boss('bwl_vaelastrasz', 'Vaelorin the Corrupt', 2.5, {
        challengeRating: 19,
        armor: 130,
        damageType: 'fire',
        resistances: ['fire'],
        abilities: [{ name: 'Flame Breath', cooldownSec: 12, damageMult: 2.4 }],
      }),
      boss('bwl_nefarian', 'Nefarius', 2.4, {
        challengeRating: 20,
        armor: 160,
        damageType: 'fire',
        resistances: ['fire', 'necrotic'],
        abilities: [{ name: 'Shadow Flame', cooldownSec: 13, damageMult: 2.8 }],
      }),
    ],
  },

  // ── Zargubai (tier 1.5 raid, ~lvl 17, M12) ─────────────────────────────────
  // Progresní most mezi Cinderforge Depths (14) a Drakefell Spire (18): troll-říše
  // Gurubai a krvavý bůh Hazkar.
  zulgurub: {
    id: 'zulgurub',
    name: "Zargubai",
    description:
      'The ruined jungle city of the Gurubai trolls, where the priests of Hazkar the Soulflayer bleed the living to call their blood god into the world.',
    attunement: { requiredLevel: 17, questAnyOf: ['al_paragons_of_power', 'ho_paragons_of_power'] },
    sizes: [10, 20],
    baseXp: 13500,
    baseGold: 430,
    goldVariance: 0.2,
    // Bestiář (MR-10d): blood-cult trollové — jed/nekrotická magie (resist), krvavý
    // bůh Hazkar zranitelný radiant (holy vs jeho rouhání).
    bosses: [
      boss('zg_venoxis', 'High Priest Venox', 2.4, {
        challengeRating: 17,
        armor: 100,
        damageType: 'poison',
        resistances: ['poison'],
      }),
      boss('zg_mandokir', 'Bloodlord Mandok', 2.5, {
        challengeRating: 18,
        armor: 110,
        damageType: 'slashing',
        abilities: [{ name: 'Bloodletting', cooldownSec: 12, damageMult: 2.3 }],
      }),
      boss('zg_hakkar', 'Hazkar the Soulflayer', 2.4, {
        challengeRating: 19,
        armor: 140,
        damageType: 'necrotic',
        resistances: ['necrotic'],
        vulnerabilities: ['radiant'],
        abilities: [{ name: 'Blood Siphon', cooldownSec: 13, damageMult: 2.6 }],
      }),
    ],
  },

  // ── Hollow Temple of Ankhareth (tier 3 raid, ~lvl 19, M12) ─────────────────────────
  // Nový top-end nad Drakefell Spire: chitin-spawní úl pod pouští a spící Prastarý bůh
  // Xathun.
  ahnqiraj: {
    id: 'ahnqiraj',
    name: "Hollow Temple of Ankhareth",
    description:
      'Beneath the chitin-spawn hive of Ankhareth coils Xathun, an Elder Horror dreaming of devouring the world. The Khareth legions stand between you and its slumbering eye.',
    attunement: { requiredLevel: 19, questAnyOf: ['al_scepter_of_the_sands', 'ho_scepter_of_the_sands'] },
    sizes: [10, 20],
    baseXp: 22000,
    baseGold: 640,
    goldVariance: 0.2,
    // Bestiář (MR-10d): chitin-spawn úl + Elder Horror — odolávají psychice (cizí
    // mysl), Xathun zranitelný radiant (holy vyhání prastarou hrůzu).
    bosses: [
      boss('aq_skeram', 'The Prophet Shakram', 2.4, {
        challengeRating: 19,
        armor: 150,
        damageType: 'psychic',
        resistances: ['psychic'],
        abilities: [{ name: 'Arcane Explosion', cooldownSec: 12, damageMult: 2.5 }],
      }),
      boss('aq_sartura', 'Warden Sartha', 2.2, {
        challengeRating: 20,
        armor: 160,
        damageType: 'slashing',
        resistances: ['poison'],
        abilities: [{ name: 'Whirlwind', cooldownSec: 11, damageMult: 2.4 }],
      }),
      boss('aq_cthun', 'Xathun', 2.4, {
        challengeRating: 21,
        armor: 180,
        damageType: 'psychic',
        resistances: ['psychic'],
        vulnerabilities: ['radiant'],
        abilities: [{ name: 'Eye Beam', cooldownSec: 13, damageMult: 2.9 }],
      }),
    ],
  },
};

export const RAID_IDS = Object.keys(RAIDS);

export function isRaidId(value: string): value is string {
  return value in RAIDS;
}

/**
 * Postaví `CombatActor` bosse (vč. signature abilities). `level` (úroveň raidu)
 * odvodí D&D AC/attackBonus nepřítele (MR-5), když je boss nemá explicitně.
 */
export function buildRaidBoss(def: RaidBossDef, level?: number): CombatActor {
  const base = buildEnemyActor({ ...def, level: def.level ?? level });
  return {
    ...base,
    signatureAbilities: (def.abilities ?? []).map((a, i) => ({
      id: `${def.id}_${i}`,
      kind: 'strike' as const,
      ...a,
    })),
  };
}

/**
 * Splňuje postava attunement raidu? (level + alespoň jeden z attunement questů,
 * pokud jsou požadovány).
 */
export function isRaidUnlocked(
  raidId: string,
  level: number,
  completedQuestIds: ReadonlySet<string> | readonly string[],
): boolean {
  const raid = RAIDS[raidId];
  if (!raid) return false;
  if (level < raid.attunement.requiredLevel) return false;
  if (raid.attunement.questAnyOf.length === 0) return true;
  const completed =
    completedQuestIds instanceof Set ? completedQuestIds : new Set(completedQuestIds);
  return raid.attunement.questAnyOf.some((q) => completed.has(q));
}

export interface RaidReward {
  xp: number;
  gold: number;
  items: string[];
}

/**
 * Odměna jednoho účastníka za raid (M8.5-A). **Hard fail** (raid nevyčistěn) =
 * nulová odměna, žádná útěcha. Při clearu plné XP/zlato + raid loot **škálované
 * počtem wipů** (`wipeRewardMultiplier`): maximum za 0 wipů, klesá s každým wipem
 * (i šance na loot). Loot rolluje deterministicky přes `SeededRng` (service
 * odvodí seed per účastník).
 */
export function computeRaidReward(
  raid: RaidDef,
  victory: boolean,
  seed: number,
  wipes = 0,
): RaidReward {
  if (!victory) return { xp: 0, gold: 0, items: [] };
  const mult = wipeRewardMultiplier(wipes);
  const rng = new SeededRng(seed);
  const goldRoll = rng.next();
  const factor = 1 - raid.goldVariance + goldRoll * 2 * raid.goldVariance;
  const table = RAID_LOOT_TABLES[raid.id];
  const items = table ? rollLoot(table, rng, mult) : [];
  return {
    xp: Math.round(raid.baseXp * mult),
    gold: Math.max(0, Math.round(raid.baseGold * factor * mult)),
    items,
  };
}
