import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LeaveTeamDto } from './dto/team-arena.dto';
import {
  TeamArenaService,
  type TeamArenaView,
  type TeamMatchView,
} from './team-arena.service';

/**
 * Týmové arény (M8.5-C, 3v3/5v5). Tenký controller — logika v `TeamArenaService`.
 */
@Controller('characters/:characterId/team-arena')
@UseGuards(JwtAuthGuard)
export class TeamArenaController {
  constructor(private readonly team: TeamArenaService) {}

  /** Přehled týmových bracketů (rating, tier, W/L, stav fronty). */
  @Get()
  get(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<TeamArenaView> {
    return this.team.getTeamArena(user.accountId, characterId);
  }

  /** Opustí frontu daného bracketu (skupina spustila arénu, čeká na soupeře). */
  @Post('leave')
  leave(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: LeaveTeamDto,
  ): Promise<{ left: boolean }> {
    return this.team.leaveQueue(user.accountId, characterId, dto.bracket);
  }

  /** Detail/přehrání týmového zápasu z perspektivy postavy. */
  @Get('match/:matchId')
  match(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('matchId') matchId: string,
  ): Promise<TeamMatchView> {
    return this.team.getMatch(user.accountId, characterId, matchId);
  }
}
