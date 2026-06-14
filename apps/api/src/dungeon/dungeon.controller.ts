import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  DungeonService,
  type DungeonListItem,
  type DungeonLogView,
} from './dungeon.service';

@Controller('characters/:characterId/dungeons')
@UseGuards(JwtAuthGuard)
export class DungeonController {
  constructor(private readonly dungeons: DungeonService) {}

  /** Seznam dungeonů (s flagem unlocked dle levelu). */
  @Get()
  list(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<DungeonListItem[]> {
    return this.dungeons.listDungeons(user.accountId, characterId);
  }

  /** Živý combat log aktuálního dungeon runu (nebo null). */
  @Get('log')
  log(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<DungeonLogView | null> {
    return this.dungeons.getCombatLog(user.accountId, characterId);
  }

  /** Pošle postavu do dungeonu. */
  @Post(':dungeonId/enter')
  enter(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('dungeonId') dungeonId: string,
  ): Promise<DungeonLogView> {
    return this.dungeons.enter(user.accountId, characterId, dungeonId);
  }
}
