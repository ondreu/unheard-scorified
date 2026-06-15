import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PushModule } from '../push/push.module';
import { QuestModule } from '../quest/quest.module';
import { ActivityController } from './activity.controller';
import { ActivityRepository } from './activity.repository';
import { ActivityService } from './activity.service';
import { ACTIVITY_SCHEDULER, BullMqActivityScheduler } from './activity.scheduler';

@Module({
  imports: [AuthModule, CharacterModule, QuestModule, PushModule, InventoryModule],
  controllers: [ActivityController],
  providers: [
    ActivityService,
    ActivityRepository,
    { provide: ACTIVITY_SCHEDULER, useClass: BullMqActivityScheduler },
  ],
  exports: [ActivityRepository, ACTIVITY_SCHEDULER],
})
export class ActivityModule {}
