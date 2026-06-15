import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { ArenaBracket } from '@game/shared';
import { REDIS } from '../redis/redis.module';

/**
 * Žebříček ratingu (M7) přes Redis sorted set (score = rating, member =
 * characterId). Redis je rychlá cache pro top-N a rank; durable zdroj pravdy
 * zůstává `arena_ratings` v Postgresu (ArenaService dělá fallback na DB, když je
 * Redis prázdný/nedostupný). Abstrahováno za rozhraní kvůli testům (in-memory).
 */
export const ARENA_LEADERBOARD = Symbol('ARENA_LEADERBOARD');

export interface LeaderboardEntry {
  characterId: string;
  rating: number;
  rank: number;
}

export interface ArenaLeaderboard {
  /** Zapíše/aktualizuje rating postavy. */
  setRating(seasonId: string, bracket: ArenaBracket, characterId: string, rating: number): Promise<void>;
  /** Top-N postav (sestupně dle ratingu) nebo prázdné, není-li cache k dispozici. */
  top(seasonId: string, bracket: ArenaBracket, limit: number): Promise<LeaderboardEntry[]>;
  /** Rank postavy (1-based) nebo `null`, není-li v cache. */
  rank(seasonId: string, bracket: ArenaBracket, characterId: string): Promise<number | null>;
}

function key(seasonId: string, bracket: ArenaBracket): string {
  return `arena:lb:${seasonId}:${bracket}`;
}

@Injectable()
export class RedisArenaLeaderboard implements ArenaLeaderboard {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async setRating(
    seasonId: string,
    bracket: ArenaBracket,
    characterId: string,
    rating: number,
  ): Promise<void> {
    await this.redis.zadd(key(seasonId, bracket), rating, characterId);
  }

  async top(seasonId: string, bracket: ArenaBracket, limit: number): Promise<LeaderboardEntry[]> {
    // ZREVRANGE … WITHSCORES → [member, score, member, score, …] sestupně.
    const raw = await this.redis.zrevrange(key(seasonId, bracket), 0, limit - 1, 'WITHSCORES');
    const entries: LeaderboardEntry[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      entries.push({ characterId: raw[i]!, rating: Number(raw[i + 1]), rank: i / 2 + 1 });
    }
    return entries;
  }

  async rank(seasonId: string, bracket: ArenaBracket, characterId: string): Promise<number | null> {
    const r = await this.redis.zrevrank(key(seasonId, bracket), characterId);
    return r === null ? null : r + 1;
  }
}

/** In-memory žebříček pro testy / běh bez Redisu. */
@Injectable()
export class InMemoryArenaLeaderboard implements ArenaLeaderboard {
  private readonly boards = new Map<string, Map<string, number>>();

  private board(seasonId: string, bracket: ArenaBracket): Map<string, number> {
    const k = key(seasonId, bracket);
    let b = this.boards.get(k);
    if (!b) {
      b = new Map();
      this.boards.set(k, b);
    }
    return b;
  }

  private sorted(seasonId: string, bracket: ArenaBracket): [string, number][] {
    return [...this.board(seasonId, bracket).entries()].sort((a, b) => b[1] - a[1]);
  }

  setRating(
    seasonId: string,
    bracket: ArenaBracket,
    characterId: string,
    rating: number,
  ): Promise<void> {
    this.board(seasonId, bracket).set(characterId, rating);
    return Promise.resolve();
  }

  top(seasonId: string, bracket: ArenaBracket, limit: number): Promise<LeaderboardEntry[]> {
    return Promise.resolve(
      this.sorted(seasonId, bracket)
        .slice(0, limit)
        .map(([characterId, rating], i) => ({ characterId, rating, rank: i + 1 })),
    );
  }

  rank(seasonId: string, bracket: ArenaBracket, characterId: string): Promise<number | null> {
    const idx = this.sorted(seasonId, bracket).findIndex(([id]) => id === characterId);
    return Promise.resolve(idx === -1 ? null : idx + 1);
  }
}
