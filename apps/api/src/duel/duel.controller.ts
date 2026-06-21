import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DuelService, type DuelRunView } from './duel.service';

/**
 * Tahový duel (Duel v bestiáři, Slice 2) — interaktivní testovací souboj proti
 * katalogovému nepříteli, **bez odměn**. Tenký controller, logika v `DuelService`.
 */
@Controller('characters/:characterId/duel')
@UseGuards(JwtAuthGuard)
export class DuelController {
  constructor(private readonly duel: DuelService) {}

  /** Vstup do tahového duelu proti šabloně nepřítele. */
  @Post(':templateId/enter')
  @HttpCode(200)
  enter(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('templateId') templateId: string,
  ): Promise<DuelRunView> {
    return this.duel.enter(user.accountId, characterId, templateId);
  }

  /** Aktuální stav duelu. */
  @Get('run/:runId')
  getRun(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('runId') runId: string,
  ): Promise<DuelRunView> {
    return this.duel.getRun(user.accountId, characterId, runId);
  }

  /** Jeden tah (ability + cíl, volitelně bonus action / upcast tier). */
  @Post('run/:runId/act')
  @HttpCode(200)
  act(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('runId') runId: string,
    @Body() body: { abilityId: string; targetId?: number; bonusAbilityId?: string; castTier?: number },
  ): Promise<DuelRunView> {
    return this.duel.act(
      user.accountId,
      characterId,
      runId,
      body?.abilityId,
      body?.targetId ?? 0,
      body?.bonusAbilityId,
      body?.castTier,
    );
  }

  /** Předčasné opuštění duelu (bez odměn). */
  @Post('run/:runId/abandon')
  @HttpCode(200)
  abandon(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('runId') runId: string,
  ): Promise<DuelRunView> {
    return this.duel.abandon(user.accountId, characterId, runId);
  }
}
