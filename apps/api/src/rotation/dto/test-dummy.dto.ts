import { IsInt, IsString, Max, Min } from 'class-validator';

export class TestDummyDto {
  @IsString()
  role!: string;

  @IsInt()
  @Min(10)
  @Max(180)
  durationSec!: number;
}
