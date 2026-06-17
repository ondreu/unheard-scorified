import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUCTION_DURATIONS,
  auctionDeposit,
  findNpcListing,
  generateNpcListings,
  isAuctionDurationId,
  isNpcListingId,
  isSoulbound,
  isTradeableItem,
  itemDisplayName,
  minNextBid,
  type AuctionDurationId,
  type AuctionStatus,
  type NpcListing,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryGrantService } from '../inventory/inventory-grant.service';
import type { Auction } from '../db/schema';
import { AuctionRepository } from './auction.repository';
import { NpcAuctionRepository } from './npc-auction.repository';
import { AuctionSettler } from './auction.settler';
import { AUCTION_SCHEDULER, type AuctionScheduler } from './auction.scheduler';

const BROWSE_LIMIT = 50;
const MY_LIMIT = 50;
const MAX_ACTIVE_LISTINGS = 20;

export interface AuctionView {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  sellerName: string;
  startBid: number;
  buyout: number | null;
  currentBid: number | null;
  /** Minimální přípustná příští nabídka. */
  minBid: number;
  deposit: number;
  status: AuctionStatus;
  endsAt: string;
  timeLeftSec: number;
  /** Vlastním výpisem postavy? */
  isMine: boolean;
  /** Postava je aktuální nejvyšší dražitel? */
  isMyBid: boolean;
  /** Seedovaný NPC listing (živá aukce) — jen buyout, nelze přihazovat. */
  isNpc: boolean;
}

export interface CreateListingInput {
  itemId: string;
  quantity: number;
  startBid: number;
  buyout?: number | null;
  duration: string;
}

/**
 * Auction House (M8, ekonomika). Hráčský obchod: buyout + bidding s depositem
 * (gold sink) a AH cut. Item se při výpisu escrowuje z inventáře, bid escrowuje
 * zlato. Vypořádání je LAZY při čtení (zdroj pravdy) + best-effort BullMQ job na
 * expiraci (`AuctionSettler`/`AuctionScheduler`). Viz ADR 0012.
 */
