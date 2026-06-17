import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { npcAuctionPurchases, type NpcAuctionPurchase } from '../db/schema';

/**
 * Evidence nákupů NPC listingů (M10+ „živá aukce"). NPC nabídky samy se
 * negenerují do DB (deterministicky z okna), tady jen sledujeme provedené nákupy
 * kvůli deduplikaci a skrytí koupených listingů z výpisu.
 */
@Injectable()
export class NpcAuctionRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Které z `listingIds` už daná postava koupila (pro skrytí ve výpisu). */
  async purchasedFrom(characterId: string, listingIds: string[]): Promise<Set<string>> {
    if (listingIds.length === 0) return new Set();
    const rows = await this.db
      .select({ listingId: npcAuctionPurchases.listingId })
      .from(npcAuctionPurchases)
      .where(
        and(
          eq(npcAuctionPurchases.characterId, characterId),
          inArray(npcAuctionPurchases.listingId, listingIds),
        ),
      );
    return new Set(rows.map((r) => r.listingId));
  }

  /**
   * Atomicky zaeviduje nákup. Vrací `true` při úspěchu, `false` pokud už listing
   * tato postava koupila (unique konflikt → ochrana proti dvojímu nákupu v závodu).
   */
  async recordPurchase(data: {
    characterId: string;
    listingId: string;
    itemId: string;
    quantity: number;
    price: number;
  }): Promise<boolean> {
    const inserted = await this.db
      .insert(npcAuctionPurchases)
      .values(data)
      .onConflictDoNothing({
        target: [npcAuctionPurchases.characterId, npcAuctionPurchases.listingId],
      })
      .returning({ id: npcAuctionPurchases.id });
    return inserted.length > 0;
  }

  /** Pro testy/diagnostiku. */
  listForCharacter(characterId: string): Promise<NpcAuctionPurchase[]> {
    return this.db
      .select()
      .from(npcAuctionPurchases)
      .where(eq(npcAuctionPurchases.characterId, characterId));
  }
}
