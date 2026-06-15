import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { LockoutModule } from '../lockout/lockout.module';
import { PushModule } from '../push/push.module';
import { QuestModule } from '../quest/quest.module';
import { TalentModule } from '../talent/talent.module';
import { RotationModule } from '../rotation/rotation.module';
import { RaidController } from './raid.controller';
import { RaidEventsRelay } from './raid.events';
import { RaidGateway } from './raid.gateway';
import { RAID_QUEUE, RedisRaidQueue } from './raid.matchmaking';
import { RaidRepository } from './raid.repository';
import { RaidService } from './raid.service';

/**
 * Raidy (M8, MP PVE). Role-based matchmaking fronta (Redis, in-memory ve flow
 * testech) — jen reální hráči (NPC backfill odebrán). Combat recykluje engine
 * z M5 (party vs boss). Realtime watch přes WebSocket gateway + Redis pub/sub
 * adaptér (recykluje vrstvu z M7, viz main.ts, ADR 0011). Ruční formaci řeší
 * trvalá skupina (`GroupModule`, ADR 0022).
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
    RotationModule,
  ],
  controllers: [RaidController],
  providers: [
    RaidService,
    RaidRepository,
    RaidEventsRelay,
    RaidGateway,
    { provide: RAID_QUEUE, useClass: RedisRaidQueue },
  ],
  // Sdílený run model (M8.5-B): dungeon + group moduly recyklují run repo, frontu
  // a RaidService (finalizeRun / runForGroup).
  exports: [RaidRepository, RAID_QUEUE, RaidService],
})
export class RaidModule {}
