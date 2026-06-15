import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

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
