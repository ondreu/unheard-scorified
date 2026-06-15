import { IsIn } from 'class-validator';

export class LeaveTeamDto {
  @IsIn(['3v3', '5v5'])
  bracket!: '3v3' | '5v5';
}
