import { IsString } from 'class-validator';

export class EquipItemDto {
  @IsString()
  slot!: string;
}
