import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ProgressionService,
  type AchievementsView,
  type ClaimResult,
  type GoalClaimResult,
  type GoalsView,
} from './progression.service';

/**
 * Achievementy (M9). Tenký controller — logika v `ProgressionService`.
 */
@Controller('characters/:characterId/achievements')
@UseGuards(JwtAuthGuard)
export class ProgressionController {
  constructor(private readonly progression: ProgressionService) {}

  /** Seznam achievementů s progresem a stavem nároku. */
  @Get()
  list(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<AchievementsView> {
    return this.progression.getAchievements(user.accountId, characterId);
  }

  /** Vyzvedne odměnu za splněný achievement. */
  @Post(':achievementId/claim')
  claim(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('achievementId') achievementId: string,
  ): Promise<ClaimResult> {
    return this.progression.claim(user.accountId, characterId, achievementId);
  }

  /** Denní/týdenní cíle s progresem a stavem nároku. */
  @Get('goals')
  goals(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<GoalsView> {
    return this.progression.getGoals(user.accountId, characterId);
  }

  /** Vyzvedne odměnu za splněný cíl v aktuálním období. */
  @Post('goals/:goalId/claim')
  claimGoal(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('goalId') goalId: string,
  ): Promise<GoalClaimResult> {
    return this.progression.claimGoal(user.accountId, characterId, goalId);
  }
}
