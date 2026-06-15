import { ArrayMaxSize, IsArray, IsIn, IsString } from 'class-validator';

export class QueueTeamDto {
  @IsIn(['3v3', '5v5'])
  bracket!: '3v3' | '5v5';

  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  teammateNames!: string[];
}

export class LeaveTeamDto {
  @IsIn(['3v3', '5v5'])
  bracket!: '3v3' | '5v5';
}
