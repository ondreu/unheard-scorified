import { Module } from '@nestjs/common';
import { MountRepository } from './mount.repository';

/**
 * Leaf modul s `MountRepository` (jen DB token, který je @Global). Importují ho
 * BEZ cyklu jak MountModule (koupě/výběr), tak ActivityModule a ProfessionModule
 * (čtou vlastněné mounty pro speed bonus při startu pohybové aktivity). Stejný
 * vzor jako ProfessionDataModule — moduly se navzájem neimportují.
 */
@Module({
  providers: [MountRepository],
  exports: [MountRepository],
})
export class MountDataModule {}
