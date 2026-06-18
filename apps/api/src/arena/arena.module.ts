import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { HistoryModule } from '../history/history.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PushModule } from '../push/push.module';
import { SocialModule } from '../social/social.module';
import { RotationModule } from '../rotation/rotation.module';
import { ArenaController } from './arena.controller';
import { ArenaEventsRelay } from './arena.events';
import { ArenaGateway } from './arena.gateway';
import { ARENA_LEADERBOARD, RedisArenaLeaderboard } from './arena.leaderboard';
import { MATCHMAKING_QUEUE, RedisMatchmakingQueue } from './arena.matchmaking';
import { ArenaRepository } from './arena.repository';
import { ArenaService } from './arena.service';
import { TeamArenaController } from './team-arena.controller';
import { TEAM_ARENA_QUEUE, RedisTeamArenaQueue } from './team-arena.queue';
import { TeamArenaService } from './team-arena.service';

/**
 * Areny (M7, MP PVP). Matchmaking (Redis fronta), deterministický 1v1 auto-resolve
 * (recykluje combat engine z M5), Elo rating + sezónní ladder (Redis sorted set),
 * realtime přes WebSocket gateway + Redis pub/sub adaptér (viz main.ts, ADR 0010).
 *
 * Matchmaking fronta i žebříček jsou za rozhraním (Redis impl v produkci,
 * in-memory ve flow testech).
 */
@Module({
  imports: [
    AuthModule,
    CharacterModule,
    HistoryModule,
    InventoryModule,
    PushModule,
    SocialModule,
    RotationModule,
  ],
  controllers: [ArenaController, TeamArenaController],
  providers: [
    ArenaService,
    ArenaRepository,
    ArenaEventsRelay,
    ArenaGateway,
    TeamArenaService,
    { provide: MATCHMAKING_QUEUE, useClass: RedisMatchmakingQueue },
    { provide: ARENA_LEADERBOARD, useClass: RedisArenaLeaderboard },
    { provide: TEAM_ARENA_QUEUE, useClass: RedisTeamArenaQueue },
  ],
  // GroupModule (ADR 0022) spouští arénu přes ArenaService (1v1) /
  // TeamArenaService (3v3/5v5).
  exports: [TeamArenaService, ArenaService],
})
export class ArenaModule {}
