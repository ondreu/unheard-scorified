/**
 * Trvalá skupina (party) — M9 social. Postava může být v nejvýše jedné skupině;
 * leader zve další (friend/guild gate řeší API), členové mají PVE roli
 * (tank/heal/dps; aréna roli ignoruje). Se skupinou se spouští **dungeon, raid
 * i aréna** (jeden formační systém místo raid lobby + ruční team arény).
 *
 * Tady jen typy + čisté helpery (shodné BE i FE). Stateful koordinace + napojení
 * na run/aréna enginy žije v `apps/api`. Viz ADR 0022.
 */

/** Obsah, který lze spustit se skupinou. */
export const GROUP_ACTIVITY_TYPES = ['dungeon', 'raid', 'arena'] as const;
export type GroupActivityType = (typeof GROUP_ACTIVITY_TYPES)[number];

export function isGroupActivityType(value: string): value is GroupActivityType {
  return (GROUP_ACTIVITY_TYPES as readonly string[]).includes(value);
}

/** Stav člena skupiny: pozván (čeká na potvrzení) nebo připojen. */
export const GROUP_MEMBER_STATUSES = ['invited', 'joined'] as const;
export type GroupMemberStatus = (typeof GROUP_MEMBER_STATUSES)[number];
