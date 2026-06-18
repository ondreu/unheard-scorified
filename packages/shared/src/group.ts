/**
 * Sjednocený **group PVE run** model (M8.5-B; raidy vyříznuty v ADR 0033, zbyl
 * jen dungeon). Dungeon je **party (1..N aktérů s rolemi) vs sekvence
 * encounterů** na společné simulaci `simulateRaidRun` (party vs sekvence,
 * wipe/retry z M8.5-A, member abilities). SP dungeon = group run s 1 dps; group
 * dungeon 3/5 přidává role. Party se skládá **jen z reálných hráčů** (žádný NPC
 * backfill; obsah se odsimuluje s tím, kolik hráčů se sejde, boss se škáluje
 * velikostí party).
 *
 * Tento modul drží **content-agnostické** helpery (velikosti, kompozice,
 * encountery + scaling, unlock, personal reward). Persistence a matchmaking žijí
 * v API (sdílené run tabulky). `GroupContentType` zůstává jako rozšiřitelný
 * abstrakční bod (kdyby přibyl další group PVE mód). Veškerá náhoda jen přes
 * `SeededRng`. Viz ADR 0014.
 */
import { SeededRng } from './rng';
import {
  buildEnemyActor,
  wipeRewardMultiplier,
  type CombatActor,
} from './combat';
import { DUNGEONS, isDungeonId, isDungeonUnlocked } from './data/dungeons';
import type { RaidComposition, RaidReward } from './raid';
import { rollLoot, DUNGEON_LOOT_TABLES } from './loot';

/** Druh group PVE obsahu (po vyříznutí raidů jen dungeon — ADR 0033). */
export type GroupContentType = 'dungeon';

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

/** Povolené velikosti party pro daný obsah (dungeon: 1/3/5). */
export function groupContentSizes(_contentType: GroupContentType, _contentId: string): number[] {
  return [...DUNGEON_SIZES];
}

/**
 * Default kompozice (tank/healer/dps) pro velikost. Dungeon: 1 = solo dps,
 * 3 = 1/1/1, 5 = 1/1/3.
 */
export function groupComposition(
  _contentType: GroupContentType,
  size: number,
): RaidComposition {
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
 * trash+boss škálované ×size (base 1 hráč → balanc invariantní s počtem hráčů).
 */
export function groupEncounters(
  _contentType: GroupContentType,
  contentId: string,
  size: number,
): CombatActor[] {
  const dungeon = DUNGEONS[contentId];
  if (!dungeon) return [];
  const factor = Math.max(1, size); // dungeon base = 1 hráč
  // Úroveň obsahu → D&D AC/attackBonus nepřátel (MR-5).
  return dungeon.encounters.map((e) =>
    scaleActor(buildEnemyActor({ ...e, level: e.level ?? dungeon.requiredLevel }), factor),
  );
}

/** Je obsah pro postavu odemčený (level + případný attunement/questline)? */
export function isGroupContentUnlocked(
  _contentType: GroupContentType,
  contentId: string,
  level: number,
  completedQuestIds: string[],
): boolean {
  return isDungeonUnlocked(contentId, level, completedQuestIds);
}

export function isGroupContentId(_contentType: GroupContentType, id: string): boolean {
  return isDungeonId(id);
}

/**
 * Personal reward jednoho účastníka za group run (M8.5-A/-D). **Hard fail** =
 * 0 (žádná útěcha). Při clearu plné XP/zlato + loot **škálované wipy**
 * (`wipeRewardMultiplier`). Loot je **personal** (seed odvozený per účastník)
 * z `DUNGEON_LOOT_TABLES`.
 */
export function computeGroupReward(
  _contentType: GroupContentType,
  contentId: string,
  victory: boolean,
  seed: number,
  wipes: number,
): RaidReward {
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
