import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ArenaService,
  type ArenaMatchView,
  type ArenaView,
  type QueueResult,
} from './arena.service';

@Controller('characters/:characterId/arena')
@UseGuards(JwtAuthGuard)
export class ArenaController {
  constructor(private readonly arena: ArenaService) {}

  /** Přehled arény (rating, tier, žebříček, historie, stav fronty). */
  @Get()
  get(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<ArenaView> {
    return this.arena.getArena(user.accountId, characterId);
  }

  /** Zařadí postavu do fronty (případně okamžitě vyřeší zápas). */
  @Post('queue')
  queue(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<QueueResult> {
    return this.arena.queue(user.accountId, characterId);
  }

  /** Opustí frontu. */
  @Post('leave')
  leave(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<{ left: boolean }> {
    return this.arena.leaveQueue(user.accountId, characterId);
  }

  /** Detail/přehrání zápasu z perspektivy postavy. */
  @Get('match/:matchId')
  match(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('matchId') matchId: string,
  ): Promise<ArenaMatchView> {
    return this.arena.getMatch(user.accountId, characterId, matchId);
  }
}
