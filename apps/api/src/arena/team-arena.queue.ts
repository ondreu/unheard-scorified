import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { ArenaBracket, CombatActor } from '@game/shared';
import { REDIS } from '../redis/redis.module';

/**
 * Fronta týmových arén (M8.5-C, 3v3/5v5). Idle-first snapshot model jako 1v1
 * (M7), ale jednotka je celý **ručně sestavený tým**. Žádný NPC backfill —
 * spáruje se jen proti jinému čekajícímu reálnému týmu bez překryvu členů.
 *
 * Abstrahováno za rozhraní → Redis (sdílené napříč instancemi) + in-memory (testy).
 */
export const TEAM_ARENA_QUEUE = Symbol('TEAM_ARENA_QUEUE');

export interface TeamMemberEntry {
  characterId: string;
  accountId: string;
  name: string;
  rating: number;
  snapshot: CombatActor;
}

export interface TeamQueueEntry {
  /** Id týmu = characterId leadera (klíč ve frontě). */
  leaderCharacterId: string;
  members: TeamMemberEntry[];
  queuedAt: number;
}

export interface TeamArenaQueue {
  enqueue(bracket: ArenaBracket, seasonId: string, team: TeamQueueEntry): Promise<void>;
  remove(bracket: ArenaBracket, seasonId: string, leaderCharacterId: string): Promise<void>;
  isLeaderQueued(bracket: ArenaBracket, seasonId: string, leaderCharacterId: string): Promise<boolean>;
  /** Je daná postava členem nějakého čekajícího týmu? */
  isMemberQueued(bracket: ArenaBracket, seasonId: string, characterId: string): Promise<boolean>;
  /**
   * Atomicky vybere a odebere čekající tým bez překryvu s `excludeMemberIds`
   * (a jiný než `excludeLeaderId`). Nejdéle čekající první. `null` = nikdo.
   */
  takeOpponent(
    bracket: ArenaBracket,
    seasonId: string,
    excludeLeaderId: string,
    excludeMemberIds: string[],
  ): Promise<TeamQueueEntry | null>;
}

function key(bracket: ArenaBracket, seasonId: string): string {
  return `arena:teamqueue:${seasonId}:${bracket}`;
}

const QUEUE_TTL_SEC = 24 * 60 * 60;

function overlaps(team: TeamQueueEntry, excludeMemberIds: string[]): boolean {
  const set = new Set(excludeMemberIds);
  return team.members.some((m) => set.has(m.characterId));
}

@Injectable()
export class RedisTeamArenaQueue implements TeamArenaQueue {
  private readonly logger = new Logger(RedisTeamArenaQueue.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async enqueue(bracket: ArenaBracket, seasonId: string, team: TeamQueueEntry): Promise<void> {
    const k = key(bracket, seasonId);
    await this.redis.hset(k, team.leaderCharacterId, JSON.stringify(team));
    await this.redis.expire(k, QUEUE_TTL_SEC);
  }

  async remove(bracket: ArenaBracket, seasonId: string, leaderCharacterId: string): Promise<void> {
    await this.redis.hdel(key(bracket, seasonId), leaderCharacterId);
  }

  async isLeaderQueued(bracket: ArenaBracket, seasonId: string, leaderCharacterId: string): Promise<boolean> {
    return (await this.redis.hexists(key(bracket, seasonId), leaderCharacterId)) === 1;
  }

  async isMemberQueued(bracket: ArenaBracket, seasonId: string, characterId: string): Promise<boolean> {
    const all = await this.redis.hgetall(key(bracket, seasonId));
    return Object.values(all).some((raw) =>
      (JSON.parse(raw) as TeamQueueEntry).members.some((m) => m.characterId === characterId),
    );
  }

  async takeOpponent(
    bracket: ArenaBracket,
    seasonId: string,
    excludeLeaderId: string,
    excludeMemberIds: string[],
  ): Promise<TeamQueueEntry | null> {
    const k = key(bracket, seasonId);
    const all = await this.redis.hgetall(k);
    const candidates = Object.values(all)
      .map((raw) => JSON.parse(raw) as TeamQueueEntry)
      .filter((t) => t.leaderCharacterId !== excludeLeaderId && !overlaps(t, excludeMemberIds))
      .sort((x, y) => x.queuedAt - y.queuedAt);
    for (const candidate of candidates) {
      if ((await this.redis.hdel(k, candidate.leaderCharacterId)) === 1) return candidate;
    }
    return null;
  }
}

/** In-memory fronta pro testy / běh bez Redisu. */
@Injectable()
export class InMemoryTeamArenaQueue implements TeamArenaQueue {
  private readonly queues = new Map<string, Map<string, TeamQueueEntry>>();

  private map(bracket: ArenaBracket, seasonId: string): Map<string, TeamQueueEntry> {
    const k = key(bracket, seasonId);
    let m = this.queues.get(k);
    if (!m) {
      m = new Map();
      this.queues.set(k, m);
    }
    return m;
  }

  enqueue(bracket: ArenaBracket, seasonId: string, team: TeamQueueEntry): Promise<void> {
    this.map(bracket, seasonId).set(team.leaderCharacterId, team);
    return Promise.resolve();
  }

  remove(bracket: ArenaBracket, seasonId: string, leaderCharacterId: string): Promise<void> {
    this.map(bracket, seasonId).delete(leaderCharacterId);
    return Promise.resolve();
  }

  isLeaderQueued(bracket: ArenaBracket, seasonId: string, leaderCharacterId: string): Promise<boolean> {
    return Promise.resolve(this.map(bracket, seasonId).has(leaderCharacterId));
  }

  isMemberQueued(bracket: ArenaBracket, seasonId: string, characterId: string): Promise<boolean> {
    for (const team of this.map(bracket, seasonId).values()) {
      if (team.members.some((m) => m.characterId === characterId)) return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  takeOpponent(
    bracket: ArenaBracket,
    seasonId: string,
    excludeLeaderId: string,
    excludeMemberIds: string[],
  ): Promise<TeamQueueEntry | null> {
    const m = this.map(bracket, seasonId);
    const candidate = [...m.values()]
      .filter((t) => t.leaderCharacterId !== excludeLeaderId && !overlaps(t, excludeMemberIds))
      .sort((x, y) => x.queuedAt - y.queuedAt)[0];
    if (!candidate) return Promise.resolve(null);
    m.delete(candidate.leaderCharacterId);
    return Promise.resolve(candidate);
  }
}
