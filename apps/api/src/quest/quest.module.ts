import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { QuestController } from './quest.controller';
import { CompletedQuestRepository } from './quest.repository';
import { QuestService } from './quest.service';

@Module({
  imports: [AuthModule, CharacterModule],
  controllers: [QuestController],
  providers: [QuestService, CompletedQuestRepository],
  exports: [CompletedQuestRepository],
})
export class QuestModule {}
