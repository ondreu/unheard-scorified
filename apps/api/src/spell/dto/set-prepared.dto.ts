import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

/** Kniha kouzel (ADR 0039) — výběr aktivních (prepared) kouzel. */
export class SetPreparedDto {
  /** Ids zvolených kouzel (cantripy + leveled). Validace proti poolu/limitům v service. */
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(64)
  spellIds!: string[];
}
