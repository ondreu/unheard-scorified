import { Module } from '@nestjs/common';
import { MailRepository } from './mail.repository';

/**
 * Leaf modul s `MailRepository` (jen @Global DB token). Importují ho BEZ cyklu
 * MailModule i InventoryModule (overflow plného inventáře → systémová pošta).
 * Stejný vzor jako MountDataModule/BuffDataModule.
 */
@Module({
  providers: [MailRepository],
  exports: [MailRepository],
})
export class MailDataModule {}
