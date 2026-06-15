import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MountDataModule } from '../mount/mount-data.module';
import { ProfessionController } from './profession.controller';
import { ProfessionDataModule } from './profession-data.module';
import { ProfessionService } from './profession.service';

/**
 * Profese & reputace (M6, deep time-sinks). Gathering/crafting běhy jsou idle
 * aktivity typu `gather`/`craft` (recyklují ActivityModule infra). Profession
 * skill a reputace (z `ProfessionDataModule`) se připisují při generickém claimu
 * v ActivityService — proto repos žijí v samostatném leaf modulu (bez cyklu).
 */
@Module({
  imports: [
    AuthModule,
    CharacterModule,
    InventoryModule,
    ActivityModule,
    ProfessionDataModule,
    MountDataModule,
  ],
  controllers: [ProfessionController],
  providers: [ProfessionService],
})
export class ProfessionModule {}
