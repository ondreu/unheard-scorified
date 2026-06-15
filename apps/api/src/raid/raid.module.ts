import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { LockoutModule } from '../lockout/lockout.module';
import { PushModule } from '../push/push.module';
import { QuestModule } from '../quest/quest.module';
import { TalentModule } from '../talent/talent.module';
import { RaidController } from './raid.controller';
import { RaidEventsRelay } from './raid.events';
import { RaidGateway } from './raid.gateway';
import { RaidLobbyController } from './raid-lobby.controller';
import { RaidLobbyRepository } from './raid-lobby.repository';
import { RaidLobbyService } from './raid-lobby.service';
import { RAID_QUEUE, RedisRaidQueue } from './raid.matchmaking';
import { RaidRepository } from './raid.repository';
import { RaidService } from './raid.service';

/**
 * Raidy (M8, MP PVE). Role-based matchmaking fronta (Redis, in-memory ve flow
 * testech) + NPC backfill → idle-first řešení i sólo. Combat recykluje engine
 * z M5 (party vs boss). Realtime watch přes WebSocket gateway + Redis pub/sub
 * adaptér (recykluje vrstvu z M7, viz main.ts, ADR 0011).
 */
@Module({
  imports: [
    AuthModule,
    CharacterModule,
    InventoryModule,
    TalentModule,
    QuestModule,
    PushModule,
    LockoutModule,
  ],
  controllers: [RaidController, RaidLobbyController],
  providers: [
    RaidService,
    RaidRepository,
    RaidLobbyService,
    RaidLobbyRepository,
    RaidEventsRelay,
    RaidGateway,
    { provide: RAID_QUEUE, useClass: RedisRaidQueue },
  ],
  // Sdílený run model (M8.5-B): dungeon modul recykluje run repository + frontu.
  exports: [RaidRepository, RAID_QUEUE],
})
export class RaidModule {}
