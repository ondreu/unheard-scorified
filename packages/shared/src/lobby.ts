/**
 * Raid lobby (M8.5-B): ruční sestavení party. Sdílené stavy + čisté helpery pro
 * počítání volných slotů (shodné BE i FE). Odemčeno M9 social (pozvánky přes
 * friends/guild). Stateful koordinace žije v `apps/api`; tady jen typy + výpočty.
 *
 * UI strings drž odděleně od logiky (i18n-ready).
 */
import { RAID_ROLES, type RaidComposition, type RaidRole } from './raid';

/** Stav lobby: forming (sestavuje se) → started (spuštěno) | cancelled. */
export const RAID_LOBBY_STATUSES = ['forming', 'started', 'cancelled'] as const;
export type RaidLobbyStatus = (typeof RAID_LOBBY_STATUSES)[number];

/** Stav člena lobby: pozván (čeká na potvrzení) nebo připojen. */
export const LOBBY_MEMBER_STATUSES = ['invited', 'joined'] as const;
export type LobbyMemberStatus = (typeof LOBBY_MEMBER_STATUSES)[number];

/**
 * Kolik slotů které role ještě zbývá obsadit (≥ 0), dané cílovou kompozicí a
 * rolemi už **připojených** členů. Přebytek v jedné roli nesnižuje jiné.
 */
export function remainingSlots(comp: RaidComposition, joinedRoles: RaidRole[]): RaidComposition {
  const filled: Record<RaidRole, number> = { tank: 0, healer: 0, dps: 0 };
  for (const r of joinedRoles) filled[r] += 1;
  const out: Record<RaidRole, number> = { tank: 0, healer: 0, dps: 0 };
  for (const r of RAID_ROLES) out[r] = Math.max(0, comp[r] - filled[r]);
  return out;
}

/** Celkový počet volných slotů (napříč rolemi). */
export function openSlotCount(comp: RaidComposition, joinedRoles: RaidRole[]): number {
  const rem = remainingSlots(comp, joinedRoles);
  return rem.tank + rem.healer + rem.dps;
}

/** Lobby je plné (všechny role obsazené připojenými členy). */
export function isLobbyFull(comp: RaidComposition, joinedRoles: RaidRole[]): boolean {
  return openSlotCount(comp, joinedRoles) === 0;
}

/**
 * Lze do lobby přidat člena v dané roli, aniž bychom přesáhli kompozici?
 * (drží počet připojených v roli ≤ cíl).
 */
export function canFillRole(
  comp: RaidComposition,
  joinedRoles: RaidRole[],
  role: RaidRole,
): boolean {
  return remainingSlots(comp, joinedRoles)[role] > 0;
}
