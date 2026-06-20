/**
 * Stavba `actors` mapy (jméno → strana/id) pro `CombatLog` z dat jednotlivých
 * běhů. Combat eventy nesou jen jména; tady jim přiřadíme stranu (player/ally/
 * enemy) a případné `id` pro klik na profil — combat log tak nemusí stranu
 * hádat heuristikou.
 */
import type { ActorMeta } from '$lib/components/CombatLog.svelte';
import type {
  ArenaMatchView,
  DungeonPartyRunView,
  DungeonRunView,
  DungeonTurnRunView,
  GauntletRunView,
} from '$lib/api';

type ActorMap = Record<string, ActorMeta>;

/** Solo tahový dungeon: ty = hráč, parťáci = spojenci, nepřátelé = enemy. */
export function dungeonTurnActors(r: DungeonTurnRunView): ActorMap {
  const map: ActorMap = { [r.player.name]: { side: 'player' } };
  for (const a of r.allies) map[a.name] = { side: 'ally' };
  for (const e of r.enemies) map[e.name] = { side: 'enemy' };
  return map;
}

/** Skupinový (MP) dungeon: ty = hráč, ostatní členové = spojenci. */
export function dungeonPartyActors(r: DungeonPartyRunView): ActorMap {
  const map: ActorMap = {};
  for (const m of r.members) map[m.name] = { side: m.isYou ? 'player' : 'ally' };
  for (const e of r.enemies) map[e.name] = { side: 'enemy' };
  return map;
}

/** Idle dungeon: parta = spojenci (bez rozlišení „ty"), encountery = enemy. */
export function dungeonIdleActors(r: DungeonRunView): ActorMap {
  const map: ActorMap = {};
  for (const p of r.party) map[p.name] = { side: 'ally' };
  for (const e of r.encounters) map[e.name] = { side: 'enemy' };
  return map;
}

/** Gauntlet (solo): hráč vs jeden nepřítel za vlnu. */
export function gauntletActors(r: GauntletRunView): ActorMap {
  const map: ActorMap = { [r.player.name]: { side: 'player' } };
  if (r.enemy) map[r.enemy.name] = { side: 'enemy' };
  return map;
}

/** Aréna (PVP): ty = hráč, soupeř = enemy strana, ale s id (klik na profil). */
export function arenaActors(m: ArenaMatchView): ActorMap {
  return {
    [m.me.name]: { side: 'player', id: m.me.characterId },
    [m.opponent.name]: { side: 'enemy', id: m.opponent.characterId },
  };
}
