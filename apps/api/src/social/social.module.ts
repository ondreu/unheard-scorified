import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { ChatController } from './chat.controller';
import { ChatRepository } from './chat.repository';
import { ChatService } from './chat.service';
import { GuildController } from './guild.controller';
import { GuildRepository } from './guild.repository';
import { GuildService } from './guild.service';
import { SocialController } from './social.controller';
import { SocialEventsRelay } from './social.events';
import { SocialGateway } from './social.gateway';
import { SocialRepository } from './social.repository';
import { SocialService } from './social.service';

/**
 * Sociální systém (M9): friends (per-postava, vanilla-WoW styl) + jednoduchý
 * globální chat. Realtime recykluje vrstvu z M7 (socket.io + Redis pub/sub
 * adaptér). Gateway a relay jsou oddělené (žádný DI cyklus service↔gateway),
 * viz `SocialEventsRelay`. Viz ADR 0016.
 */
@Module({
  imports: [AuthModule, CharacterModule],
  controllers: [SocialController, ChatController, GuildController],
  providers: [
    SocialService,
    SocialRepository,
    ChatService,
    ChatRepository,
    GuildService,
    GuildRepository,
    SocialEventsRelay,
    SocialGateway,
  ],
  // GuildRepository + SocialRepository sdílené týmovými arénami (M8.5-C gate).
  exports: [SocialEventsRelay, SocialRepository, GuildRepository],
})
export class SocialModule {}
