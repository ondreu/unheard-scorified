import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { loadConfig } from '../config/config';

/**
 * Plánovač dokončení idle aktivit (BullMQ). Job „nastane" v čase dokončení
 * i bez hráče — hook pro odměny/push notifikace (push až M3). Odměny samotné
 * se ale počítají LAZY při claimu (jediný zdroj pravdy), takže scheduler je
 * best-effort: když Redis neběží, aktivita stále funguje přes lazy dopočet.
 *
 * Viz docs/adr/0002 (idle model) a 0006 (aktivity/questing).
 */
export const ACTIVITY_SCHEDULER = Symbol('ACTIVITY_SCHEDULER');

export interface ActivityScheduler {
  /** Naplánuje job na dokončení aktivity za `delayMs`. */
  schedule(activityId: string, characterId: string, delayMs: number): Promise<void>;
  /** Zruší naplánovaný job (po claimu / zrušení aktivity). */
  cancel(activityId: string): Promise<void>;
}

export interface ActivityCompletionJob {
  activityId: string;
  characterId: string;
}

const QUEUE_NAME = 'activity-completion';

@Injectable()
export class BullMqActivityScheduler implements ActivityScheduler, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BullMqActivityScheduler.name);
  private queue?: Queue<ActivityCompletionJob>;
  private worker?: Worker<ActivityCompletionJob>;

  onModuleInit(): void {
    // BullMQ si spravuje vlastní Redis connection; předáme jen options odvozené
    // z redisUrl (maxRetriesPerRequest: null je pro BullMQ povinné).
    const connection = parseRedisConnection(loadConfig().redisUrl);

    this.queue = new Queue<ActivityCompletionJob>(QUEUE_NAME, { connection });

    this.worker = new Worker<ActivityCompletionJob>(
      QUEUE_NAME,
      (job) => {
        // M2: jen log; M3 zde vznikne push notifikace „aktivita dokončena".
        this.logger.log(
          `Aktivita dokončena: ${job.data.activityId} (char ${job.data.characterId})`,
        );
        return Promise.resolve();
      },
      { connection },
    );
    this.worker.on('error', (err) => this.logger.warn(`BullMQ worker: ${err.message}`));
  }

  async schedule(activityId: string, characterId: string, delayMs: number): Promise<void> {
    try {
      await this.queue?.add(
        'complete',
        { activityId, characterId },
        {
          jobId: activityId,
          delay: Math.max(0, delayMs),
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    } catch (err) {
      this.logger.warn(`schedule selhal (lazy dopočet stále funguje): ${(err as Error).message}`);
    }
  }

  async cancel(activityId: string): Promise<void> {
    try {
      await this.queue?.remove(activityId);
    } catch (err) {
      this.logger.warn(`cancel selhal: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}

/** Odvodí BullMQ connection options z redis URL. */
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

/** No-op scheduler (testy / běh bez Redisu). */
@Injectable()
export class NoopActivityScheduler implements ActivityScheduler {
  schedule(): Promise<void> {
    return Promise.resolve();
  }
  cancel(): Promise<void> {
    return Promise.resolve();
  }
}
