import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SpellService, type SpellView } from './spell.service';

@Controller('characters/:characterId/spells')
@UseGuards(JwtAuthGuard)
export class SpellController {
  constructor(private readonly spells: SpellService) {}

  /** Spellbook + stav spell slotů (max/available, rested). */
  @Get()
  getSpells(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<SpellView> {
    return this.spells.getSpells(user.accountId, characterId);
  }

  /** Long Rest — plně dobije spell sloty. */
  @Post('long-rest')
  longRest(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<SpellView> {
    return this.spells.longRest(user.accountId, characterId);
  }
}
