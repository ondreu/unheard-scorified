import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PushModule } from '../push/push.module';
import { AuctionController } from './auction.controller';
import { AuctionRepository } from './auction.repository';
import { NpcAuctionRepository } from './npc-auction.repository';
import { AUCTION_SCHEDULER, BullMqAuctionScheduler } from './auction.scheduler';
import { AuctionService } from './auction.service';
import { AuctionSettler } from './auction.settler';

/**
 * Auction House (M8, ekonomika). Buyout + bidding s depositem (gold sink) a AH
 * cut; item escrow z inventáře, bid escrow zlata. Vypořádání lazy při čtení
 * (zdroj pravdy) + best-effort BullMQ expiry job (`AuctionScheduler`/`Settler`,
 * vzor jako M2 ActivityScheduler). Viz ADR 0012.
 */
@Module({
  imports: [AuthModule, CharacterModule, InventoryModule, PushModule],
  controllers: [AuctionController],
  providers: [
    AuctionService,
    AuctionRepository,
    NpcAuctionRepository,
    AuctionSettler,
    { provide: AUCTION_SCHEDULER, useClass: BullMqAuctionScheduler },
  ],
})
export class AuctionModule {}
