import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class RotationRuleDto {
  @IsString()
  abilityId!: string;

  @IsBoolean()
  enabled!: boolean;

  @IsString()
  conditionType!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  threshold?: number;
}

export class UpdateRotationDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RotationRuleDto)
  rules!: RotationRuleDto[];
}
