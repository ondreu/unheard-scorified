import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { TalentModule } from '../talent/talent.module';
import { PushModule } from '../push/push.module';
import { RaidModule } from '../raid/raid.module';
import { DungeonController } from './dungeon.controller';
import { DungeonService } from './dungeon.service';

/**
 * Dungeony (M5, sjednoceno M8.5-B na group PVE run model). SP i group (3/5) běží
 * na sdílené run infrastruktuře raidů (`RaidRepository` + `RAID_QUEUE`, exportované
 * z `RaidModule`); combat je deterministický party-vs-sekvence engine z @game/shared.
 * Personal loot per účastník. Viz ADR 0014.
 */
@Module({
  imports: [AuthModule, CharacterModule, InventoryModule, TalentModule, PushModule, RaidModule],
  controllers: [DungeonController],
  providers: [DungeonService],
})
export class DungeonModule {}
