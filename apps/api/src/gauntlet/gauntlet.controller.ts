import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  GauntletService,
  type GauntletRunView,
  type GauntletStatusView,
} from './gauntlet.service';

/**
 * The Gauntlet (M13) — aktivní tahová minihra. Tenké endpointy; veškerá logika
 * v service. Klient posílá jen volbu (ability/draft), server dopočítá vše
 * deterministicky (anti-cheat).
 */
@Controller('characters/:characterId/gauntlet')
@UseGuards(JwtAuthGuard)
export class GauntletController {
  constructor(private readonly gauntlet: GauntletService) {}

  /** Přehled minihry (aktivní run, nejlepší skóre, denní strop). */
  @Get()
  status(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<GauntletStatusView> {
    return this.gauntlet.getStatus(user.accountId, characterId);
  }

  /** Nedávné runy postavy. */
  @Get('runs')
  runs(@CurrentUser() user: { accountId: string }, @Param('characterId') characterId: string) {
    return this.gauntlet.recentRuns(user.accountId, characterId);
  }

  /** Detail/aktuální stav runu. */
  @Get('run/:runId')
  run(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('runId') runId: string,
  ): Promise<GauntletRunView> {
    return this.gauntlet.getRun(user.accountId, characterId, runId);
  }

  /** Vstup do Gauntletu (založí run). */
  @Post('enter')
  enter(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<GauntletRunView> {
    return this.gauntlet.enter(user.accountId, characterId);
  }

  /** Jeden tah — hráč zvolí ability. */
  @Post('run/:runId/act')
  act(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('runId') runId: string,
    @Body() body: { abilityId: string; bonusAbilityId?: string; castTier?: number },
  ): Promise<GauntletRunView> {
    return this.gauntlet.act(user.accountId, characterId, runId, body?.abilityId, body?.bonusAbilityId, body?.castTier);
  }

  /** Výběr draftu mezi vlnami. */
  @Post('run/:runId/draft')
  draft(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('runId') runId: string,
    @Body() body: { optionId: string },
  ): Promise<GauntletRunView> {
    return this.gauntlet.draft(user.accountId, characterId, runId, body?.optionId);
  }

  /** Předčasné ukončení runu (zinkasuje odměnu za dosavadní vlny). */
  @Post('run/:runId/retire')
  retire(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('runId') runId: string,
  ): Promise<GauntletRunView> {
    return this.gauntlet.retire(user.accountId, characterId, runId);
  }
}
