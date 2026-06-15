/**
 * Sjednocený **group PVE run** model (M8.5-B). Dungeon i raid jsou jeden druh
 * obsahu: **party (1..N aktérů s rolemi) vs sekvence encounterů**, na společné
 * simulaci `simulateRaidRun` (party vs sekvence, wipe/retry z M8.5-A, member
 * abilities). SP dungeon = group run s 1 dps; group dungeon 3/5 a raid 5/10/20
 * přidávají role + NPC backfill.
 *
 * Tento modul drží **content-agnostické** helpery (velikosti, kompozice,
 * encountery + scaling, companion baseline, unlock, personal reward). Persistence
 * a matchmaking žijí v API (sdílené run tabulky). Veškerá náhoda jen přes
 * `SeededRng`. Viz ADR 0014.
 */
import { SeededRng } from './rng';
import { aggregateTalentEffects } from './data/talents';
import { baseStatsFor } from './character';
import {
  buildEnemyActor,
  deriveCombatProfile,
  wipeRewardMultiplier,
  type CombatActor,
} from './combat';
import { DUNGEONS, isDungeonId, isDungeonUnlocked, type DungeonDef } from './data/dungeons';
import {
  RAIDS,
  buildRaidBoss,
  computeRaidReward,
  isRaidId,
  isRaidUnlocked,
  type RaidReward,
} from './data/raids';
import {
  RAID_BASE_SIZE,
  defaultRaidComposition,
  scaleBoss,
  type RaidComposition,
} from './raid';
import { rollLoot, DUNGEON_LOOT_TABLES } from './loot';

/** Druh group PVE obsahu. */
export type GroupContentType = 'dungeon' | 'raid';

/** Povolené velikosti dungeon party: 1 (SP), 3, 5 (group). */
export const DUNGEON_SIZES = [1, 3, 5] as const;
export type DungeonSize = (typeof DUNGEON_SIZES)[number];

export function isDungeonSize(value: number): value is DungeonSize {
  return (DUNGEON_SIZES as readonly number[]).includes(value);
}

/** Společná metadata obsahu (pro list/gating/UI), nezávislá na typu. */
export interface GroupContentMeta {
  contentType: GroupContentType;
  id: string;
  name: string;
  requiredLevel: number;
  sizes: number[];
  bossName: string;
}

/** Povolené velikosti party pro daný obsah. */
export function groupContentSizes(contentType: GroupContentType, contentId: string): number[] {
  if (contentType === 'dungeon') return [...DUNGEON_SIZES];
  return RAIDS[contentId]?.sizes ?? [];
}

/**
 * Default kompozice (tank/healer/dps) pro velikost. Dungeon: 1 = solo dps,
 * 3 = 1/1/1, 5 = 1/1/3. Raid recykluje `defaultRaidComposition`.
 */
export function groupComposition(
  contentType: GroupContentType,
  size: number,
): RaidComposition {
  if (contentType === 'raid') return defaultRaidComposition(size);
  if (size <= 1) return { tank: 0, healer: 0, dps: 1 };
  if (size === 3) return { tank: 1, healer: 1, dps: 1 };
  return { tank: 1, healer: 1, dps: size - 2 };
}

/** Zlehčená/zesílená kopie aktéra (×factor na HP i attack power). */
function scaleActor(actor: CombatActor, factor: number): CombatActor {
  if (factor === 1) return actor;
  return {
    ...actor,
    maxHealth: Math.max(1, Math.round(actor.maxHealth * factor)),
    attackPower: actor.attackPower * factor,
  };
}

/**
 * Sekvence encounterů (`CombatActor[]`) pro obsah a velikost party. Dungeon:
 * trash+boss škálované ×size (base 1 hráč → balanc invariantní s počtem hráčů,
 * stejná logika jako `scaleBoss` u raidů). Raid: bossové škálovaní `scaleBoss`.
 */
export function groupEncounters(
  contentType: GroupContentType,
  contentId: string,
  size: number,
): CombatActor[] {
  if (contentType === 'dungeon') {
    const dungeon = DUNGEONS[contentId];
    if (!dungeon) return [];
    const factor = Math.max(1, size); // dungeon base = 1 hráč
    return dungeon.encounters.map((e) => scaleActor(buildEnemyActor(e), factor));
  }
  const raid = RAIDS[contentId];
  if (!raid) return [];
  return raid.bosses.map((b) => scaleBoss(buildRaidBoss(b), size));
}

/**
 * Baseline `CombatActor` pro NPC backfill daného obsahu (před aplikací role
 * přes `deriveRaidActor`). Dungeon: odvozeno z `recommendedLevel` (generický
 * warrior profil); raid: `buildCompanionBase` (řeší API, má raid def).
 */
export function buildDungeonCompanion(dungeon: DungeonDef, name: string): CombatActor {
  const level = dungeon.recommendedLevel;
  return deriveCombatProfile({
    name,
    level,
    klass: 'warrior',
    primary: baseStatsFor('human', 'warrior', level),
    equipment: {},
    talents: aggregateTalentEffects('warrior', {}),
  });
}

/** Je obsah pro postavu odemčený (level + případný attunement/questline)? */
export function isGroupContentUnlocked(
  contentType: GroupContentType,
  contentId: string,
  level: number,
  completedQuestIds: string[],
): boolean {
  if (contentType === 'dungeon') return isDungeonUnlocked(contentId, level);
  return isRaidUnlocked(contentId, level, completedQuestIds);
}

export function isGroupContentId(contentType: GroupContentType, id: string): boolean {
  return contentType === 'dungeon' ? isDungeonId(id) : isRaidId(id);
}

/**
 * Personal reward jednoho účastníka za group run (M8.5-A/-D). **Hard fail** =
 * 0 (žádná útěcha). Při clearu plné XP/zlato + loot **škálované wipy**
 * (`wipeRewardMultiplier`). Loot je **personal** (seed odvozený per účastník).
 * Dungeon používá `DUNGEON_LOOT_TABLES`, raid deleguje na `computeRaidReward`.
 */
export function computeGroupReward(
  contentType: GroupContentType,
  contentId: string,
  victory: boolean,
  seed: number,
  wipes: number,
): RaidReward {
  if (contentType === 'raid') {
    const raid = RAIDS[contentId];
    if (!raid) return { xp: 0, gold: 0, items: [] };
    return computeRaidReward(raid, victory, seed, wipes);
  }

  const dungeon = DUNGEONS[contentId];
  if (!dungeon) return { xp: 0, gold: 0, items: [] };
  if (!victory) return { xp: 0, gold: 0, items: [] };

  const mult = wipeRewardMultiplier(wipes);
  const rng = new SeededRng(seed);
  const goldRoll = rng.next();
  const factor = 1 - dungeon.goldVariance + goldRoll * 2 * dungeon.goldVariance;
  const table = DUNGEON_LOOT_TABLES[dungeon.id];
  const items = table ? rollLoot(table, rng, mult) : [];
  return {
    xp: Math.round(dungeon.baseXp * mult),
    gold: Math.max(0, Math.round(dungeon.baseGold * factor * mult)),
    items,
  };
}

// Re-export pro pohodlí API (jeden import z group modelu).
export { RAID_BASE_SIZE };
