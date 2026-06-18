import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { LevelUpController } from './levelup.controller';
import { LevelUpRepository } from './levelup.repository';
import { LevelUpService } from './levelup.service';

@Module({
  imports: [AuthModule, CharacterModule],
  controllers: [LevelUpController],
  providers: [LevelUpService, LevelUpRepository],
  exports: [LevelUpRepository, LevelUpService],
})
export class LevelUpModule {}