@Injectable()
export class AuctionService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly inventory: InventoryRepository,
    private readonly grant: InventoryGrantService,
    private readonly repo: AuctionRepository,
    private readonly npcRepo: NpcAuctionRepository,
    private readonly settler: AuctionSettler,
    @Inject(AUCTION_SCHEDULER) private readonly scheduler: AuctionScheduler,
  ) {}

  /**
   * Procházení aktivních výpisů (volitelně filtr na item). Vrací reálné hráčské
   * aukce + seedované **NPC listingy** (živá aukce), aby AH působil obydleně i
   * při malém počtu hráčů. NPC listingy už koupené touto postavou se skryjí.
   */
  async browse(accountId: string, characterId: string, itemId?: string): Promise<AuctionView[]> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    await this.settler.settleDue();
    const rows = await this.repo.listActive(BROWSE_LIMIT, itemId);
    const [real, npc] = await Promise.all([
      this.toViews(rows, characterId),
      this.npcViews(characterId, itemId),
    ]);
    return [...real, ...npc];
  }

  /** Výpisy postavy (prodej i nabídky), vč. již vypořádaných. */
  async myAuctions(accountId: string, characterId: string): Promise<AuctionView[]> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    await this.settler.settleDue();
    const rows = await this.repo.listForCharacter(characterId, MY_LIMIT);
    return this.toViews(rows, characterId);
  }

  /** Vypíše item z inventáře na aukci (escrow itemu + deposit gold sink). */
  async createListing(
    accountId: string,
    characterId: string,
    input: CreateListingInput,
  ): Promise<AuctionView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const quantity = Math.floor(input.quantity);
    const startBid = Math.floor(input.startBid);
    const buyout = input.buyout != null ? Math.floor(input.buyout) : null;

    if (!isTradeableItem(input.itemId)) throw new BadRequestException('Item cannot be auctioned');
    // Soulbound (BoP) loot je neprodejné na AH (M8.6).
    if (isSoulbound(input.itemId)) {
      throw new BadRequestException('Soulbound items cannot be auctioned');
    }
    if (!isAuctionDurationId(input.duration)) throw new BadRequestException('Invalid duration');
    if (quantity <= 0) throw new BadRequestException('Quantity must be positive');
    if (startBid <= 0) throw new BadRequestException('Start bid must be positive');
    if (buyout !== null && buyout < startBid) {
      throw new BadRequestException('Buyout must be at least the starting bid');
    }

    const active = await this.repo.countActiveForSeller(characterId);
    if (active >= MAX_ACTIVE_LISTINGS) {
      throw new ConflictException(`Too many active listings (max ${MAX_ACTIVE_LISTINGS})`);
    }

    const duration = input.duration as AuctionDurationId;
    const deposit = auctionDeposit(input.itemId, quantity, duration);

    // Nejdřív strhni deposit (atomicky), pak escrow item. Při nedostatku se nic
    // nezmění; při chybějícím itemu deposit vrátíme.
    if (!(await this.characters.spendGold(characterId, deposit))) {
      throw new BadRequestException(`Not enough gold for the ${deposit} gold deposit`);
    }
    const consumed = await this.inventory.consume(characterId, input.itemId, quantity);
    if (!consumed) {
      await this.characters.addGold(characterId, deposit); // refund deposit
      throw new BadRequestException('Not enough of that item in your inventory');
    }

    const now = Date.now();
    const endsAt = new Date(now + AUCTION_DURATIONS[duration].hours * 3600 * 1000);
    const auction = await this.repo.create({
      sellerCharacterId: characterId,
      sellerAccountId: accountId,
      itemId: input.itemId,
      quantity,
      startBid,
      buyout,
      deposit,
      duration,
      endsAt,
      status: 'active',
    });
    await this.scheduler.schedule(auction.id, endsAt.getTime() - now);
    return this.toView(auction, characterId);
  }

  /** Přihodí na aukci (escrow zlata kupce, vrácení předchozímu dražiteli). */
  async bid(
    accountId: string,
    characterId: string,
    auctionId: string,
    amount: number,
  ): Promise<AuctionView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    if (isNpcListingId(auctionId)) {
      throw new BadRequestException('NPC listings are buyout-only — use Buy Now');
    }
    await this.settler.settleAuction(auctionId);
    const auction = await this.repo.findById(auctionId);
    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status !== 'active') throw new BadRequestException('Auction is no longer active');
    if (auction.sellerCharacterId === characterId) {
      throw new ForbiddenException('You cannot bid on your own auction');
    }

    const bid = Math.floor(amount);
    const required = minNextBid(auction.startBid, auction.currentBid);
    if (bid < required) throw new BadRequestException(`Bid must be at least ${required}`);
    if (auction.buyout !== null && bid >= auction.buyout) {
      throw new BadRequestException('Bid meets buyout — use Buy Now instead');
    }

    // Escrow nového bidu; pak vrať předchozímu dražiteli.
    if (!(await this.characters.spendGold(characterId, bid))) {
      throw new BadRequestException('Not enough gold for this bid');
    }
    if (auction.bidderCharacterId !== null && auction.currentBid !== null) {
      await this.characters.addGold(auction.bidderCharacterId, auction.currentBid);
    }
    const updated = await this.repo.setBid(auction.id, bid, characterId, accountId);
    return this.toView(updated, characterId);
  }

  /** Okamžitý nákup za buyout cenu (reálná aukce nebo NPC listing). */
  async buyout(accountId: string, characterId: string, auctionId: string): Promise<AuctionView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    if (isNpcListingId(auctionId)) return this.buyNpcListing(characterId, auctionId);

    await this.settler.settleAuction(auctionId);
    const auction = await this.repo.findById(auctionId);
    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status !== 'active') throw new BadRequestException('Auction is no longer active');
    if (auction.sellerCharacterId === characterId) {
      throw new ForbiddenException('You cannot buy your own auction');
    }
    if (auction.buyout === null) throw new BadRequestException('This auction has no buyout');

    if (!(await this.characters.spendGold(characterId, auction.buyout))) {
      throw new BadRequestException('Not enough gold for buyout');
    }
    const sold = await this.settler.sellTo(auction, characterId, auction.buyout);
    if (!sold) {
      // Někdo vypořádal mezitím → vrať kupci zlato.
      await this.characters.addGold(characterId, auction.buyout);
      throw new ConflictException('Auction was just settled by someone else');
    }
    // Vrať předchozímu dražiteli jeho escrow.
    if (auction.bidderCharacterId !== null && auction.currentBid !== null) {
      await this.characters.addGold(auction.bidderCharacterId, auction.currentBid);
    }
    await this.scheduler.cancel(auction.id);
    const updated = await this.repo.findById(auctionId);
    return this.toView(updated!, characterId);
  }

  /** Zruší vlastní výpis (jen bez nabídek); item zpět, deposit propadá (sink). */
  async cancel(accountId: string, characterId: string, auctionId: string): Promise<AuctionView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const auction = await this.repo.findById(auctionId);
    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.sellerCharacterId !== characterId) {
      throw new ForbiddenException('Not your auction');
    }
    if (auction.status !== 'active') throw new BadRequestException('Auction is no longer active');
    if (auction.currentBid !== null) {
      throw new BadRequestException('Cannot cancel an auction that has bids');
    }

    const settled = await this.repo.settle(auction.id, 'cancelled', null, null);
    if (!settled) throw new ConflictException('Auction was just settled');
    await this.grant.grantOne(characterId, auction.itemId, auction.quantity);
    await this.scheduler.cancel(auction.id);
    const updated = await this.repo.findById(auctionId);
    return this.toView(updated!, characterId);
  }

  // ── NPC listings (živá aukce) ──────────────────────────────────────────────

  /** Aktuální NPC listingy (mimo už koupené touto postavou), volitelně filtr item. */
  private async npcViews(characterId: string, itemId?: string): Promise<AuctionView[]> {
    let listings = generateNpcListings(Date.now());
    if (itemId) listings = listings.filter((l) => l.itemId === itemId);
    const purchased = await this.npcRepo.purchasedFrom(
      characterId,
      listings.map((l) => l.id),
    );
    return listings.filter((l) => !purchased.has(l.id)).map((l) => this.npcToView(l));
  }

  /** Koupí NPC listing (čistý gold sink). Idempotentní proti dvojímu nákupu. */
  private async buyNpcListing(characterId: string, listingId: string): Promise<AuctionView> {
    const listing = findNpcListing(Date.now(), listingId);
    if (!listing) throw new NotFoundException('Listing is no longer available');

    const already = await this.npcRepo.purchasedFrom(characterId, [listingId]);
    if (already.has(listingId)) throw new ConflictException('You already bought this listing');

    if (!(await this.characters.spendGold(characterId, listing.buyout))) {
      throw new BadRequestException('Not enough gold for buyout');
    }
    // Zaeviduj nákup atomicky; při souběhu (dvojklik) vrať zlato.
    const recorded = await this.npcRepo.recordPurchase({
      characterId,
      listingId,
      itemId: listing.itemId,
      quantity: listing.quantity,
      price: listing.buyout,
    });
    if (!recorded) {
      await this.characters.addGold(characterId, listing.buyout);
      throw new ConflictException('You already bought this listing');
    }
    await this.grant.grantOne(characterId, listing.itemId, listing.quantity);
    return { ...this.npcToView(listing), status: 'sold' };
  }

  private npcToView(listing: NpcListing): AuctionView {
    const timeLeftSec = Math.max(0, Math.floor((listing.endsAt - Date.now()) / 1000));
    return {
      id: listing.id,
      itemId: listing.itemId,
      itemName: listing.itemName,
      quantity: listing.quantity,
      sellerName: listing.sellerName,
      startBid: listing.buyout,
      buyout: listing.buyout,
      currentBid: null,
      minBid: listing.buyout,
      deposit: 0,
      status: 'active',
      endsAt: new Date(listing.endsAt).toISOString(),
      timeLeftSec,
      isMine: false,
      isMyBid: false,
      isNpc: true,
    };
  }

  // ── Views ────────────────────────────────────────────────────────────────

  private async toViews(rows: Auction[], viewerId: string): Promise<AuctionView[]> {
    const sellerIds = [...new Set(rows.map((r) => r.sellerCharacterId))];
    const sellers = await this.characters.findByIds(sellerIds);
    const nameById = new Map(sellers.map((c) => [c.id, c.name]));
    return rows.map((r) => this.toView(r, viewerId, nameById.get(r.sellerCharacterId)));
  }

  private toView(auction: Auction, viewerId: string, sellerName?: string): AuctionView {
    const timeLeftSec = Math.max(0, Math.floor((auction.endsAt.getTime() - Date.now()) / 1000));
    return {
      id: auction.id,
      itemId: auction.itemId,
      itemName: itemDisplayName(auction.itemId),
      quantity: auction.quantity,
      sellerName: sellerName ?? '???',
      startBid: auction.startBid,
      buyout: auction.buyout,
      currentBid: auction.currentBid,
      minBid: minNextBid(auction.startBid, auction.currentBid),
      deposit: auction.deposit,
      status: auction.status,
      endsAt: auction.endsAt.toISOString(),
      timeLeftSec,
      isMine: auction.sellerCharacterId === viewerId,
      isMyBid: auction.bidderCharacterId === viewerId,
      isNpc: false,
    };
  }
}
