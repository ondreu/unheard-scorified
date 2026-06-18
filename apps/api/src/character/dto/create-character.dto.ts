import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateCharacterDto {
  @IsString()
  name!: string;

  @IsString()
  race!: string;

  @IsString()
  class!: string;

  /** D&D Background (MR-3). Volitelné kvůli zpětné kompatibilitě; service validuje. */
  @IsOptional()
  @IsString()
  background?: string;

  /** Přiřazený standard array (mapa atribut → skóre). Service validuje permutaci. */
  @IsOptional()
  @IsObject()
  abilityScores?: Record<string, number>;

  /** Volitelná veřejná backstory. */
  @IsOptional()
  @IsString()
  backstory?: string;
}
