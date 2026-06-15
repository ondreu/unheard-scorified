/**
 * Idle aktivita — jádro smyčky M2 (server-authoritative, viz docs/adr/0002 a 0006).
 *
 * Aktivita = `startAt` + typ + parametry + `durationSec` + `seed`. Průběh i odměny
 * se dopočítávají DETERMINISTICKY z uplynulého času a seedu → offline progres bez
 * stálé zátěže a server-side validace (anti-cheat, konzistence FE/BE).
 *
 * Model je záměrně OBECNÝ (activityType): M2 implementuje jen 'quest', ale profese
 * a dungeony (M5/M6) se přidají bez refaktoru.
 */
import { QUESTS, type QuestDef } from './data/quests';
import { SeededRng, seedFromString } from './rng';
import { rollLoot, ZONE_LOOT_TABLES, ZONE_TO_BRACKET, DUNGEON_LOOT_TABLES } from './loot';
import { DUNGEONS } from './data/dungeons';
import { buildEnemyActor, simulateDungeonRun, type CombatActor, type DungeonCombatResult } from './combat';

/** Typ idle aktivity. M2: quest; M5: dungeon. Rozšiřitelné o profese. */
export type ActivityType = 'quest' | 'dungeon';

/** Parametry questovací aktivity. */
export interface QuestActivityParams {
  questId: string;
}

/**
 * Parametry dungeon aktivity (M5). `player` je snapshot bojového profilu při
 * vstupu (anti-cheat + determinismus, viz ADR 0008) — boj nezávisí na pozdější
 * změně gearu/talentů.
 */
export interface DungeonActivityParams {
  dungeonId: string;
  player: CombatActor;
}

export type ActivityParams = QuestActivityParams | DungeonActivityParams;

/** Perzistovaný stav běžící aktivity (vstup pro dopočet). */
export interface ActivityState {
  activityType: ActivityType;
  params: ActivityParams;
  /** Začátek aktivity v epoch ms. */
  startAt: number;
  /** Doba trvání v sekundách. */
  durationSec: number;
  /** Deterministický seed (server volí při startu). */
  seed: number;
}

/** Odměna z aktivity. */
export interface ActivityReward {
  xp: number;
  gold: number;
  items: string[];
}

/** Průběh aktivity v daném okamžiku. */
export interface ActivityProgress {
  elapsedSec: number;
  remainingSec: number;
  /** Postup 0..1. */
  progress: number;
  completed: boolean;
  /** Epoch ms, kdy aktivita skončí (pro plánování BullMQ jobu a UI countdown). */
  finishesAt: number;
}

/**
 * Deterministický seed pro aktivitu. Server ho volí při startu z neměnných
 * vstupů (postava + quest + čas startu) → odměna je reprodukovatelná a
 * validovatelná. Klient ji nemůže ovlivnit.
 */
export function activitySeed(characterId: string, questId: string, startAtMs: number): number {
  return seedFromString(`${characterId}:${questId}:${startAtMs}`);
}

/** Spočítá průběh aktivity v okamžiku `now` (epoch ms). */
export function activityProgress(state: ActivityState, now: number): ActivityProgress {
  const finishesAt = state.startAt + state.durationSec * 1000;
  const elapsedSec = Math.max(0, Math.floor((now - state.startAt) / 1000));
  const remainingSec = Math.max(0, state.durationSec - elapsedSec);
  const progress = state.durationSec <= 0 ? 1 : Math.min(1, elapsedSec / state.durationSec);
  return {
    elapsedSec,
    remainingSec,
    progress,
    completed: now >= finishesAt,
    finishesAt,
  };
}

/**
 * Deterministická odměna za dokončený quest. XP je fixní; zlato se rolluje
 * v rozsahu ±goldVariance přes SeededRng (seedovaný stejně jako aktivita).
 */
export function computeQuestReward(quest: QuestDef, seed: number): ActivityReward {
  const rng = new SeededRng(seed);
  const roll = rng.next(); // [0,1)
  const factor = 1 - quest.goldVariance + roll * 2 * quest.goldVariance;
  const bracket = ZONE_TO_BRACKET[quest.zoneId];
  const lootTable = bracket !== undefined ? ZONE_LOOT_TABLES[bracket] : undefined;
  const items = lootTable !== undefined ? rollLoot(lootTable, rng) : [];
  return {
    xp: quest.baseXp,
    gold: Math.max(0, Math.round(quest.baseGold * factor)),
    items,
  };
}

/** Deterministicky odbojuje dungeon run ze snapshotu v `params`. */
export function simulateDungeonFromParams(
  params: DungeonActivityParams,
  seed: number,
): DungeonCombatResult | null {
  const dungeon = DUNGEONS[params.dungeonId];
  if (!dungeon) return null;
  const enemies = dungeon.encounters.map((e) => buildEnemyActor(e));
  return simulateDungeonRun(params.player, enemies, seed);
}

/**
 * Odměna za dokončený dungeon run. Při vítězství plné XP/zlato + boss loot;
 * při prohře malá „útěcha" XP a žádný loot. Loot rolluje na nezávislém,
 * deterministicky odvozeném seedu (neinterferuje s combat RNG).
 */
export function computeDungeonReward(params: DungeonActivityParams, seed: number): ActivityReward {
  const dungeon = DUNGEONS[params.dungeonId];
  if (!dungeon) return { xp: 0, gold: 0, items: [] };

  const result = simulateDungeonFromParams(params, seed);
  if (!result || !result.victory) {
    // Útěcha: zlomek XP za pokus, žádný loot ani zlato.
    return { xp: Math.round(dungeon.baseXp * 0.1), gold: 0, items: [] };
  }

  const lootRng = new SeededRng((seed ^ 0x9e3779b9) >>> 0);
  const goldRoll = lootRng.next();
  const factor = 1 - dungeon.goldVariance + goldRoll * 2 * dungeon.goldVariance;
  const lootTable = DUNGEON_LOOT_TABLES[dungeon.id];
  const items = lootTable ? rollLoot(lootTable, lootRng) : [];

  return {
    xp: dungeon.baseXp,
    gold: Math.max(0, Math.round(dungeon.baseGold * factor)),
    items,
  };
}

/**
 * Odměna za aktivitu, je-li v okamžiku `now` dokončená; jinak `null`.
 * Jediný vstupní bod pro dopočet odměn (lazy i z BullMQ jobu).
 */
export function computeActivityReward(state: ActivityState, now: number): ActivityReward | null {
  const { completed } = activityProgress(state, now);
  if (!completed) return null;
  switch (state.activityType) {
    case 'quest': {
      const quest = QUESTS[(state.params as QuestActivityParams).questId];
      if (!quest) return null;
      return computeQuestReward(quest, state.seed);
    }
    case 'dungeon':
      return computeDungeonReward(state.params as DungeonActivityParams, state.seed);
    default:
      return null;
  }
}
