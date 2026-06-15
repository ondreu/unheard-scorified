import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConsumableService, type ConsumablesView } from './consumable.service';

@Controller('characters/:characterId/consumables')
@UseGuards(JwtAuthGuard)
export class ConsumableController {
  constructor(private readonly consumables: ConsumableService) {}

  /** Spotřebáky v inventáři + aktivní buffy. */
  @Get()
  getConsumables(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<ConsumablesView> {
    return this.consumables.getConsumables(user.accountId, characterId);
  }

  /** Použije spotřebák (aplikuje buff). */
  @Post('use/:itemId')
  use(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('itemId') itemId: string,
  ): Promise<ConsumablesView> {
    return this.consumables.use(user.accountId, characterId, itemId);
  }
}
