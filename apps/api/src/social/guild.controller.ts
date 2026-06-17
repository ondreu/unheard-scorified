import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateGuildDto,
  InviteCharterSignDto,
  InviteToGuildDto,
  RespondCharterSignDto,
  RespondGuildInviteDto,
  SetGuildMotdDto,
  SetGuildRankDto,
  StartGuildCharterDto,
} from './dto/social.dto';
import { GuildService, type GuildState } from './guild.service';

/**
 * Guild (M9 social). Tenký controller — logika v `GuildService`. Vše vázané na
 * vlastněnou postavu (ownership check v service).
 */
@Controller('characters/:characterId/guild')
@UseGuards(JwtAuthGuard)
export class GuildController {
  constructor(private readonly guild: GuildService) {}

  /** Stav: guilda postavy (roster) + příchozí pozvánky. */
  @Get()
  get(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<GuildState> {
    return this.guild.getState(user.accountId, characterId);
  }

  /** Založí guildu. */
  @Post()
  create(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: CreateGuildDto,
  ): Promise<GuildState> {
    return this.guild.create(user.accountId, characterId, dto.name);
  }

  /** Založí guild charter (poplatek + rezervace jména). */
  @Post('charter')
  startCharter(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: StartGuildCharterDto,
  ): Promise<GuildState> {
    return this.guild.startCharter(user.accountId, characterId, dto.name);
  }

  /** Pozve postavu (dle jména) k podpisu vlastního charteru. */
  @Post('charter/invite')
  inviteSign(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: InviteCharterSignDto,
  ): Promise<GuildState> {
    return this.guild.inviteSign(user.accountId, characterId, dto.name);
  }

  /** Odpoví na žádost o podpis cizího charteru. */
  @Post('charter/sign')
  respondSign(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: RespondCharterSignDto,
  ): Promise<GuildState> {
    return this.guild.respondSign(user.accountId, characterId, dto.charterId, dto.accept);
  }

  /** Založí guildu z charteru (dost podpisů). */
  @Post('charter/found')
  found(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<GuildState> {
    return this.guild.found(user.accountId, characterId);
  }

  /** Zruší vlastní charter. */
  @Delete('charter')
  cancelCharter(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<GuildState> {
    return this.guild.cancelCharter(user.accountId, characterId);
  }

  /** Pozve postavu dle jména (officer+). */
  @Post('invites')
  invite(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: InviteToGuildDto,
  ): Promise<GuildState> {
    return this.guild.invite(user.accountId, characterId, dto.name);
  }

  /** Přijme/odmítne příchozí pozvánku. */
  @Post('invites/:inviteId/respond')
  respond(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('inviteId') inviteId: string,
    @Body() dto: RespondGuildInviteDto,
  ): Promise<GuildState> {
    return this.guild.respondInvite(user.accountId, characterId, inviteId, dto.accept);
  }

  /** Opustí guildu. */
  @Post('leave')
  leave(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<GuildState> {
    return this.guild.leave(user.accountId, characterId);
  }

  /** Rozpustí guildu (jen vůdce). */
  @Delete()
  disband(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<GuildState> {
    return this.guild.disband(user.accountId, characterId);
  }

  /** Vyhodí člena (officer+). */
  @Delete('members/:targetCharacterId')
  kick(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('targetCharacterId') targetCharacterId: string,
  ): Promise<GuildState> {
    return this.guild.kick(user.accountId, characterId, targetCharacterId);
  }

  /** Nastaví rank člena (jen vůdce; member ↔ officer). */
  @Post('members/:targetCharacterId/rank')
  setRank(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('targetCharacterId') targetCharacterId: string,
    @Body() dto: SetGuildRankDto,
  ): Promise<GuildState> {
    return this.guild.setRank(user.accountId, characterId, targetCharacterId, dto.rank);
  }

  /** Nastaví zprávu dne (MOTD) guildy (officer+; prázdný text ji zruší). */
  @Post('motd')
  setMotd(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: SetGuildMotdDto,
  ): Promise<GuildState> {
    return this.guild.setMotd(user.accountId, characterId, dto.motd);
  }
}
