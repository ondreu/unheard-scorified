import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const ROLES = ['tank', 'healer', 'dps'] as const;

export class CreateGroupDto {
  @IsIn(ROLES)
  role!: 'tank' | 'healer' | 'dps';
}

export class InviteGroupDto {
  @IsString()
  @MaxLength(40)
  targetName!: string;

  @IsIn(ROLES)
  role!: 'tank' | 'healer' | 'dps';
}

export class RespondInviteDto {
  @IsString()
  groupId!: string;

  @IsBoolean()
  accept!: boolean;

  @IsOptional()
  @IsIn(ROLES)
  role?: 'tank' | 'healer' | 'dps';
}

export class SetRoleDto {
  @IsIn(ROLES)
  role!: 'tank' | 'healer' | 'dps';
}

export class MemberTargetDto {
  @IsString()
  targetCharacterId!: string;
}

export class RequestJoinDto {
  @IsString()
  @MaxLength(40)
  targetName!: string;
}

export class RespondJoinRequestDto {
  @IsString()
  requesterCharacterId!: string;

  @IsBoolean()
  accept!: boolean;
}

export class LaunchGroupDto {
  @IsIn(['dungeon', 'raid', 'arena'])
  activityType!: 'dungeon' | 'raid' | 'arena';

  /** Dungeon/raid id; pro arénu se ignoruje (bracket plyne z velikosti). */
  @IsString()
  @IsOptional()
  contentId?: string;
}
