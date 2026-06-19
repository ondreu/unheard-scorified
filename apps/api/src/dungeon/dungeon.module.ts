import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { HistoryModule } from '../history/history.module';
import { InventoryModule } from '../inventory/inventory.module';
import { LockoutModule } from '../lockout/lockout.module';
import { ProfessionDataModule } from '../profession/profession-data.module';
import { PushModule } from '../push/push.module';
import { QuestModule } from '../quest/quest.module';
import { RaidModule } from '../raid/raid.module';
import { RotationModule } from '../rotation/rotation.module';
import { DungeonController } from './dungeon.controller';
import { DungeonService } from './dungeon.service';
import { DungeonTurnService } from './dungeon-turn.service';
import { DungeonTurnRepository } from './dungeon-turn.repository';
import { DungeonPartyService } from './dungeon-party.service';
import { DungeonPartyRepository } from './dungeon-party.repository';
import { DungeonPartyGateway } from './dungeon-party.gateway';
import { DungeonPartyEventsRelay } from './dungeon-party.events';
import {
  BullMqDungeonPartyScheduler,
  DUNGEON_PARTY_SCHEDULER,
} from './dungeon-party.scheduler';
import { GroupRepository } from '../group/group.repository';

/**
 * Dungeony (M5, sjednoceno M8.5-B na group PVE run model). SP i group (3/5) běží
 * na sdílené run infrastruktuře raidů (`RaidRepository` + `RAID_QUEUE`, exportované
 * z `RaidModule`); combat je deterministický party-vs-sekvence engine z @game/shared.
 * Personal loot per účastník. Viz ADR 0014.
 */
@Module({
  imports: [
    AuthModule,
    CharacterModule,
    HistoryModule,
    InventoryModule,
    PushModule,
    RaidModule,
    LockoutModule,
    RotationModule,
    QuestModule,
    ProfessionDataModule,
  ],
  controllers: [DungeonController],
  // GroupRepository je stateless (jen DB) — poskytnut přímo, aby se předešlo
  // cyklické závislosti DungeonModule ↔ GroupModule (GroupModule importuje tenhle).
  providers: [
    DungeonService,
    DungeonTurnService,
    DungeonTurnRepository,
    DungeonPartyService,
    DungeonPartyRepository,
    DungeonPartyGateway,
    DungeonPartyEventsRelay,
    { provide: DUNGEON_PARTY_SCHEDULER, useClass: BullMqDungeonPartyScheduler },
    GroupRepository,
  ],
  // GroupModule (ADR 0022) spouští dungeon přes DungeonService.runForGroup.
  exports: [DungeonService],
})
export class DungeonModule {}
