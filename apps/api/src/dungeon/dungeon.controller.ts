import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  DungeonService,
  type DungeonListItem,
  type DungeonRunSummary,
  type DungeonRunView,
} from './dungeon.service';
import type { RaidComposition, RaidRole } from '@game/shared';

@Controller('characters/:characterId/dungeons')
@UseGuards(JwtAuthGuard)
export class DungeonController {
  constructor(private readonly dungeons: DungeonService) {}

  /** Seznam dungeonů (s flagem unlocked dle levelu + stav fronty). */
  @Get()
  list(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<DungeonListItem[]> {
    return this.dungeons.listDungeons(user.accountId, characterId);
  }

  /** Nedávné dungeon runy postavy. */
  @Get('runs')
  runs(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<DungeonRunSummary[]> {
    return this.dungeons.recentRuns(user.accountId, characterId);
  }

  /** Detail/přehrání dungeon runu. */
  @Get('run/:runId')
  run(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('runId') runId: string,
  ): Promise<DungeonRunView> {
    return this.dungeons.getRun(user.accountId, characterId, runId);
  }

  /** Zařadí postavu do fronty group dungeonu v dané roli. */
  @Post(':dungeonId/queue')
  queue(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('dungeonId') dungeonId: string,
    @Body() body: { role: string },
  ): Promise<{ queued: true; role: RaidRole }> {
    return this.dungeons.queueForDungeon(user.accountId, characterId, dungeonId, body?.role);
  }

  /** Opustí frontu group dungeonu. */
  @Post(':dungeonId/leave')
  leave(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('dungeonId') dungeonId: string,
  ): Promise<{ left: boolean }> {
    return this.dungeons.leaveQueue(user.accountId, characterId, dungeonId);
  }

  /** Pošle postavu do dungeonu (SP size=1 nebo group 3/5, sestaví + vyřeší). */
  @Post(':dungeonId/enter')
  enter(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('dungeonId') dungeonId: string,
    @Body() body: { size?: number; role?: string; composition?: RaidComposition },
  ): Promise<DungeonRunView> {
    return this.dungeons.enter(
      user.accountId,
      characterId,
      dungeonId,
      body?.size,
      body?.role,
      body?.composition,
    );
  }
}
