import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MailAttachmentDto {
  @IsString()
  itemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class SendMailDto {
  @IsString()
  @MaxLength(40)
  toName!: string;

  @IsString()
  @MaxLength(64)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  body?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MailAttachmentDto)
  items?: MailAttachmentDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  gold?: number;
}
