import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { TalentController } from './talent.controller';
import { TalentRepository } from './talent.repository';
import { TalentService } from './talent.service';

@Module({
  imports: [AuthModule, CharacterModule],
  controllers: [TalentController],
  providers: [TalentService, TalentRepository],
  exports: [TalentRepository, TalentService],
})
export class TalentModule {}
