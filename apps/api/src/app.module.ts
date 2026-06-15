import { Module } from '@nestjs/common';
import { ActivityModule } from './activity/activity.module';
import { ArenaModule } from './arena/arena.module';
import { AuctionModule } from './auction/auction.module';
import { AuthModule } from './auth/auth.module';
import { CharacterModule } from './character/character.module';
import { DbModule } from './db/db.module';
import { DungeonModule } from './dungeon/dungeon.module';
import { HealthModule } from './health/health.module';
import { InventoryModule } from './inventory/inventory.module';
import { ProfessionModule } from './profession/profession.module';
import { PushModule } from './push/push.module';
import { QuestModule } from './quest/quest.module';
import { RaidModule } from './raid/raid.module';
import { RedisModule } from './redis/redis.module';
import { TalentModule } from './talent/talent.module';

/**
 * Kořenový modul. Každý herní systém je vlastní feature modul
 * (viz apps/api/CLAUDE.md). Globální infrastruktura: DB, Redis.
 */
@Module({
  imports: [
    DbModule,
    RedisModule,
    HealthModule,
    AuthModule,
    CharacterModule,
    QuestModule,
    PushModule,
    ActivityModule,
    InventoryModule,
    TalentModule,
    DungeonModule,
    ProfessionModule,
    ArenaModule,
    RaidModule,
    AuctionModule,
  ],
})
export class AppModule {}
