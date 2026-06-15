import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MailController } from './mail.controller';
import { MailDataModule } from './mail-data.module';
import { MailService } from './mail.service';

/** Pošta (M9): offline zprávy + přílohy (itemy/zlato). Viz `MailService`. */
@Module({
  imports: [AuthModule, CharacterModule, InventoryModule, MailDataModule],
  controllers: [MailController],
  providers: [MailService],
})
export class MailModule {}
