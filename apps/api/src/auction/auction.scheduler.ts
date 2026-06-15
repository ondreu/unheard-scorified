import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { loadConfig } from '../config/config';
import { AuctionSettler } from './auction.settler';

/**
 * Plánovač expirace aukcí (BullMQ, M8). Job „nastane" v čase expirace i bez
 * hráče → vypořádá aukci přes `AuctionSettler` (prodej dražiteli / vrácení
 * prodejci) a pošle push. Best-effort: vypořádání je i tak LAZY při čtení
 * (zdroj pravdy), takže bez Redisu AH stále funguje. Vzor jako ActivityScheduler.
 */
export const AUCTION_SCHEDULER = Symbol('AUCTION_SCHEDULER');

export interface AuctionScheduler {
  /** Naplánuje vypořádání aukce na čas expirace (`delayMs`). */
  schedule(auctionId: string, delayMs: number): Promise<void>;
  /** Zruší naplánovaný job (po předčasném prodeji/zrušení). */
  cancel(auctionId: string): Promise<void>;
}

interface AuctionExpiryJob {
  auctionId: string;
}

const QUEUE_NAME = 'auction-expiry';

@Injectable()
export class BullMqAuctionScheduler implements AuctionScheduler, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BullMqAuctionScheduler.name);
  private queue?: Queue<AuctionExpiryJob>;
  private worker?: Worker<AuctionExpiryJob>;

  constructor(private readonly settler: AuctionSettler) {}

  onModuleInit(): void {
    const connection = parseRedisConnection(loadConfig().redisUrl);
    this.queue = new Queue<AuctionExpiryJob>(QUEUE_NAME, { connection });
    this.worker = new Worker<AuctionExpiryJob>(
      QUEUE_NAME,
      (job) => this.settler.settleAuction(job.data.auctionId),
      { connection },
    );
    this.worker.on('error', (err) => this.logger.warn(`BullMQ worker: ${err.message}`));
  }

  async schedule(auctionId: string, delayMs: number): Promise<void> {
    try {
      await this.queue?.add(
        'expire',
        { auctionId },
        { jobId: auctionId, delay: Math.max(0, delayMs), removeOnComplete: true, removeOnFail: true },
      );
    } catch (err) {
      this.logger.warn(`schedule selhal (lazy vypořádání stále funguje): ${(err as Error).message}`);
    }
  }

  async cancel(auctionId: string): Promise<void> {
    try {
      await this.queue?.remove(auctionId);
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

/** No-op scheduler (testy / běh bez Redisu) — vypořádání řeší lazy čtení. */
@Injectable()
export class NoopAuctionScheduler implements AuctionScheduler {
  schedule(): Promise<void> {
    return Promise.resolve();
  }
  cancel(): Promise<void> {
    return Promise.resolve();
  }
}
