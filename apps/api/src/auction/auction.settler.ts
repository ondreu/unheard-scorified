import { Injectable, Logger } from '@nestjs/common';
import { itemDisplayName, sellerProceeds } from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { PushService } from '../push/push.service';
import type { Auction } from '../db/schema';
import { AuctionRepository } from './auction.repository';

const SETTLE_BATCH = 50;

/**
 * Vypořádání aukcí (M8). Sdílené `AuctionService` (lazy při čtení = zdroj pravdy)
 * i `BullMqAuctionScheduler` (best-effort job na expiraci). Oddělený provider →
 * žádný DI cyklus service↔scheduler (vzor jako ArenaEventsRelay).
 *
 * Idempotence: `settle()` v repository je atomický (where status='active'), takže
 * souběh lazy čtení a BullMQ jobu nikdy nevypořádá aukci dvakrát.
 */
@Injectable()
export class AuctionSettler {
  private readonly logger = new Logger(AuctionSettler.name);

  constructor(
    private readonly repo: AuctionRepository,
    private readonly characters: CharacterRepository,
    private readonly inventory: InventoryRepository,
    private readonly push: PushService,
  ) {}

  /** Vypořádá konkrétní aukci, je-li po expiraci a stále aktivní. */
  async settleAuction(auctionId: string, now = Date.now()): Promise<void> {
    const auction = await this.repo.findById(auctionId);
    if (!auction || auction.status !== 'active') return;
    if (now < auction.endsAt.getTime()) return;
    await this.resolve(auction);
  }

  /** Dohledá a vypořádá všechny aukce po expiraci (lazy batch při čtení). */
  async settleDue(now = Date.now()): Promise<void> {
    const due = await this.repo.listDueActive(new Date(now), SETTLE_BATCH);
    for (const auction of due) await this.resolve(auction);
  }

  /**
   * Okamžitý prodej (buyout). Kupec už zlato zaplatil v service; tady jen
   * atomicky uzavřeme aukci, doručíme item a vyplatíme prodejce. Vrací true při
   * úspěchu (false = aukce už byla mezitím vypořádána).
   */
  async sellTo(
    auction: Auction,
    buyerCharacterId: string,
    price: number,
  ): Promise<boolean> {
    const settled = await this.repo.settle(auction.id, 'sold', buyerCharacterId, price);
    if (!settled) return false;
    await this.inventory.addItemQty(buyerCharacterId, auction.itemId, auction.quantity);
    await this.characters.addGold(auction.sellerCharacterId, sellerProceeds(price) + auction.deposit);
    await this.notify(
      auction.sellerAccountId,
      auction.sellerCharacterId,
      'Auction Sold!',
      `Your ${auction.quantity}× ${itemDisplayName(auction.itemId)} sold for ${price} gold.`,
    );
    return true;
  }

  private async resolve(auction: Auction): Promise<void> {
    const itemName = itemDisplayName(auction.itemId);
    if (auction.currentBid !== null && auction.bidderCharacterId !== null) {
      // Prodej nejvyššímu dražiteli (ten už zaplatil escrow při bidu).
      const settled = await this.repo.settle(
        auction.id,
        'sold',
        auction.bidderCharacterId,
        auction.currentBid,
      );
      if (!settled) return; // už vypořádáno jinde
      await this.inventory.addItemQty(auction.bidderCharacterId, auction.itemId, auction.quantity);
      await this.characters.addGold(
        auction.sellerCharacterId,
        sellerProceeds(auction.currentBid) + auction.deposit,
      );
      await this.notify(
        auction.sellerAccountId,
        auction.sellerCharacterId,
        'Auction Sold!',
        `Your ${auction.quantity}× ${itemName} sold for ${auction.currentBid} gold.`,
      );
      if (auction.bidderAccountId) {
        await this.notify(
          auction.bidderAccountId,
          auction.bidderCharacterId,
          'Auction Won!',
          `You won ${auction.quantity}× ${itemName} for ${auction.currentBid} gold.`,
        );
      }
    } else {
      // Expirace bez nabídky: item zpět prodejci, deposit propadá (sink).
      const settled = await this.repo.settle(auction.id, 'expired', null, null);
      if (!settled) return;
      await this.inventory.addItemQty(auction.sellerCharacterId, auction.itemId, auction.quantity);
      await this.notify(
        auction.sellerAccountId,
        auction.sellerCharacterId,
        'Auction Expired',
        `Your ${auction.quantity}× ${itemName} did not sell and has been returned.`,
      );
    }
  }

  private async notify(
    accountId: string,
    characterId: string,
    title: string,
    body: string,
  ): Promise<void> {
    await this.push.sendToAccount(accountId, { title, body, characterId });
  }
}
