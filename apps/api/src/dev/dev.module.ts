import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProfessionDataModule } from '../profession/profession-data.module';
import { DevController } from './dev.controller';
import { DevGuard } from './dev.guard';
import { DevService } from './dev.service';

@Module({
  imports: [CharacterModule, InventoryModule, ProfessionDataModule, ActivityModule],
  controllers: [DevController],
  providers: [DevService, DevGuard],
})
export class DevModule {}
