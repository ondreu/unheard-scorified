import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module';

/**
 * Online presence postav (M9 chat overhaul). Sleduje, které postavy mají aktivní
 * WS spojení (otevřená appka) → zelená tečka u přátel + „online" stav pro whisper.
 *
 * Refcount model: jedna postava může mít víc otevřených socketů (víc záložek,
 * reconnect). `join`/`leave` inkrementují/dekrementují čítač; postava je online,
 * dokud je čítač > 0. `join`/`leave` vrací, zda došlo k **přechodu** (0→1 / 1→0),
 * aby gateway poslala přátelům realtime presence event jen při reálné změně.
 *
 * Abstrahováno za rozhraní → Redis impl pro produkci (sdílený stav napříč
 * instancemi, viz ADR 0010 multi-instance), in-memory pro testy/běh bez Redisu.
 * Stejný vzor jako `MatchmakingQueue`.
 */
export const PRESENCE_STORE = Symbol('PRESENCE_STORE');

export interface PresenceStore {
  /** Zaregistruje spojení postavy. Vrací true, pokud přešla z offline na online. */
  join(characterId: string): Promise<boolean>;
  /** Odregistruje spojení. Vrací true, pokud přešla z online na offline. */
  leave(characterId: string): Promise<boolean>;
  /** Je postava právě online? */
  isOnline(characterId: string): Promise<boolean>;
  /** Z daných postav vrátí množinu těch online (jeden dotaz, pro výpis přátel). */
  filterOnline(characterIds: string[]): Promise<Set<string>>;
}

function key(characterId: string): string {
  return `presence:char:${characterId}`;
}

/**
 * TTL čítače (s) — pojistka proti „leaknutým" online stavům při pádu instance
 * (clean disconnect dekrementuje, crash ne). Obnovuje se při každém `join`.
 */
const PRESENCE_TTL_SEC = 12 * 60 * 60;

@Injectable()
export class RedisPresenceStore implements PresenceStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async join(characterId: string): Promise<boolean> {
    const k = key(characterId);
    const n = await this.redis.incr(k);
    await this.redis.expire(k, PRESENCE_TTL_SEC);
    return n === 1;
  }

  async leave(characterId: string): Promise<boolean> {
    const k = key(characterId);
    const n = await this.redis.decr(k);
    if (n <= 0) {
      await this.redis.del(k);
      return true;
    }
    return false;
  }

  async isOnline(characterId: string): Promise<boolean> {
    const v = await this.redis.get(key(characterId));
    return v !== null && Number(v) > 0;
  }

  async filterOnline(characterIds: string[]): Promise<Set<string>> {
    if (characterIds.length === 0) return new Set();
    const values = await this.redis.mget(characterIds.map(key));
    const online = new Set<string>();
    characterIds.forEach((id, i) => {
      const v = values[i];
      if (v !== null && v !== undefined && Number(v) > 0) online.add(id);
    });
    return online;
  }
}

/** In-memory presence pro testy / běh bez Redisu (jedno-instanční). */
@Injectable()
export class InMemoryPresenceStore implements PresenceStore {
  private readonly counts = new Map<string, number>();

  join(characterId: string): Promise<boolean> {
    const n = (this.counts.get(characterId) ?? 0) + 1;
    this.counts.set(characterId, n);
    return Promise.resolve(n === 1);
  }

  leave(characterId: string): Promise<boolean> {
    const n = (this.counts.get(characterId) ?? 0) - 1;
    if (n <= 0) {
      this.counts.delete(characterId);
      return Promise.resolve(true);
    }
    this.counts.set(characterId, n);
    return Promise.resolve(false);
  }

  isOnline(characterId: string): Promise<boolean> {
    return Promise.resolve((this.counts.get(characterId) ?? 0) > 0);
  }

  filterOnline(characterIds: string[]): Promise<Set<string>> {
    return Promise.resolve(new Set(characterIds.filter((id) => (this.counts.get(id) ?? 0) > 0)));
  }
}
