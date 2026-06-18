/**
 * Denní / týdenní cíle (M9). Časově omezené mety, které recyklují achievement
 * metriky, ale počítají se **v rámci období** (UTC den / UTC týden) a po resetu
 * se dají splnit znovu. Deterministické id období (žádný per-process stav).
 *
 * Tady žijí jen čisté vzorce (katalog, id/začátek období, progres). Persistenci
 * nároků (`character_goal_claims`) a počítání řeší API.
 *
 * UI strings (name/description) jsou herní obsah → anglicky.
 */
import { achievementProgress } from './achievements';
import { weeklyLockoutId } from './lockout';

export const GOAL_PERIODS = ['daily', 'weekly'] as const;
export type GoalPeriod = (typeof GOAL_PERIODS)[number];

/** Metriky cílů — musí být časově ukotvené (mají timestamp ve zdrojové tabulce). */
export const GOAL_METRICS = ['questsCompleted', 'dungeonClears'] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

export interface GoalDef {
  id: string;
  name: string;
  description: string;
  period: GoalPeriod;
  metric: GoalMetric;
  target: number;
  rewardGold: number;
}

export const GOALS: readonly GoalDef[] = [
  // Daily
  { id: 'daily_quests_3', name: 'Daily Errands', description: 'Complete 3 quests today.', period: 'daily', metric: 'questsCompleted', target: 3, rewardGold: 60 },
  { id: 'daily_dungeon_1', name: 'Daily Delve', description: 'Clear a dungeon today.', period: 'daily', metric: 'dungeonClears', target: 1, rewardGold: 80 },
  // Weekly
  { id: 'weekly_quests_15', name: 'Weekly Tasks', description: 'Complete 15 quests this week.', period: 'weekly', metric: 'questsCompleted', target: 15, rewardGold: 250 },
  { id: 'weekly_dungeon_10', name: 'Weekly Spelunker', description: 'Clear 10 dungeons this week.', period: 'weekly', metric: 'dungeonClears', target: 10, rewardGold: 300 },
  // Doplňkové cíle (M9): náročnější týdenní quest meta.
  { id: 'weekly_quests_40', name: 'Weekly Grind', description: 'Complete 40 quests this week.', period: 'weekly', metric: 'questsCompleted', target: 40, rewardGold: 500 },
] as const;

export function goalById(id: string): GoalDef | undefined {
  return GOALS.find((g) => g.id === id);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Id denního období = `YYYY-MM-DD` (UTC). */
export function dailyPeriodId(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Id týdenního období = pondělí UTC (sdílí logiku s weekly lockoutem). */
export function weeklyPeriodId(nowMs: number): string {
  return weeklyLockoutId(nowMs);
}

export function periodId(period: GoalPeriod, nowMs: number): string {
  return period === 'daily' ? dailyPeriodId(nowMs) : weeklyPeriodId(nowMs);
}

/** Začátek aktuálního období (ms, UTC) — pro „počet od" dotazy. */
export function periodStartMs(period: GoalPeriod, nowMs: number): number {
  if (period === 'daily') {
    return Math.floor(nowMs / MS_PER_DAY) * MS_PER_DAY;
  }
  return Date.parse(`${weeklyLockoutId(nowMs)}T00:00:00.000Z`);
}

/** Progres cíle z počtu v období: podíl 0..1 a splněno. */
export function goalProgress(value: number, target: number): { completed: boolean; pct: number } {
  return achievementProgress(value, target);
}
