import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { SocialController } from './social.controller';
import { SocialEventsRelay } from './social.events';
import { SocialRepository } from './social.repository';
import { SocialService } from './social.service';

/**
 * Sociální systém (M9): friends (per-postava, vanilla-WoW styl) + chat (přidán
 * samostatně, recykluje realtime vrstvu z M7 — Redis pub/sub adaptér). Gateway
 * a relay jsou oddělené (žádný DI cyklus service↔gateway), viz `SocialEventsRelay`.
 */
@Module({
  imports: [AuthModule, CharacterModule],
  controllers: [SocialController],
  providers: [SocialService, SocialRepository, SocialEventsRelay],
  exports: [SocialEventsRelay],
})
export class SocialModule {}
