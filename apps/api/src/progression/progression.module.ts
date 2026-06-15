import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { ProgressionController } from './progression.controller';
import { ProgressionRepository } from './progression.repository';
import { ProgressionService } from './progression.service';

/**
 * Achievementy (M9). Splnění se odvozuje lazy z herního stavu (read-model nad
 * existujícími tabulkami), odměny jsou jednorázové. Viz ADR 0021.
 */
@Module({
  imports: [AuthModule, CharacterModule],
  controllers: [ProgressionController],
  providers: [ProgressionService, ProgressionRepository],
})
export class ProgressionModule {}
