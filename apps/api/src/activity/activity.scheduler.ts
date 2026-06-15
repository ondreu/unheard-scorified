import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import {
  DUNGEONS,
  QUESTS,
  type DungeonActivityParams,
  type QuestActivityParams,
} from '@game/shared';
import { loadConfig } from '../config/config';
import { CharacterRepository } from '../character/character.repository';
import { PushService } from '../push/push.service';
import { ActivityRepository } from './activity.repository';

/**
 * Plánovač dokončení idle aktivit (BullMQ). Job „nastane" v čase dokončení
 * i bez hráče — odesílá push notifikaci (M3). Odměny samotné se počítají
 * LAZY při claimu (jediný zdroj pravdy), takže scheduler je best-effort:
 * když Redis neběží, aktivita stále funguje přes lazy dopočet.
 *
 * Viz docs/adr/0002 (idle model), 0006 (aktivity/questing), 0007 (push).
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

  constructor(
    private readonly characters: CharacterRepository,
    private readonly activities: ActivityRepository,
    private readonly push: PushService,
  ) {}

  onModuleInit(): void {
    // BullMQ si spravuje vlastní Redis connection; předáme jen options odvozené
    // z redisUrl (maxRetriesPerRequest: null je pro BullMQ povinné).
    const connection = parseRedisConnection(loadConfig().redisUrl);

    this.queue = new Queue<ActivityCompletionJob>(QUEUE_NAME, { connection });

    this.worker = new Worker<ActivityCompletionJob>(
      QUEUE_NAME,
      (job) => this.processJob(job.data),
      { connection },
    );
    this.worker.on('error', (err) => this.logger.warn(`BullMQ worker: ${err.message}`));
  }

  private async processJob(data: ActivityCompletionJob): Promise<void> {
    this.logger.log(`Aktivita dokončena: ${data.activityId} (char ${data.characterId})`);

    const character = await this.characters.findById(data.characterId);
    if (!character) return;

    // Aktivita mohla být mezidoby claimnutá — pak není co notifikovat.
    const activity = await this.activities.findByCharacter(data.characterId);
    if (!activity) return;

    const { title, body } =
      activity.activityType === 'dungeon'
        ? {
            title: 'Dungeon Complete!',
            body: `${character.name} has cleared "${
              DUNGEONS[(activity.params as DungeonActivityParams).dungeonId]?.name ?? 'the dungeon'
            }". Return to claim your loot.`,
          }
        : {
            title: 'Quest Complete!',
            body: `${character.name} has finished "${
              QUESTS[(activity.params as QuestActivityParams).questId]?.name ?? 'your quest'
            }". Return to claim your rewards.`,
          };

    await this.push.sendToAccount(character.accountId, {
      title,
      body,
      characterId: character.id,
    });
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
