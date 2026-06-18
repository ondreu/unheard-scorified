import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { LevelUpChoice } from '@game/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LevelUpService, type LevelUpView } from './levelup.service';

@Controller('characters/:characterId/levelup')
@UseGuards(JwtAuthGuard)
export class LevelUpController {
  constructor(private readonly levelUp: LevelUpService) {}

  /** Stav level-upu: nárokové sloty + uložené volby + možnosti. */
  @Get()
  getLevelUp(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<LevelUpView> {
    return this.levelUp.getLevelUp(user.accountId, characterId);
  }

  /** Uloží volbu do slotu (ASI / Feat / subclass). */
  @Post(':slotId')
  choose(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('slotId') slotId: string,
    @Body() choice: LevelUpChoice,
  ): Promise<LevelUpView> {
    return this.levelUp.choose(user.accountId, characterId, slotId, choice);
  }

  /** Reset všech voleb (respec). */
  @Delete()
  resetAll(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<LevelUpView> {
    return this.levelUp.resetAll(user.accountId, characterId);
  }
}
