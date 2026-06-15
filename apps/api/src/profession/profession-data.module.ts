import { Module } from '@nestjs/common';
import { ProfessionRepository, ReputationRepository } from './profession.repository';

/**
 * Leaf modul s profession/reputation repository (jen DB, který je @Global).
 * Importují ho BEZ cyklu jak ProfessionModule (start gather/craft), tak
 * ActivityModule (připsání skillu/reputace při claimu) — díky tomu se moduly
 * navzájem neimportují a nevzniká forwardRef cyklus.
 */
@Module({
  providers: [ProfessionRepository, ReputationRepository],
  exports: [ProfessionRepository, ReputationRepository],
})
export class ProfessionDataModule {}
