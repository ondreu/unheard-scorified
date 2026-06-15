import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { BuffDataModule } from '../buff/buff-data.module';
import { MailDataModule } from '../mail/mail-data.module';
import { BagController } from './bag.controller';
import { BagRepository } from './bag.repository';
import { BagService } from './bag.service';
import { InventoryController } from './inventory.controller';
import { InventoryGrantService } from './inventory-grant.service';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';

@Module({
  imports: [AuthModule, CharacterModule, BuffDataModule, MailDataModule],
  controllers: [InventoryController, BagController],
  providers: [InventoryService, InventoryRepository, BagRepository, BagService, InventoryGrantService],
  exports: [InventoryRepository, InventoryService, BagRepository, InventoryGrantService],
})
export class InventoryModule {}
