/**
 * Trvalá skupina (party) — M9 social. Postava může být v nejvýše jedné skupině;
 * leader zve další (friend/guild gate řeší API), členové mají PVE roli
 * (tank/heal/dps; aréna roli ignoruje). Se skupinou se spouští **dungeon i
 * aréna** (jeden formační systém; raidy vyříznuty — ADR 0033).
 *
 * Tady jen typy + čisté helpery (shodné BE i FE). Stateful koordinace + napojení
 * na run/aréna enginy žije v `apps/api`. Viz ADR 0022.
 */

/** Obsah, který lze spustit se skupinou. */
export const GROUP_ACTIVITY_TYPES = ['dungeon', 'arena'] as const;
export type GroupActivityType = (typeof GROUP_ACTIVITY_TYPES)[number];

export function isGroupActivityType(value: string): value is GroupActivityType {
  return (GROUP_ACTIVITY_TYPES as readonly string[]).includes(value);
}

/**
 * Stav člena skupiny: `invited` (leader pozval, čeká na potvrzení), `requested`
 * (hráč žádá o vstup, čeká na schválení leaderem) nebo `joined` (připojen).
 */
export const GROUP_MEMBER_STATUSES = ['invited', 'requested', 'joined'] as const;
export type GroupMemberStatus = (typeof GROUP_MEMBER_STATUSES)[number];
