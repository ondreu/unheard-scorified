import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SetOfferDto, StartTradeDto } from './dto/trade.dto';
import { TradeService, type TradeState } from './trade.service';

/**
 * P2P trade (M8.5-D). Tenký controller — logika v `TradeService`. Vše vázané na
 * vlastněnou postavu.
 */
@Controller('characters/:characterId/trade')
@UseGuards(JwtAuthGuard)
export class TradeController {
  constructor(private readonly trade: TradeService) {}

  /** Aktuální otevřený trade postavy (nebo null). */
  @Get()
  get(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<TradeState> {
    return this.trade.getState(user.accountId, characterId);
  }

  /** Otevře trade s postavou dle jména. */
  @Post()
  start(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: StartTradeDto,
  ): Promise<TradeState> {
    return this.trade.start(user.accountId, characterId, dto.partnerName);
  }

  /** Nastaví celou nabídku volajícího (resetuje potvrzení obou stran). */
  @Put('offer')
  setOffer(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: SetOfferDto,
  ): Promise<TradeState> {
    return this.trade.setOffer(user.accountId, characterId, dto.items, dto.gold);
  }

  /** Potvrdí nabídku; při oboustranném potvrzení proběhne výměna. */
  @Post('confirm')
  confirm(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<TradeState> {
    return this.trade.confirm(user.accountId, characterId);
  }

  /** Odznačí vlastní potvrzení (trade zůstává otevřený). */
  @Post('unconfirm')
  unconfirm(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<TradeState> {
    return this.trade.unconfirm(user.accountId, characterId);
  }

  /** Zruší celý trade. */
  @Post('cancel')
  cancel(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<TradeState> {
    return this.trade.cancel(user.accountId, characterId);
  }
}
