/**
 * Definice raidů (MP PVE, M8). Statická herní data — jediný zdroj pravdy pro API
 * i web. Balanc (boss HP/AP, loot, XP) se ladí ZDE (vyladí se v M9).
 *
 * Raid = sekvence bossů + companion NPC základ (pro backfill chybějících rolí,
 * idle-first — viz ADR 0011) + attunement gating (level + dokončený questline,
 * rozhodnutí PM). Loot tabulky žijí v `loot.ts` (`RAID_LOOT_TABLES`).
 *
 * Raidy jsou PVE neutrální (obě frakce vidí stejnou sadu); attunement questline
 * je per-frakce (paralelní questy se stejným efektem — frakce kosmetická).
 */
import { SeededRng } from '../rng';
import { buildEnemyActor, type CombatActor, type EnemyStats } from '../combat';
import { rollLoot, RAID_LOOT_TABLES } from '../loot';
import type { RaidRole } from '../raid';

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
  /**
   * Základní staty companion NPC (škálují se rolí v `deriveRaidActor`). Slouží
   * k backfillu chybějících rolí, aby raid šel vyřešit i s málo hráči (idle-first).
   */
  companion: { maxHealth: number; attackPower: number; swingInterval: number; armor: number };
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
    companion: { maxHealth: 900, attackPower: 34, swingInterval: 2.4, armor: 60 },
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
    companion: { maxHealth: 1500, attackPower: 52, swingInterval: 2.4, armor: 100 },
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
};

export const RAID_IDS = Object.keys(RAIDS);

export function isRaidId(value: string): value is string {
  return value in RAIDS;
}

/** Postaví `CombatActor` bosse (vč. signature abilities). */
export function buildRaidBoss(def: RaidBossDef): CombatActor {
  const base = buildEnemyActor(def);
  return {
    ...base,
    signatureAbilities: (def.abilities ?? []).map((a, i) => ({ id: `${def.id}_${i}`, ...a })),
  };
}

/** Companion NPC jména per role (UI). */
export const COMPANION_NAMES: Record<RaidRole, string> = {
  tank: 'Mercenary Guardian',
  healer: 'Mercenary Cleric',
  dps: 'Mercenary Blade',
};

/** Základní `CombatActor` companion NPC (před aplikací role v `deriveRaidActor`). */
export function buildCompanionBase(raid: RaidDef, name: string): CombatActor {
  return {
    name,
    maxHealth: raid.companion.maxHealth,
    attackPower: raid.companion.attackPower,
    swingInterval: raid.companion.swingInterval,
    critChance: 0.08,
    critMultiplier: 2,
    armor: raid.companion.armor,
    lifesteal: 0,
    signatureAbilities: [],
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
 * Odměna jednoho účastníka za raid. Při vítězství plné XP/zlato + raid loot
 * (rollnutý na předaném seedu — service jej odvodí per účastník); při wipu jen
 * zlomek XP. Loot rolluje deterministicky přes `SeededRng`.
 */
export function computeRaidReward(raid: RaidDef, victory: boolean, seed: number): RaidReward {
  if (!victory) return { xp: Math.round(raid.baseXp * 0.1), gold: 0, items: [] };
  const rng = new SeededRng(seed);
  const goldRoll = rng.next();
  const factor = 1 - raid.goldVariance + goldRoll * 2 * raid.goldVariance;
  const table = RAID_LOOT_TABLES[raid.id];
  const items = table ? rollLoot(table, rng) : [];
  return { xp: raid.baseXp, gold: Math.max(0, Math.round(raid.baseGold * factor)), items };
}
