import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { BankController } from './bank.controller';
import { BankRepository } from './bank.repository';
import { BankService } from './bank.service';

/**
 * Banka (M10+ FEAT) — úložiště mimo batoh. Deposit/withdraw přesouvá itemy mezi
 * inventářem (InventoryModule) a bankou; respektuje kapacitu batohu i banky.
 */
@Module({
  imports: [AuthModule, CharacterModule, InventoryModule],
  controllers: [BankController],
  providers: [BankService, BankRepository],
})
export class BankModule {}
