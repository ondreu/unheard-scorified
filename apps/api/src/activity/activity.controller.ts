import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActivityService, type ActivityView, type ClaimResult } from './activity.service';
import { StartActivityDto } from './dto/start-activity.dto';

@Controller('characters/:characterId/activity')
@UseGuards(JwtAuthGuard)
export class ActivityController {
  constructor(private readonly activities: ActivityService) {}

  /** Aktuální běžící aktivita (nebo null). */
  @Get()
  current(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<ActivityView | null> {
    return this.activities.getCurrent(user.accountId, characterId);
  }

  /** Pošle postavu na aktivitu. */
  @Post()
  start(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: StartActivityDto,
  ): Promise<ActivityView> {
    return this.activities.start(user.accountId, characterId, dto);
  }

  /** Vybere odměny z dokončené aktivity. */
  @Post('claim')
  claim(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<ClaimResult> {
    return this.activities.claim(user.accountId, characterId);
  }
}
