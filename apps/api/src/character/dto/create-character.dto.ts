import { IsString } from 'class-validator';

export class CreateCharacterDto {
  @IsString()
  name!: string;

  @IsString()
  race!: string;

  @IsString()
  class!: string;
}
