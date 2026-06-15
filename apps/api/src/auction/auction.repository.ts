import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, lte, or, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { auctions, type Auction, type NewAuction } from '../db/schema';
import type { AuctionStatus } from '@game/shared';

@Injectable()
export class AuctionRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(data: NewAuction): Promise<Auction> {
    const [row] = await this.db.insert(auctions).values(data).returning();
    return row!;
  }

  async findById(id: string): Promise<Auction | undefined> {
    const [row] = await this.db.select().from(auctions).where(eq(auctions.id, id)).limit(1);
    return row;
  }

  /** Aktivní výpisy (browse), nejdřív končící; volitelně filtr na item. */
  listActive(limit: number, itemId?: string): Promise<Auction[]> {
    const cond = itemId
      ? and(eq(auctions.status, 'active'), eq(auctions.itemId, itemId))
      : eq(auctions.status, 'active');
    return this.db.select().from(auctions).where(cond).orderBy(asc(auctions.endsAt)).limit(limit);
  }

  /** Aktivní výpisy po expiraci (`endsAt <= now`) — k lazy vypořádání. */
  listDueActive(now: Date, limit: number): Promise<Auction[]> {
    return this.db
      .select()
      .from(auctions)
      .where(and(eq(auctions.status, 'active'), lte(auctions.endsAt, now)))
      .orderBy(asc(auctions.endsAt))
      .limit(limit);
  }

  /** Výpisy postavy (jako prodejce nebo aktuální dražitel), nejnovější první. */
  listForCharacter(characterId: string, limit: number): Promise<Auction[]> {
    return this.db
      .select()
      .from(auctions)
      .where(
        or(eq(auctions.sellerCharacterId, characterId), eq(auctions.bidderCharacterId, characterId)),
      )
      .orderBy(desc(auctions.createdAt))
      .limit(limit);
  }

  async setBid(
    id: string,
    currentBid: number,
    bidderCharacterId: string,
    bidderAccountId: string,
  ): Promise<Auction> {
    const [row] = await this.db
      .update(auctions)
      .set({ currentBid, bidderCharacterId, bidderAccountId })
      .where(eq(auctions.id, id))
      .returning();
    return row!;
  }

  /**
   * Atomicky vypořádá aukci (jen pokud je dosud `active`) — PK/where brání
   * dvojímu vypořádání mezi lazy čtením a BullMQ jobem (idempotence).
   */
  async settle(
    id: string,
    status: AuctionStatus,
    winnerCharacterId: string | null,
    finalPrice: number | null,
  ): Promise<Auction | undefined> {
    const [row] = await this.db
      .update(auctions)
      .set({ status, winnerCharacterId, finalPrice, settledAt: new Date() })
      .where(and(eq(auctions.id, id), eq(auctions.status, 'active')))
      .returning();
    return row;
  }

  /** Počet aktivních výpisů (pro UI/limity). */
  async countActiveForSeller(characterId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(auctions)
      .where(and(eq(auctions.sellerCharacterId, characterId), eq(auctions.status, 'active')));
    return row?.count ?? 0;
  }
}
