import { Module } from '@nestjs/common';
import { BuffRepository } from './buff.repository';

/**
 * Leaf modul s `BuffRepository` (jen @Global DB token). Importují ho BEZ cyklu
 * InventoryModule (aktivní buffy se přičítají do bojového profilu přes
 * `getEquipmentStats`) i ConsumableModule (use → apply buff). Stejný vzor jako
 * MountDataModule.
 */
@Module({
  providers: [BuffRepository],
  exports: [BuffRepository],
})
export class BuffDataModule {}
