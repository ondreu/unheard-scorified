import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MailController } from './mail.controller';
import { MailRepository } from './mail.repository';
import { MailService } from './mail.service';

/** Pošta (M9): offline zprávy + přílohy (itemy/zlato). Viz `MailService`. */
@Module({
  imports: [AuthModule, CharacterModule, InventoryModule],
  controllers: [MailController],
  providers: [MailService, MailRepository],
})
export class MailModule {}
