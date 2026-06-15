import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { TalentModule } from '../talent/talent.module';
import { DungeonController } from './dungeon.controller';
import { DungeonService } from './dungeon.service';

/**
 * Dungeony (SP PVE, M5). Boj je deterministický (combat engine v @game/shared);
 * dungeon run je idle aktivita typu `dungeon` (recykluje ActivityModule infra:
 * repository + scheduler). Claim odměn jde přes generický activity claim.
 */
@Module({
  imports: [AuthModule, CharacterModule, InventoryModule, TalentModule, ActivityModule],
  controllers: [DungeonController],
  providers: [DungeonService],
})
export class DungeonModule {}
