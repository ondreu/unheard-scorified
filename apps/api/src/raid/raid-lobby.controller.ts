import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateLobbyDto, InviteToLobbyDto, RespondLobbyInviteDto } from './dto/raid-lobby.dto';
import { RaidLobbyService, type LobbyState } from './raid-lobby.service';

/**
 * Raid lobby (M8.5-B, ruční formace). Tenký controller — logika v
 * `RaidLobbyService`. Vše vázané na vlastněnou postavu.
 */
@Controller('characters/:characterId/raid-lobbies')
@UseGuards(JwtAuthGuard)
export class RaidLobbyController {
  constructor(private readonly lobby: RaidLobbyService) {}

  /** Aktivní lobby postavy + příchozí pozvánky. */
  @Get()
  get(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<LobbyState> {
    return this.lobby.getState(user.accountId, characterId);
  }

  /** Založí lobby (zakladatel = leader). */
  @Post()
  create(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: CreateLobbyDto,
  ): Promise<LobbyState> {
    return this.lobby.create(user.accountId, characterId, dto.raidId, dto.role, dto.size, dto.composition);
  }

  /** Pozve postavu dle jména do role (jen leader). */
  @Post(':lobbyId/invites')
  invite(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('lobbyId') lobbyId: string,
    @Body() dto: InviteToLobbyDto,
  ): Promise<LobbyState> {
    return this.lobby.invite(user.accountId, characterId, lobbyId, dto.name, dto.role);
  }

  /** Přijme/odmítne příchozí pozvánku. */
  @Post(':lobbyId/invites/respond')
  respond(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('lobbyId') lobbyId: string,
    @Body() dto: RespondLobbyInviteDto,
  ): Promise<LobbyState> {
    return this.lobby.respondInvite(user.accountId, characterId, lobbyId, dto.accept, dto.role);
  }

  /** Opustí lobby (leader → zruší). */
  @Post(':lobbyId/leave')
  leave(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('lobbyId') lobbyId: string,
  ): Promise<LobbyState> {
    return this.lobby.leave(user.accountId, characterId, lobbyId);
  }

  /** Vyhodí člena (jen leader). */
  @Delete(':lobbyId/members/:targetCharacterId')
  kick(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('lobbyId') lobbyId: string,
    @Param('targetCharacterId') targetCharacterId: string,
  ): Promise<LobbyState> {
    return this.lobby.kick(user.accountId, characterId, lobbyId, targetCharacterId);
  }

  /** Spustí raid (jen leader). Vrací id runu pro watch. */
  @Post(':lobbyId/start')
  start(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('lobbyId') lobbyId: string,
  ): Promise<{ runId: string }> {
    return this.lobby.start(user.accountId, characterId, lobbyId);
  }
}
