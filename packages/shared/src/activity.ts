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
import { ACTIVITY_DURATION_BOUNDS, ACTIVITY_EFFICIENCY, GRIND } from './constants';
import { QUESTS, type QuestDef } from './data/quests';
import type { ZoneId } from './data/zones';
import { referenceGoldPerHour, referenceXpPerHour } from './leveling';
import { SeededRng, seedFromString } from './rng';
import { rollLoot, ZONE_LOOT_TABLES, ZONE_TO_BRACKET } from './loot';
import { GATHERING_NODES, RECIPES } from './data/professions';
import { rollGatherYield } from './professions';

/**
 * Efektivita odměny dle délky běhu (mírný "punish" za dlouhý běh) — lineárně
 * `ACTIVITY_EFFICIENCY.short` @ `minSec` → `ACTIVITY_EFFICIENCY.long` @ `maxSec`,
 * clampnuto mimo rozsah. Aplikuje se na XP i zlato. Idle hráč obětuje ~20 % za
 * pohodlí delšího "set & forget" běhu. Viz `docs/systems/progression.md`.
 */
export function activityEfficiency(durationSec: number): number {
  const { minSec, maxSec } = ACTIVITY_DURATION_BOUNDS;
  const { short, long } = ACTIVITY_EFFICIENCY;
  if (durationSec <= minSec) return short;
  if (durationSec >= maxSec) return long;
  return short + (long - short) * ((durationSec - minSec) / (maxSec - minSec));
}

/**
 * Typ idle aktivity. M2: quest; M6: gather/craft (profese).
 *
 * ℹ️ Dungeony NEjsou idle aktivita — od M8.5-B (ADR 0014) běží na group-run
 * modelu (`RaidRepository`/`simulateRaidRun`), ne přes `character_activities`.
 */
export type ActivityType = 'quest' | 'gather' | 'craft' | 'grind';

/** Parametry questovací aktivity. */
export interface QuestActivityParams {
  questId: string;
}

/**
 * Parametry generického grindu ("Gone Questing" v UI, rozhodnutí PM): hráč zvolí
 * jen délku běhu (`durationSec` na aktivitě). `level` je SNAPSHOT aktuálního
 * levelu postavy při startu (flexuje s hráčem) → odměna roste s postavou a
 * zůstává plně deterministická z params+durationSec+seed. `zoneId` se auto-odvodí
 * z levelu+frakce (`questingZoneForLevel`) a určuje loot bracket + flavor nepřátele.
 */
export interface GrindActivityParams {
  zoneId: ZoneId;
  level: number;
}

/** Parametry gathering aktivity (M6). `nodeId` určuje materiálový výnos. */
export interface GatherActivityParams {
  nodeId: string;
}

/**
 * Parametry crafting aktivity (M6). Vstupní materiály se spotřebují už při startu
 * (anti-double-spend); zde stačí `recipeId` (výstup je deterministický).
 */
export interface CraftActivityParams {
  recipeId: string;
}

export type ActivityParams =
  | QuestActivityParams
  | GatherActivityParams
  | CraftActivityParams
  | GrindActivityParams;

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
 * Deterministická odměna za dokončený quest. `baseXp`/`baseGold` jsou definované
 * jako odměna při efektivitě 1.0 (= referenční rychlost × délka běhu); skutečná
 * odměna se násobí `activityEfficiency(durationSec)` (mírný punish za dlouhý
 * běh). Zlato se navíc rolluje v rozsahu ±goldVariance přes SeededRng.
 */
export function computeQuestReward(quest: QuestDef, seed: number): ActivityReward {
  const rng = new SeededRng(seed);
  const roll = rng.next(); // [0,1)
  const factor = 1 - quest.goldVariance + roll * 2 * quest.goldVariance;
  const eff = activityEfficiency(quest.durationSec);
  const bracket = ZONE_TO_BRACKET[quest.zoneId];
  const lootTable = bracket !== undefined ? ZONE_LOOT_TABLES[bracket] : undefined;
  const items = lootTable !== undefined ? rollLoot(lootTable, rng) : [];
  return {
    xp: Math.round(quest.baseXp * eff),
    gold: Math.max(0, Math.round(quest.baseGold * factor * eff)),
    items,
  };
}

/**
 * Deterministická odměna za dokončený grind. XP/zlato = referenční rychlost na
 * levelu postavy (`params.level`, snapshot ze startu) × délka běhu ×
 * `activityEfficiency` — tj. ekvivalent dřívějších repeatable questů, ale s
 * hráčem volenou délkou. Loot: jeden roll z bracketu zóny na `GRIND.lootRollSec`
 * sekund běhu (∝ času — jako odpovídající počet krátkých questů; strop = délkový
 * limit). Vše přes jediný `SeededRng` → reprodukovatelné a validovatelné serverem.
 */
export function computeGrindReward(
  params: GrindActivityParams,
  durationSec: number,
  seed: number,
): ActivityReward {
  const rng = new SeededRng(seed);
  const hours = durationSec / 3600;
  const eff = activityEfficiency(durationSec);
  const level = Math.max(1, params.level);

  const goldRoll = rng.next();
  const factor = 1 - GRIND.goldVariance + goldRoll * 2 * GRIND.goldVariance;

  const xp = Math.round(referenceXpPerHour(level) * hours * eff);
  const gold = Math.max(0, Math.round(referenceGoldPerHour(level) * hours * factor * eff));

  const bracket = ZONE_TO_BRACKET[params.zoneId];
  const lootTable = bracket !== undefined ? ZONE_LOOT_TABLES[bracket] : undefined;
  const items: string[] = [];
  if (lootTable !== undefined) {
    const rolls = Math.max(1, Math.round(durationSec / GRIND.lootRollSec));
    for (let i = 0; i < rolls; i++) items.push(...rollLoot(lootTable, rng));
  }
  return { xp, gold, items };
}

/**
 * Odměna za dokončený gathering běh: materiály (rollnuté deterministicky) +
 * character XP. Profession skill a reputace se připisují zvlášť při claimu
 * (mají vlastní perzistenci, nejsou součástí generické `ActivityReward`).
 */
export function computeGatherReward(params: GatherActivityParams, seed: number): ActivityReward {
  const node = GATHERING_NODES[params.nodeId];
  if (!node) return { xp: 0, gold: 0, items: [] };
  const rng = new SeededRng(seed);
  const items = rollGatherYield(node, rng);
  return { xp: node.baseXp, gold: 0, items };
}

/**
 * Odměna za dokončený crafting běh: vyrobený item (deterministický) + character
 * XP. Vstupní materiály se spotřebovaly už při startu.
 */
export function computeCraftReward(params: CraftActivityParams): ActivityReward {
  const recipe = RECIPES[params.recipeId];
  if (!recipe) return { xp: 0, gold: 0, items: [] };
  const items: string[] = [];
  for (let i = 0; i < recipe.outputQuantity; i++) items.push(recipe.outputItemId);
  return { xp: recipe.baseXp, gold: 0, items };
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
    case 'gather':
      return computeGatherReward(state.params as GatherActivityParams, state.seed);
    case 'craft':
      return computeCraftReward(state.params as CraftActivityParams);
    case 'grind':
      return computeGrindReward(
        state.params as GrindActivityParams,
        state.durationSec,
        state.seed,
      );
    default:
      return null;
  }
}
