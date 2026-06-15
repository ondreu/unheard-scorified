import { IsIn } from 'class-validator';

export class LeaveTeamDto {
  @IsIn(['2v2', '3v3', '5v5'])
  bracket!: '2v2' | '3v3' | '5v5';
}
