import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import type { TradeSide } from '@game/shared';
import { DB, type Database } from '../db/db.module';
import { tradeItems, trades, type Trade, type TradeItem } from '../db/schema';

/**
 * Přístup k P2P trade tabulkám (M8.5-D). Stateless. Vyšší logika (potvrzení,
 * atomická výměna) je v `TradeService`.
 */
@Injectable()
export class TradeRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async createTrade(initiatorCharacterId: string, partnerCharacterId: string): Promise<Trade> {
    const [row] = await this.db
      .insert(trades)
      .values({ initiatorCharacterId, partnerCharacterId })
      .returning();
    return row!;
  }

  async findById(id: string): Promise<Trade | undefined> {
    const [row] = await this.db.select().from(trades).where(eq(trades.id, id)).limit(1);
    return row;
  }

  /** Otevřená trade session, kde je postava iniciátor nebo partner. */
  async findOpenForCharacter(characterId: string): Promise<Trade | undefined> {
    const [row] = await this.db
      .select()
      .from(trades)
      .where(
        and(
          eq(trades.status, 'open'),
          or(
            eq(trades.initiatorCharacterId, characterId),
            eq(trades.partnerCharacterId, characterId),
          ),
        ),
      )
      .limit(1);
    return row;
  }

  listItems(tradeId: string): Promise<TradeItem[]> {
    return this.db.select().from(tradeItems).where(eq(tradeItems.tradeId, tradeId));
  }

  /** Nahradí celou nabídku položek dané strany. */
  async replaceItems(
    tradeId: string,
    side: TradeSide,
    items: { itemId: string; quantity: number }[],
  ): Promise<void> {
    await this.db
      .delete(tradeItems)
      .where(and(eq(tradeItems.tradeId, tradeId), eq(tradeItems.side, side)));
    if (items.length > 0) {
      await this.db
        .insert(tradeItems)
        .values(items.map((i) => ({ tradeId, side, itemId: i.itemId, quantity: i.quantity })));
    }
  }

  async setGold(tradeId: string, side: TradeSide, gold: number): Promise<void> {
    await this.db
      .update(trades)
      .set(side === 'initiator' ? { initiatorGold: gold } : { partnerGold: gold })
      .where(eq(trades.id, tradeId));
  }

  async setConfirmed(tradeId: string, side: TradeSide, confirmed: boolean): Promise<void> {
    const val = confirmed ? 1 : 0;
    await this.db
      .update(trades)
      .set(side === 'initiator' ? { initiatorConfirmed: val } : { partnerConfirmed: val })
      .where(eq(trades.id, tradeId));
  }

  /** Resetuje potvrzení obou stran (po změně nabídky). */
  async resetConfirmations(tradeId: string): Promise<void> {
    await this.db
      .update(trades)
      .set({ initiatorConfirmed: 0, partnerConfirmed: 0 })
      .where(eq(trades.id, tradeId));
  }

  async setStatus(tradeId: string, status: 'completed' | 'cancelled'): Promise<void> {
    await this.db
      .update(trades)
      .set({ status, completedAt: new Date() })
      .where(eq(trades.id, tradeId));
  }
}
