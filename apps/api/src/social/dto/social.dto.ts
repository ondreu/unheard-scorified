import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendFriendRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  name!: string;
}

export class RespondFriendRequestDto {
  @IsBoolean()
  accept!: boolean;
}

export class SendChatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  body!: string;

  @IsOptional()
  @IsString()
  channel?: string;
}

export class CreateGuildDto {
  @IsString()
  @MinLength(3)
  @MaxLength(24)
  name!: string;
}

export class InviteToGuildDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  name!: string;
}

export class RespondGuildInviteDto {
  @IsBoolean()
  accept!: boolean;
}

export class SetGuildRankDto {
  @IsIn(['member', 'officer'])
  rank!: 'member' | 'officer';
}

export class SetGuildMotdDto {
  @IsString()
  @MaxLength(200)
  motd!: string;
}

export class StartGuildCharterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(24)
  name!: string;
}

export class InviteCharterSignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  name!: string;
}

export class RespondCharterSignDto {
  @IsString()
  charterId!: string;

  @IsBoolean()
  accept!: boolean;
}
