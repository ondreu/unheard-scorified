import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuctionService, type AuctionView, type CreateListingInput } from './auction.service';

@Controller('characters/:characterId/auctions')
@UseGuards(JwtAuthGuard)
export class AuctionController {
  constructor(private readonly auctions: AuctionService) {}

  /** Procházení aktivních výpisů (volitelně ?itemId=). */
  @Get()
  browse(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Query('itemId') itemId?: string,
  ): Promise<AuctionView[]> {
    return this.auctions.browse(user.accountId, characterId, itemId);
  }

  /** Vlastní výpisy a nabídky postavy. */
  @Get('mine')
  mine(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<AuctionView[]> {
    return this.auctions.myAuctions(user.accountId, characterId);
  }

  /** Vypíše item na aukci. */
  @Post()
  create(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() body: CreateListingInput,
  ): Promise<AuctionView> {
    return this.auctions.createListing(user.accountId, characterId, body);
  }

  /** Přihodí na aukci. */
  @Post(':auctionId/bid')
  bid(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('auctionId') auctionId: string,
    @Body() body: { amount: number },
  ): Promise<AuctionView> {
    return this.auctions.bid(user.accountId, characterId, auctionId, body?.amount);
  }

  /** Okamžitý nákup za buyout. */
  @Post(':auctionId/buyout')
  buyout(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('auctionId') auctionId: string,
  ): Promise<AuctionView> {
    return this.auctions.buyout(user.accountId, characterId, auctionId);
  }

  /** Zruší vlastní výpis (jen bez nabídek). */
  @Post(':auctionId/cancel')
  cancel(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('auctionId') auctionId: string,
  ): Promise<AuctionView> {
    return this.auctions.cancel(user.accountId, characterId, auctionId);
  }
}
