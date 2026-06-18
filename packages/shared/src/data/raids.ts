/**
 * Definice raidů (MP PVE, M8). Statická herní data — jediný zdroj pravdy pro API
 * i web. Balanc (boss HP/AP, loot, XP) se ladí ZDE (vyladí se v M9).
 *
 * Raid = sekvence bossů + attunement gating (level + dokončený questline,
 * rozhodnutí PM). Party se skládá jen z reálných hráčů (NPC backfill odebrán).
 * Loot tabulky žijí v `loot.ts` (`RAID_LOOT_TABLES`).
 *
 * Raidy jsou PVE neutrální (obě frakce vidí stejnou sadu); attunement questline
 * je per-frakce (paralelní questy se stejným efektem — frakce kosmetická).
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

function boss(
  id: string,
  name: string,
  maxHealth: number,
  attackPower: number,
  swingInterval: number,
  opts: { armor?: number; abilities?: RaidBossDef['abilities'] } = {},
): RaidBossDef {
  return { id, name, maxHealth, attackPower, swingInterval, isBoss: true, armor: opts.armor, abilities: opts.abilities };
}

export const RAIDS: Record<string, RaidDef> = {
  // ── Molten Core (tier 1 raid, ~lvl 40) ──────────────────────────────────────
  molten_core: {
    id: 'molten_core',
    name: 'Molten Core',
    description: 'The molten heart of Blackrock Mountain, where Ragnaros the Firelord smolders in his throne.',
    attunement: { requiredLevel: 40, questAnyOf: ['dw_morbent_fel', 'tn_galak_ogres'] },
    sizes: [5, 10, 20],
    baseXp: 9000,
    baseGold: 300,
    goldVariance: 0.2,
    bosses: [
      boss('mc_lucifron', 'Lucifron', 4200, 44, 2.4, { armor: 80 }),
      boss('mc_magmadar', 'Magmadar', 5200, 50, 2.6, {
        armor: 90,
        abilities: [{ name: 'Lava Breath', cooldownSec: 12, damageMult: 2.2 }],
      }),
      boss('mc_ragnaros', 'Ragnaros the Firelord', 7800, 60, 2.5, {
        armor: 120,
        abilities: [{ name: 'Wrath of Ragnaros', cooldownSec: 14, damageMult: 2.6 }],
      }),
    ],
  },

  // ── Blackwing Lair (tier 2 raid, ~lvl 55) ───────────────────────────────────
  blackwing_lair: {
    id: 'blackwing_lair',
    name: 'Blackwing Lair',
    description: 'Nefarian\'s dread fortress atop Blackrock Spire, home to his twisted chromatic experiments.',
    attunement: { requiredLevel: 55, questAnyOf: ['al_drakefire_attunement', 'ho_drakefire_attunement'] },
    sizes: [10, 20],
    baseXp: 18000,
    baseGold: 520,
    goldVariance: 0.2,
    bosses: [
      boss('bwl_razorgore', 'Razorgore the Untamed', 7200, 64, 2.4, { armor: 120 }),
      boss('bwl_vaelastrasz', 'Vaelastrasz the Corrupt', 9000, 72, 2.5, {
        armor: 130,
        abilities: [{ name: 'Flame Breath', cooldownSec: 12, damageMult: 2.4 }],
      }),
      boss('bwl_nefarian', 'Nefarian', 12500, 84, 2.4, {
        armor: 160,
        abilities: [{ name: 'Shadow Flame', cooldownSec: 13, damageMult: 2.8 }],
      }),
    ],
  },

  // ── Zul'Gurub (tier 1.5 raid, ~lvl 50, M12) ─────────────────────────────────
  // Progresní most mezi Molten Core (40) a Blackwing Lair (55): troll-říše
  // Gurubashi a krvavý bůh Hakkar.
  zulgurub: {
    id: 'zulgurub',
    name: "Zul'Gurub",
    description:
      'The ruined jungle city of the Gurubashi trolls, where the priests of Hakkar the Soulflayer bleed the living to call their blood god into the world.',
    attunement: { requiredLevel: 50, questAnyOf: ['al_paragons_of_power', 'ho_paragons_of_power'] },
    sizes: [10, 20],
    baseXp: 13500,
    baseGold: 430,
    goldVariance: 0.2,
    bosses: [
      boss('zg_venoxis', 'High Priest Venoxis', 6000, 54, 2.4, { armor: 100 }),
      boss('zg_mandokir', 'Bloodlord Mandokir', 7600, 62, 2.5, {
        armor: 110,
        abilities: [{ name: 'Bloodletting', cooldownSec: 12, damageMult: 2.3 }],
      }),
      boss('zg_hakkar', 'Hakkar the Soulflayer', 10800, 76, 2.4, {
        armor: 140,
        abilities: [{ name: 'Blood Siphon', cooldownSec: 13, damageMult: 2.6 }],
      }),
    ],
  },

  // ── Temple of Ahn'Qiraj (tier 3 raid, ~lvl 58, M12) ─────────────────────────
  // Nový top-end nad Blackwing Lair: silithidí úl pod pouští a spící Prastarý bůh
  // C'Thun.
  ahnqiraj: {
    id: 'ahnqiraj',
    name: "Temple of Ahn'Qiraj",
    description:
      'Beneath the silithid hive of Ahn\'Qiraj coils C\'Thun, an Old God dreaming of devouring the world. The Qiraji legions stand between you and its slumbering eye.',
    attunement: { requiredLevel: 58, questAnyOf: ['al_scepter_of_the_sands', 'ho_scepter_of_the_sands'] },
    sizes: [10, 20],
    baseXp: 22000,
    baseGold: 640,
    goldVariance: 0.2,
    bosses: [
      boss('aq_skeram', 'The Prophet Skeram', 13500, 90, 2.4, {
        armor: 150,
        abilities: [{ name: 'Arcane Explosion', cooldownSec: 12, damageMult: 2.5 }],
      }),
      boss('aq_sartura', 'Battleguard Sartura', 15500, 98, 2.2, {
        armor: 160,
        abilities: [{ name: 'Whirlwind', cooldownSec: 11, damageMult: 2.4 }],
      }),
      boss('aq_cthun', "C'Thun", 21000, 112, 2.4, {
        armor: 180,
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
