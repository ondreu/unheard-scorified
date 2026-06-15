import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class StartTradeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  partnerName!: string;
}

export class OfferItemDto {
  @IsString()
  itemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class SetOfferDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfferItemDto)
  items!: OfferItemDto[];

  @IsInt()
  @Min(0)
  gold!: number;
}
