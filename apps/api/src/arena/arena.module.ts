import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PushModule } from '../push/push.module';
import { TalentModule } from '../talent/talent.module';
import { ArenaController } from './arena.controller';
import { ArenaEventsRelay } from './arena.events';
import { ArenaGateway } from './arena.gateway';
import { ARENA_LEADERBOARD, RedisArenaLeaderboard } from './arena.leaderboard';
import { MATCHMAKING_QUEUE, RedisMatchmakingQueue } from './arena.matchmaking';
import { ArenaRepository } from './arena.repository';
import { ArenaService } from './arena.service';

/**
 * Areny (M7, MP PVP). Matchmaking (Redis fronta), deterministický 1v1 auto-resolve
 * (recykluje combat engine z M5), Elo rating + sezónní ladder (Redis sorted set),
 * realtime přes WebSocket gateway + Redis pub/sub adaptér (viz main.ts, ADR 0010).
 *
 * Matchmaking fronta i žebříček jsou za rozhraním (Redis impl v produkci,
 * in-memory ve flow testech).
 */
@Module({
  imports: [AuthModule, CharacterModule, InventoryModule, TalentModule, PushModule],
  controllers: [ArenaController],
  providers: [
    ArenaService,
    ArenaRepository,
    ArenaEventsRelay,
    ArenaGateway,
    { provide: MATCHMAKING_QUEUE, useClass: RedisMatchmakingQueue },
    { provide: ARENA_LEADERBOARD, useClass: RedisArenaLeaderboard },
  ],
})
export class ArenaModule {}
