import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BankService, type BankView } from './bank.service';

interface MoveBody {
  itemId: string;
  quantity: number;
}

@Controller('characters/:characterId/bank')
@UseGuards(JwtAuthGuard)
export class BankController {
  constructor(private readonly bank: BankService) {}

  /** Stav banky (itemy + obsazenost). */
  @Get()
  get(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<BankView> {
    return this.bank.getBank(user.accountId, characterId);
  }

  /** Uloží item z inventáře do banky. */
  @Post('deposit')
  deposit(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() body: MoveBody,
  ): Promise<BankView> {
    return this.bank.deposit(user.accountId, characterId, body?.itemId, body?.quantity);
  }

  /** Vybere item z banky do inventáře. */
  @Post('withdraw')
  withdraw(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() body: MoveBody,
  ): Promise<BankView> {
    return this.bank.withdraw(user.accountId, characterId, body?.itemId, body?.quantity);
  }
}
