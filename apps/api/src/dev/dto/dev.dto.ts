import { IsInt, IsString, Min, Max, IsOptional } from 'class-validator';
import { MAX_LEVEL, MAX_PROFESSION_SKILL, MAX_REPUTATION } from '@game/shared';

export class SetLevelDto {
  @IsInt()
  @Min(1)
  @Max(MAX_LEVEL)
  level!: number;
}

export class AddGoldDto {
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  amount!: number;
}

export class AddItemDto {
  @IsString()
  itemId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  quantity?: number;
}

export class SetProfessionDto {
  @IsString()
  professionId!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_PROFESSION_SKILL)
  skill!: number;
}

export class TimeWarpDto {
  @IsInt()
  @Min(1)
  @Max(720)
  hours!: number;
}

export class SetArenaRatingDto {
  @IsString()
  bracket!: string;

  @IsInt()
  @Min(0)
  @Max(3500)
  rating!: number;
}

export class SetReputationDto {
  @IsString()
  factionId!: string;

  @IsInt()
  @Min(0)
  @Max(MAX_REPUTATION)
  standing!: number;
}

export class CompleteQuestDto {
  @IsString()
  questId!: string;
}

export class ChatHistoryQueryDto {
  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  senderId?: string;

  @IsOptional()
  @IsString()
  before?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
