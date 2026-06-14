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
import { rollLoot, ZONE_LOOT_TABLES, ZONE_TO_BRACKET } from './loot';

/** Typ idle aktivity. Zatím jen quest; rozšiřitelné o profese/dungeony. */
export type ActivityType = 'quest';

/** Parametry aktivity (typově dle activityType). */
export interface QuestActivityParams {
  questId: string;
}

export type ActivityParams = QuestActivityParams;

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

/**
 * Odměna za aktivitu, je-li v okamžiku `now` dokončená; jinak `null`.
 * Jediný vstupní bod pro dopočet odměn (lazy i z BullMQ jobu).
 */
export function computeActivityReward(state: ActivityState, now: number): ActivityReward | null {
  const { completed } = activityProgress(state, now);
  if (!completed) return null;
  switch (state.activityType) {
    case 'quest': {
      const quest = QUESTS[state.params.questId];
      if (!quest) return null;
      return computeQuestReward(quest, state.seed);
    }
    default:
      return null;
  }
}
