import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { VendorController } from './vendor.controller';
import { VendorService } from './vendor.service';

/**
 * Vendoři (M10 ekonomika). NPC nákup (gold sink) / odkup (gold source) za pevné
 * ceny z `@game/shared` (`vendorBuyPrice`/`vendorSellPrice`). Recykluje
 * `InventoryRepository` (přidání/odebrání itemů) a `CharacterRepository`
 * (atomický gold).
 */
@Module({
  imports: [AuthModule, CharacterModule, InventoryModule],
  controllers: [VendorController],
  providers: [VendorService],
})
export class VendorModule {}
