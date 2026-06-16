import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { HistoryController } from './history.controller';
import { HistoryRepository } from './history.repository';
import { HistoryService } from './history.service';

/**
 * Persistentní historie dokončených aktivit (questy/profese/dungeony/raidy/arény).
 * `HistoryRepository` (append-only zápis) je exportovaný → služby, které udělují
 * odměny, importují tento modul a zapisují výsledek. Čtení přes `GET
 * /characters/:id/history`.
 */
@Module({
  imports: [AuthModule, CharacterModule],
  controllers: [HistoryController],
  providers: [HistoryService, HistoryRepository],
  exports: [HistoryRepository],
})
export class HistoryModule {}
