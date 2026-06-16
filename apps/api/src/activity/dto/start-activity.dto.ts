import { IsInt, IsOptional, IsString } from 'class-validator';

export class StartActivityDto {
  @IsString()
  activityType!: string;

  /** Jen pro `activityType === 'quest'`. */
  @IsOptional()
  @IsString()
  questId?: string;

  /** Jen pro `activityType === 'grind'` (Gone Questing) — hráčem volená délka (s). */
  @IsOptional()
  @IsInt()
  durationSec?: number;
}
