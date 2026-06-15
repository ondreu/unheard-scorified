import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
