import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { BestiaryView } from '@game/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BestiaryService } from './bestiary.service';

/**
 * Bestiář (encyklopedie nepřátel). Tenký controller — logika v `BestiaryService`.
 */
@Controller('characters/:characterId/bestiary')
@UseGuards(JwtAuthGuard)
export class BestiaryController {
  constructor(private readonly bestiary: BestiaryService) {}

  /** Všechny katalogové záznamy s per-postava stavem (objeveno + kill counter). */
  @Get()
  list(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<BestiaryView> {
    return this.bestiary.getBestiary(user.accountId, characterId);
  }

  /** Označí bestiář za prohlédnutý → vynuluje „nově objeveno" pro příští návštěvu. */
  @Post('seen')
  @HttpCode(200)
  markSeen(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<BestiaryView> {
    return this.bestiary.markSeen(user.accountId, characterId);
  }
}
