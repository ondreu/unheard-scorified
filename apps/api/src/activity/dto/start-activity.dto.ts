import { IsString } from 'class-validator';

export class StartActivityDto {
  @IsString()
  activityType!: string;

  @IsString()
  questId!: string;
}
