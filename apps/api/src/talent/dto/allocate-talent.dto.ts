import { IsString } from 'class-validator';

export class AllocateTalentDto {
  @IsString()
  talentId!: string;
}
