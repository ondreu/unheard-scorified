import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  RaidService,
  type RaidListItem,
  type RaidRunSummary,
  type RaidRunView,
} from './raid.service';
import type { RaidRole } from '@game/shared';

@Controller('characters/:characterId/raids')
@UseGuards(JwtAuthGuard)
export class RaidController {
  constructor(private readonly raids: RaidService) {}

  /** Seznam raidů (unlocked + stav fronty). */
  @Get()
  list(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<RaidListItem[]> {
    return this.raids.listRaids(user.accountId, characterId);
  }

  /** Nedávné raid runy postavy. */
  @Get('runs')
  runs(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<RaidRunSummary[]> {
    return this.raids.recentRuns(user.accountId, characterId);
  }

  /** Detail/přehrání raid runu. */
  @Get('run/:runId')
  run(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('runId') runId: string,
  ): Promise<RaidRunView> {
    return this.raids.getRun(user.accountId, characterId, runId);
  }

  /** Zařadí postavu do fronty raidu v dané roli. */
  @Post(':raidId/queue')
  queue(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('raidId') raidId: string,
    @Body() body: { role: string },
  ): Promise<{ queued: true; role: RaidRole }> {
    return this.raids.queueForRaid(user.accountId, characterId, raidId, body?.role);
  }

  /** Opustí frontu raidu. */
  @Post(':raidId/leave')
  leave(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('raidId') raidId: string,
  ): Promise<{ left: boolean }> {
    return this.raids.leaveQueue(user.accountId, characterId, raidId);
  }

  /** Spustí raid (sestaví party + okamžitě vyřeší). */
  @Post(':raidId/enter')
  enter(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('raidId') raidId: string,
    @Body() body: { role: string },
  ): Promise<RaidRunView> {
    return this.raids.enter(user.accountId, characterId, raidId, body?.role);
  }
}
