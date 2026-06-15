import { IsInt, IsString, Min, Max, IsOptional } from 'class-validator';
import { MAX_LEVEL, MAX_PROFESSION_SKILL } from '@game/shared';

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
