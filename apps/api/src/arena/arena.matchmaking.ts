import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { ArenaBracket, CombatActor } from '@game/shared';
import { REDIS } from '../redis/redis.module';

/**
 * Matchmaking fronta (M7). Idle-first model: hráč se zařadí do fronty a uloží se
 * SNAPSHOT jeho bojového profilu (anti-cheat + determinismus). Když přijde další
 * hráč, server spáruje proti čekajícímu snapshotu — i když je první hráč offline.
 *
 * Abstrahováno za rozhraní → Redis impl pro produkci (sdílená fronta napříč
 * instancemi), in-memory impl pro testy (bez Redisu). Viz ActivityScheduler.
 */
export const MATCHMAKING_QUEUE = Symbol('MATCHMAKING_QUEUE');

/** Čekající záznam ve frontě (snapshot pořízený při zařazení). */
export interface QueueEntry {
  characterId: string;
  accountId: string;
  name: string;
  rating: number;
  snapshot: CombatActor;
  queuedAt: number;
}

export interface MatchmakingQueue {
  /** Zařadí (nebo obnoví) postavu do fronty daného bracketu/sezóny. */
  enqueue(bracket: ArenaBracket, seasonId: string, entry: QueueEntry): Promise<void>;
  /** Vyřadí postavu z fronty. */
  remove(bracket: ArenaBracket, seasonId: string, characterId: string): Promise<void>;
  /** Je postava ve frontě? */
  isQueued(bracket: ArenaBracket, seasonId: string, characterId: string): Promise<boolean>;
  /**
   * Atomicky vybere a odebere vhodného soupeře (jiného než `excludeCharacterId`).
   * MVP: nejdéle čekající soupeř (rating-blind, malá hráčská základna). Vrací
   * `null`, není-li žádný k dispozici.
   */
  takeOpponent(
    bracket: ArenaBracket,
    seasonId: string,
    excludeCharacterId: string,
  ): Promise<QueueEntry | null>;
}

function key(bracket: ArenaBracket, seasonId: string): string {
  return `arena:queue:${seasonId}:${bracket}`;
}

/** TTL čekajícího záznamu (s) — zabraňuje hromadění zapomenutých snapshotů. */
const QUEUE_TTL_SEC = 24 * 60 * 60;

@Injectable()
export class RedisMatchmakingQueue implements MatchmakingQueue {
  private readonly logger = new Logger(RedisMatchmakingQueue.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async enqueue(bracket: ArenaBracket, seasonId: string, entry: QueueEntry): Promise<void> {
    const k = key(bracket, seasonId);
    await this.redis.hset(k, entry.characterId, JSON.stringify(entry));
    await this.redis.expire(k, QUEUE_TTL_SEC);
  }

  async remove(bracket: ArenaBracket, seasonId: string, characterId: string): Promise<void> {
    await this.redis.hdel(key(bracket, seasonId), characterId);
  }

  async isQueued(bracket: ArenaBracket, seasonId: string, characterId: string): Promise<boolean> {
    return (await this.redis.hexists(key(bracket, seasonId), characterId)) === 1;
  }

  async takeOpponent(
    bracket: ArenaBracket,
    seasonId: string,
    excludeCharacterId: string,
  ): Promise<QueueEntry | null> {
    const k = key(bracket, seasonId);
    const all = await this.redis.hgetall(k);
    const candidates = Object.entries(all)
      .filter(([id]) => id !== excludeCharacterId)
      .map(([, raw]) => JSON.parse(raw) as QueueEntry)
      .sort((x, y) => x.queuedAt - y.queuedAt);

    for (const candidate of candidates) {
      // Atomicky „nárokuj" soupeře: HDEL vrátí 1, jen pokud jsme ho odebrali my
      // (jiná instance ho mezitím nemohla vzít) → žádné dvojité párování.
      const removed = await this.redis.hdel(k, candidate.characterId);
      if (removed === 1) return candidate;
    }
    return null;
  }
}

/** In-memory fronta pro testy / běh bez Redisu (jedno-instanční). */
@Injectable()
export class InMemoryMatchmakingQueue implements MatchmakingQueue {
  private readonly queues = new Map<string, Map<string, QueueEntry>>();

  private map(bracket: ArenaBracket, seasonId: string): Map<string, QueueEntry> {
    const k = key(bracket, seasonId);
    let m = this.queues.get(k);
    if (!m) {
      m = new Map();
      this.queues.set(k, m);
    }
    return m;
  }

  enqueue(bracket: ArenaBracket, seasonId: string, entry: QueueEntry): Promise<void> {
    this.map(bracket, seasonId).set(entry.characterId, entry);
    return Promise.resolve();
  }

  remove(bracket: ArenaBracket, seasonId: string, characterId: string): Promise<void> {
    this.map(bracket, seasonId).delete(characterId);
    return Promise.resolve();
  }

  isQueued(bracket: ArenaBracket, seasonId: string, characterId: string): Promise<boolean> {
    return Promise.resolve(this.map(bracket, seasonId).has(characterId));
  }

  takeOpponent(
    bracket: ArenaBracket,
    seasonId: string,
    excludeCharacterId: string,
  ): Promise<QueueEntry | null> {
    const m = this.map(bracket, seasonId);
    const candidates = [...m.values()]
      .filter((e) => e.characterId !== excludeCharacterId)
      .sort((x, y) => x.queuedAt - y.queuedAt);
    const opponent = candidates[0];
    if (!opponent) return Promise.resolve(null);
    m.delete(opponent.characterId);
    return Promise.resolve(opponent);
  }
}
