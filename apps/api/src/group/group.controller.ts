import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateGroupDto,
  InviteGroupDto,
  LaunchGroupDto,
  MemberTargetDto,
  RequestJoinDto,
  RespondInviteDto,
  RespondJoinRequestDto,
  SetRoleDto,
} from './dto/group.dto';
import { GroupService, type GroupLaunchResult, type GroupState } from './group.service';

/**
 * Trvalá skupina (party) — M9, ADR 0022. Tenký controller, logika v `GroupService`.
 * Jeden formační systém pro dungeon/raid/arénu (nahradil raid lobby + ruční team arénu).
 */
@Controller('characters/:characterId/group')
@UseGuards(JwtAuthGuard)
export class GroupController {
  constructor(private readonly groups: GroupService) {}

  @Get()
  get(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<GroupState> {
    return this.groups.getState(user.accountId, characterId);
  }

  @Post('create')
  create(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: CreateGroupDto,
  ): Promise<GroupState> {
    return this.groups.create(user.accountId, characterId, dto.role);
  }

  @Post('invite')
  invite(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: InviteGroupDto,
  ): Promise<GroupState> {
    return this.groups.invite(user.accountId, characterId, dto.targetName, dto.role);
  }

  @Post('invite/respond')
  respond(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: RespondInviteDto,
  ): Promise<GroupState> {
    return this.groups.respondInvite(user.accountId, characterId, dto.groupId, dto.accept, dto.role);
  }

  @Post('request')
  requestJoin(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: RequestJoinDto,
  ): Promise<GroupState> {
    return this.groups.requestJoin(user.accountId, characterId, dto.targetName);
  }

  @Post('request/respond')
  respondRequest(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: RespondJoinRequestDto,
  ): Promise<GroupState> {
    return this.groups.respondJoinRequest(
      user.accountId,
      characterId,
      dto.requesterCharacterId,
      dto.accept,
    );
  }

  @Post('role')
  setRole(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: SetRoleDto,
  ): Promise<GroupState> {
    return this.groups.setRole(user.accountId, characterId, dto.role);
  }

  @Post('leave')
  leave(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<GroupState> {
    return this.groups.leave(user.accountId, characterId);
  }

  @Post('kick')
  kick(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: MemberTargetDto,
  ): Promise<GroupState> {
    return this.groups.kick(user.accountId, characterId, dto.targetCharacterId);
  }

  @Post('promote')
  promote(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: MemberTargetDto,
  ): Promise<GroupState> {
    return this.groups.promote(user.accountId, characterId, dto.targetCharacterId);
  }

  @Post('disband')
  disband(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<GroupState> {
    return this.groups.disband(user.accountId, characterId);
  }

  @Post('launch')
  launch(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: LaunchGroupDto,
  ): Promise<GroupLaunchResult> {
    return this.groups.launch(user.accountId, characterId, dto.activityType, dto.contentId ?? '');
  }
}
