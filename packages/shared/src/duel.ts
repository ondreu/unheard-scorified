/**
 * Duel v bestiáři (testovací souboj, bez odměn).
 *
 * Postaví nepřítele z katalogové šablony (`instantiateEnemy` — jeho **nativní CR**
 * ze stat-blocku, jak ho ukazuje bestiář) a pošle ho proti snapshotu postavy přes
 * auto-resolve quest engine (`simulateQuestEncounter`, `allowDefeat = true` → boj
 * lze **reálně prohrát**, takže je to poctivý test síly). **Žádné odměny / XP /
 * loot / kill counter** — čistě k testování balancu a hráčskému průzkumu.
 *
 * Recykluje quest combat engine (žádná duplikace bojových vzorců). Deterministické
 * (seed per duel → server-authoritative). Herní stringy anglicky (EN).
 */
import { instantiateEnemy } from './data/enemies';
import { BESTIARY } from './data/enemies';
import { buildEnemyActor } from './combat';
import { simulateQuestEncounter } from './quest-run';
import { startDungeonRun, type DungeonRunState } from './dungeon-run';
import { SeededRng } from './rng';
import type { CombatActor, CombatEvent } from './combat';

/** Výsledek testovacího duelu (bez odměn). */
export interface DuelResult {
  /** Jméno hráče (pro stranovou klasifikaci combat logu). */
  playerName: string;
  /** Jméno vyzvaného nepřítele. */
  enemyName: string;
  /** Časová osa boje (auto-resolve). */
  events: CombatEvent[];
  /** Vyhrál hráč? `false` = padl, nebo nedorazil nepřítele v časovém limitu. */
  victory: boolean;
  /** Zbylé HP postavy v % (0..100) — „jak čistý byl boj". */
  playerHpPct: number;
}

/** Je `templateId` platná katalogová šablona, kterou lze vyzvat na duel? */
export function isDuelableEnemy(templateId: string): boolean {
  return templateId in BESTIARY;
}

/**
 * Odsimuluje testovací duel postavy proti katalogové šabloně nepřítele. Nepřítel
 * má svůj **nativní CR** (stat-block z bestiáře); boj jde přes auto-resolve quest
 * engine s `allowDefeat = true` (lze prohrát). Vrací jen log + výsledek —
 * **volající nepřipisuje žádné odměny ani kill counter**.
 */
export function simulateDuel(player: CombatActor, templateId: string, seed: number): DuelResult {
  const template = BESTIARY[templateId];
  if (!template) throw new Error(`simulateDuel: unknown enemy template "${templateId}"`);
  // Nativní CR šablony → magnituda/AC/obrany odpovídají stat-blocku v bestiáři.
  const foeStats = instantiateEnemy(templateId, { challengeRating: template.cr });
  const rng = new SeededRng(seed);
  const outcome = simulateQuestEncounter(player, foeStats, rng, 0, true);
  return {
    playerName: player.name,
    enemyName: template.name,
    events: outcome.events,
    victory: !outcome.playerDefeated,
    playerHpPct: outcome.playerHpPct,
  };
}

/** Synteticky `dungeonId` duel runu (odlišuje ho v logu/persistenci od dungeonů). */
export function duelDungeonId(templateId: string): string {
  return `duel:${templateId}`;
}

/**
 * Spustí **tahový** duel (Slice 2): jeden testovací encounter (single enemy z
 * katalogu na nativním CR) přes generalizovaný tahový dungeon engine
 * (`startDungeonRun` s vlastním encounterem). Solo, **žádné odměny** — clear/smrt
 * řeší volající (nepřipisuje XP/loot/kill counter). Stav je plně serializovatelný
 * (persistuje se jako `DungeonRunState`, ovládá se `resolveDungeonTurn`).
 */
export function startDuelRun(
  base: CombatActor,
  templateId: string,
  level: number,
  seed: number,
): DungeonRunState {
  const template = BESTIARY[templateId];
  if (!template) throw new Error(`startDuelRun: unknown enemy template "${templateId}"`);
  const enemy = buildEnemyActor(instantiateEnemy(templateId, { challengeRating: template.cr }));
  return startDungeonRun(base, duelDungeonId(templateId), 1, level, seed, [], [[enemy]], template.name);
}
