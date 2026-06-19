import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit, forwardRef } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { loadConfig } from '../config/config';
import { DungeonPartyService } from './dungeon-party.service';

/**
 * Plánovač deadlinů kol živého MP tahového sezení (ADR 0038, Slice 4c). Job
 * „nastane" v čase deadlinu i bez hráče → server vyhodnotí kolo s **AI
 * fallbackem** za nečinné (idle-friendly). Best-effort: když Redis neběží,
 * deadline doženou REST cesty (`getRun`/`submit` → `progressOverdue`).
 *
 * Viz `BullMqActivityScheduler` (stejný vzor), ADR 0002/0007.
 */
export const DUNGEON_PARTY_SCHEDULER = Symbol('DUNGEON_PARTY_SCHEDULER');

export interface DungeonPartyScheduler {
  /** Naplánuje vyhodnocení deadlinu runu za `delayMs`. */
  schedule(runId: string, delayMs: number): Promise<void>;
  /** Zruší naplánovaný deadline (po ukončení runu). */
  cancel(runId: string): Promise<void>;
}

interface DeadlineJob {
  runId: string;
}

const QUEUE_NAME = 'dungeon-party-deadline';

@Injectable()
export class BullMqDungeonPartyScheduler
  implements DungeonPartyScheduler, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BullMqDungeonPartyScheduler.name);
  private queue?: Queue<DeadlineJob>;
  private worker?: Worker<DeadlineJob>;

  constructor(
    // forwardRef: service závisí na scheduleru (schedule) a scheduler na service
    // (tickDeadline) → cyklus rozbitý lazy injekcí.
    @Inject(forwardRef(() => DungeonPartyService))
    private readonly party: DungeonPartyService,
  ) {}

  onModuleInit(): void {
    const connection = parseRedisConnection(loadConfig().redisUrl);
    this.queue = new Queue<DeadlineJob>(QUEUE_NAME, { connection });
    this.worker = new Worker<DeadlineJob>(QUEUE_NAME, (job) => this.party.tickDeadline(job.data.runId), {
      connection,
    });
    this.worker.on('error', (err) => this.logger.warn(`BullMQ worker: ${err.message}`));
  }

  async schedule(runId: string, delayMs: number): Promise<void> {
    try {
      await this.queue?.add(
        'deadline',
        { runId },
        { jobId: `party-deadline:${runId}`, delay: Math.max(0, delayMs), removeOnComplete: true, removeOnFail: true },
      );
    } catch (err) {
      this.logger.warn(`schedule selhal (REST fallback stále funguje): ${(err as Error).message}`);
    }
  }

  async cancel(runId: string): Promise<void> {
    try {
      await this.queue?.remove(`party-deadline:${runId}`);
    } catch (err) {
      this.logger.warn(`cancel selhal: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}

function parseRedisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: url.username } : {}),
    ...(url.password ? { password: url.password } : {}),
    maxRetriesPerRequest: null,
  };
}

/** No-op scheduler (testy / běh bez Redisu) — deadliny doženou REST cesty. */
@Injectable()
export class NoopDungeonPartyScheduler implements DungeonPartyScheduler {
  schedule(): Promise<void> {
    return Promise.resolve();
  }
  cancel(): Promise<void> {
    return Promise.resolve();
  }
}
