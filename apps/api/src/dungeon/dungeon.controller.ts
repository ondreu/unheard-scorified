import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  DungeonService,
  type DungeonListItem,
  type DungeonRunSummary,
  type DungeonRunView,
} from './dungeon.service';
import { DungeonTurnService, type DungeonTurnRunView } from './dungeon-turn.service';
import { DungeonPartyService, type DungeonPartyRunView } from './dungeon-party.service';
import type { RaidComposition, RaidRole } from '@game/shared';

@Controller('characters/:characterId/dungeons')
@UseGuards(JwtAuthGuard)
export class DungeonController {
  constructor(
    private readonly dungeons: DungeonService,
    private readonly turn: DungeonTurnService,
    private readonly party: DungeonPartyService,
  ) {}

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

  // ── Tahový (solo) dungeon (dungeon overhaul Slice 2, ADR 0037) ──────────────

  /** Nedávné tahové runy postavy. */
  @Get('turn/runs')
  turnRuns(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ) {
    return this.turn.recentRuns(user.accountId, characterId);
  }

  /** Detail/aktuální stav tahového runu. */
  @Get('turn/run/:runId')
  turnRun(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('runId') runId: string,
  ): Promise<DungeonTurnRunView> {
    return this.turn.getRun(user.accountId, characterId, runId);
  }

  /** Vstup do tahového (solo) dungeonu — založí interaktivní run. */
  @Post(':dungeonId/turn/enter')
  turnEnter(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('dungeonId') dungeonId: string,
  ): Promise<DungeonTurnRunView> {
    return this.turn.enter(user.accountId, characterId, dungeonId);
  }

  /** Vstup do group tahového dungeonu (Slice 3) — role + AI autofill 3-player. */
  @Post(':dungeonId/turn/enter-group')
  turnEnterGroup(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('dungeonId') dungeonId: string,
    @Body() body: { role: string; size?: number },
  ): Promise<DungeonTurnRunView> {
    return this.turn.enterGroup(user.accountId, characterId, dungeonId, body?.role, body?.size ?? 3);
  }

  /** Jeden tah: hráč zvolí ability + cíl (index nepřítele). */
  @Post('turn/run/:runId/act')
  turnAct(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('runId') runId: string,
    @Body() body: { abilityId: string; targetId?: number; bonusAbilityId?: string },
  ): Promise<DungeonTurnRunView> {
    return this.turn.act(user.accountId, characterId, runId, body?.abilityId, body?.targetId ?? 0, body?.bonusAbilityId);
  }

  /** Předčasné opuštění tahového runu (žádná odměna). */
  @Post('turn/run/:runId/abandon')
  turnAbandon(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('runId') runId: string,
  ): Promise<DungeonTurnRunView> {
    return this.turn.abandon(user.accountId, characterId, runId);
  }

  // ── Živé MP tahové sezení (Slice 4, ADR 0038) ───────────────────────────────

  /** Leader spustí živé MP tahové sezení z party (joined členové + role). */
  @Post(':dungeonId/party/launch')
  partyLaunch(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('dungeonId') dungeonId: string,
  ): Promise<DungeonPartyRunView> {
    return this.party.launch(user.accountId, characterId, dungeonId);
  }

  /** Aktuální stav živého MP runu (řídí i AI fallback pro prošlé deadliny). */
  @Get('party/run/:runId')
  partyRun(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('runId') runId: string,
  ): Promise<DungeonPartyRunView> {
    return this.party.getRun(user.accountId, characterId, runId);
  }

  /** Postava odešle svou akci pro aktuální kolo (ability + cíl). */
  @Post('party/run/:runId/submit')
  partySubmit(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('runId') runId: string,
    @Body() body: { abilityId: string; targetId?: number; bonusAbilityId?: string },
  ): Promise<DungeonPartyRunView> {
    return this.party.submit(user.accountId, characterId, runId, body?.abilityId, body?.targetId ?? 0, body?.bonusAbilityId);
  }

  /** Leader ukončí běh předčasně (žádná odměna). */
  @Post('party/run/:runId/abandon')
  partyAbandon(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('runId') runId: string,
  ): Promise<DungeonPartyRunView> {
    return this.party.abandon(user.accountId, characterId, runId);
  }
}
