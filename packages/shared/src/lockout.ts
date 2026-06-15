/**
 * Weekly lockout / raid ID (M8.6, ekonomika). Loot z raidů (a vyšších dungeonů)
 * je limitován **týdenním lockoutem per postava** — opakované idle farmení tak
 * nezaplaví Auction House a drží progresi. Reset je **deterministický dle UTC
 * týdne** (žádný per-process stav, server-authoritative). Viz ADR 0015.
 *
 * Tady žijí jen čisté vzorce (id období, čas resetu, mapování obsahu → lockout).
 * Persistenci (`character_lockouts`) a kontrolu při grantu řeší API.
 */
import { DUNGEONS } from './data/dungeons';
import type { GroupContentType } from './group';

/** Milisekund v jednom týdnu. */
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Kotva týdne: **pondělí 2024-01-01 00:00 UTC** (1. 1. 2024 byl pondělek).
 * Týdny se počítají jako celé násobky `MS_PER_WEEK` od kotvy → reset vždy
 * v pondělí 00:00 UTC.
 */
const WEEK_ANCHOR_MS = Date.UTC(2024, 0, 1, 0, 0, 0, 0);

/** Index týdne (celé číslo) pro daný čas; kotva = týden 0. */
function weekIndex(nowMs: number): number {
  return Math.floor((nowMs - WEEK_ANCHOR_MS) / MS_PER_WEEK);
}

/**
 * Deterministické id aktuálního lockout období = `YYYY-MM-DD` (UTC) pondělí,
 * kterým týden začíná. Stejný týden ⇒ stejné id; nový UTC týden ⇒ nové id
 * (reset). Slouží jako součást klíče v `character_lockouts`.
 */
export function weeklyLockoutId(nowMs: number): string {
  const startMs = WEEK_ANCHOR_MS + weekIndex(nowMs) * MS_PER_WEEK;
  return new Date(startMs).toISOString().slice(0, 10);
}

/** Čas (ms) příštího resetu (následující pondělí 00:00 UTC) pro daný čas. */
export function lockoutResetAt(nowMs: number): number {
  return WEEK_ANCHOR_MS + (weekIndex(nowMs) + 1) * MS_PER_WEEK;
}

/**
 * Má daný obsah týdenní lockout? Všechny **raidy** ano; **dungeony** jen ty
 * označené `weeklyLockout` (vyšší instance s epic lootem).
 */
export function contentHasWeeklyLockout(
  contentType: GroupContentType,
  contentId: string,
): boolean {
  if (contentType === 'raid') return true;
  return DUNGEONS[contentId]?.weeklyLockout === true;
}

/**
 * Lockout id obsahu (klíč v `character_lockouts`) — `"<typ>:<contentId>"`, nebo
 * `null` pokud obsah lockoutu nepodléhá (volně farmitelný). Raid i dungeon mají
 * oddělený namespace, takže se vzájemně neovlivní.
 */
export function lockoutIdForContent(
  contentType: GroupContentType,
  contentId: string,
): string | null {
  return contentHasWeeklyLockout(contentType, contentId) ? `${contentType}:${contentId}` : null;
}
