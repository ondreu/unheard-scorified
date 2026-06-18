/**
 * Achievementy (M9). Statický katalog + čisté helpery (jediný zdroj pravdy pro
 * API i web). Achievementy se **odvozují z existujícího stavu** (level, zlato,
 * počty dokončených questů/dungeonů/raidů/arén/přátel) — žádné invazivní
 * countery napříč systémy. Progres se počítá lazy při čtení; nárok na odměnu se
 * uloží (jednorázově).
 *
 * UI strings (name/description) jsou herní obsah → anglicky.
 */

/** Metriky, ze kterých se achievementy odvozují (vše derivovatelné z DB). */
export const ACHIEVEMENT_METRICS = [
  'level',
  'gold',
  'questsCompleted',
  'dungeonClears',
  'raidClears',
  'arenaWins',
  'friends',
] as const;
export type AchievementMetric = (typeof ACHIEVEMENT_METRICS)[number];

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  metric: AchievementMetric;
  /** Hodnota metriky, při které je achievement splněn. */
  threshold: number;
  /** Odměna ve zlatě při nárokování. */
  rewardGold: number;
}

/** Katalog achievementů (tiers napříč metrikami). */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // Leveling
  { id: 'level_10', name: 'Getting Started', description: 'Reach level 10.', metric: 'level', threshold: 10, rewardGold: 50 },
  { id: 'level_15', name: 'Seasoned Adventurer', description: 'Reach level 15.', metric: 'level', threshold: 15, rewardGold: 200 },
  { id: 'level_20', name: 'To Twenty!', description: 'Reach the level cap of 20.', metric: 'level', threshold: 20, rewardGold: 1000 },
  // Wealth (aktuální zlato)
  { id: 'gold_500', name: 'Pocket Money', description: 'Hold 500 gold.', metric: 'gold', threshold: 500, rewardGold: 50 },
  { id: 'gold_5000', name: 'Well Off', description: 'Hold 5,000 gold.', metric: 'gold', threshold: 5000, rewardGold: 250 },
  // Questing
  { id: 'quests_10', name: 'Errand Runner', description: 'Complete 10 quests.', metric: 'questsCompleted', threshold: 10, rewardGold: 75 },
  { id: 'quests_50', name: 'Questmaster', description: 'Complete 50 quests.', metric: 'questsCompleted', threshold: 50, rewardGold: 400 },
  // Dungeons
  { id: 'dungeon_1', name: 'Delver', description: 'Clear your first dungeon.', metric: 'dungeonClears', threshold: 1, rewardGold: 50 },
  { id: 'dungeon_25', name: 'Dungeon Crawler', description: 'Clear 25 dungeons.', metric: 'dungeonClears', threshold: 25, rewardGold: 500 },
  // Raids
  { id: 'raid_1', name: 'Raider', description: 'Clear your first raid boss run.', metric: 'raidClears', threshold: 1, rewardGold: 150 },
  { id: 'raid_10', name: 'Raid Veteran', description: 'Clear 10 raid runs.', metric: 'raidClears', threshold: 10, rewardGold: 750 },
  // Arena
  { id: 'arena_1', name: 'Gladiator Initiate', description: 'Win an arena match.', metric: 'arenaWins', threshold: 1, rewardGold: 75 },
  { id: 'arena_25', name: 'Arena Champion', description: 'Win 25 arena matches.', metric: 'arenaWins', threshold: 25, rewardGold: 600 },
  // Social
  { id: 'friends_1', name: 'Not Alone', description: 'Make a friend.', metric: 'friends', threshold: 1, rewardGold: 25 },
  { id: 'friends_10', name: 'Socialite', description: 'Have 10 friends.', metric: 'friends', threshold: 10, rewardGold: 200 },
  // Vyšší tiery (M9) — dlouhodobé mety, využívají existující metriky.
  { id: 'level_45', name: 'Battle-Hardened', description: 'Reach level 45.', metric: 'level', threshold: 45, rewardGold: 500 },
  { id: 'gold_50000', name: 'Tycoon', description: 'Hold 50,000 gold.', metric: 'gold', threshold: 50000, rewardGold: 1500 },
  { id: 'quests_200', name: 'Champion of the People', description: 'Complete 200 quests.', metric: 'questsCompleted', threshold: 200, rewardGold: 1500 },
  { id: 'dungeon_100', name: 'Master Delver', description: 'Clear 100 dungeons.', metric: 'dungeonClears', threshold: 100, rewardGold: 1500 },
  { id: 'raid_50', name: 'Raid Conqueror', description: 'Clear 50 raid runs.', metric: 'raidClears', threshold: 50, rewardGold: 2500 },
  { id: 'arena_100', name: 'Arena Master', description: 'Win 100 arena matches.', metric: 'arenaWins', threshold: 100, rewardGold: 2000 },
] as const;

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Progres achievementu z hodnoty metriky: podíl 0..1 a splněno. */
export function achievementProgress(
  value: number,
  threshold: number,
): { completed: boolean; pct: number } {
  const pct = threshold <= 0 ? 1 : Math.min(1, Math.max(0, value / threshold));
  return { completed: value >= threshold, pct };
}
