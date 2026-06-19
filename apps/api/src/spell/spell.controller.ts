import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SpellService, type SpellView } from './spell.service';
import { SetPreparedDto } from './dto/set-prepared.dto';

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

  /** Kniha kouzel (ADR 0039) — uloží aktivní (prepared) kouzla. Swap jen při Long Rest. */
  @Put('prepared')
  setPrepared(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: SetPreparedDto,
  ): Promise<SpellView> {
    return this.spells.setPrepared(user.accountId, characterId, dto.spellIds);
  }
}
