import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { RaidActor, RaidRole } from '@game/shared';
import { REDIS } from '../redis/redis.module';

/**
 * Raid matchmaking fronta (M8). Idle-first jako arena: hráč se zařadí pro daný
 * raid v konkrétní roli a uloží se SNAPSHOT jeho `RaidActor`. Když jiný hráč raid
 * spustí (`enter`), vytáhne čekající hráče pro chybějící role; zbytek doplní NPC
 * (backfill) → raid jde vyřešit i s málo hráči. Atomické „nárokování" přes HDEL
 * brání dvojímu zařazení mezi instancemi (jako arena).
 *
 * Abstrahováno za rozhraní → Redis impl (sdílená napříč instancemi) + in-memory
 * impl pro testy.
 */
export const RAID_QUEUE = Symbol('RAID_QUEUE');

export interface RaidQueueEntry {
  characterId: string;
  accountId: string;
  name: string;
  role: RaidRole;
  snapshot: RaidActor;
  queuedAt: number;
}

export interface RaidQueue {
  enqueue(raidId: string, entry: RaidQueueEntry): Promise<void>;
  remove(raidId: string, characterId: string): Promise<void>;
  isQueued(raidId: string, characterId: string): Promise<boolean>;
  /** Role, ve které postava čeká (nebo null). */
  queuedRole(raidId: string, characterId: string): Promise<RaidRole | null>;
  /** Atomicky vybere a odebere čekajícího hráče dané role (jiného než exclude). */
  takeByRole(raidId: string, role: RaidRole, excludeCharacterId: string): Promise<RaidQueueEntry | null>;
}

function key(raidId: string): string {
  return `raid:queue:${raidId}`;
}

const QUEUE_TTL_SEC = 24 * 60 * 60;

@Injectable()
export class RedisRaidQueue implements RaidQueue {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async enqueue(raidId: string, entry: RaidQueueEntry): Promise<void> {
    const k = key(raidId);
    await this.redis.hset(k, entry.characterId, JSON.stringify(entry));
    await this.redis.expire(k, QUEUE_TTL_SEC);
  }

  async remove(raidId: string, characterId: string): Promise<void> {
    await this.redis.hdel(key(raidId), characterId);
  }

  async isQueued(raidId: string, characterId: string): Promise<boolean> {
    return (await this.redis.hexists(key(raidId), characterId)) === 1;
  }

  async queuedRole(raidId: string, characterId: string): Promise<RaidRole | null> {
    const raw = await this.redis.hget(key(raidId), characterId);
    return raw ? (JSON.parse(raw) as RaidQueueEntry).role : null;
  }

  async takeByRole(
    raidId: string,
    role: RaidRole,
    excludeCharacterId: string,
  ): Promise<RaidQueueEntry | null> {
    const k = key(raidId);
    const all = await this.redis.hgetall(k);
    const candidates = Object.entries(all)
      .map(([, raw]) => JSON.parse(raw) as RaidQueueEntry)
      .filter((e) => e.characterId !== excludeCharacterId && e.role === role)
      .sort((x, y) => x.queuedAt - y.queuedAt);

    for (const candidate of candidates) {
      const removed = await this.redis.hdel(k, candidate.characterId);
      if (removed === 1) return candidate;
    }
    return null;
  }
}

/** In-memory fronta pro testy / běh bez Redisu. */
@Injectable()
export class InMemoryRaidQueue implements RaidQueue {
  private readonly queues = new Map<string, Map<string, RaidQueueEntry>>();

  private map(raidId: string): Map<string, RaidQueueEntry> {
    let m = this.queues.get(raidId);
    if (!m) {
      m = new Map();
      this.queues.set(raidId, m);
    }
    return m;
  }

  enqueue(raidId: string, entry: RaidQueueEntry): Promise<void> {
    this.map(raidId).set(entry.characterId, entry);
    return Promise.resolve();
  }

  remove(raidId: string, characterId: string): Promise<void> {
    this.map(raidId).delete(characterId);
    return Promise.resolve();
  }

  isQueued(raidId: string, characterId: string): Promise<boolean> {
    return Promise.resolve(this.map(raidId).has(characterId));
  }

  queuedRole(raidId: string, characterId: string): Promise<RaidRole | null> {
    return Promise.resolve(this.map(raidId).get(characterId)?.role ?? null);
  }

  takeByRole(
    raidId: string,
    role: RaidRole,
    excludeCharacterId: string,
  ): Promise<RaidQueueEntry | null> {
    const m = this.map(raidId);
    const candidate = [...m.values()]
      .filter((e) => e.characterId !== excludeCharacterId && e.role === role)
      .sort((x, y) => x.queuedAt - y.queuedAt)[0];
    if (!candidate) return Promise.resolve(null);
    m.delete(candidate.characterId);
    return Promise.resolve(candidate);
  }
}
