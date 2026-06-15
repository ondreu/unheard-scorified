import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const ROLES = ['tank', 'healer', 'dps'] as const;

export class CompositionDto {
  @IsInt()
  @Min(0)
  tank!: number;

  @IsInt()
  @Min(0)
  healer!: number;

  @IsInt()
  @Min(0)
  dps!: number;
}

export class CreateLobbyDto {
  @IsString()
  raidId!: string;

  @IsIn(ROLES)
  role!: 'tank' | 'healer' | 'dps';

  @IsOptional()
  @IsInt()
  @Min(1)
  size?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompositionDto)
  composition?: CompositionDto;
}

export class InviteToLobbyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  name!: string;

  @IsIn(ROLES)
  role!: 'tank' | 'healer' | 'dps';
}

export class RespondLobbyInviteDto {
  @IsBoolean()
  accept!: boolean;

  @IsOptional()
  @IsIn(ROLES)
  role?: 'tank' | 'healer' | 'dps';
}
