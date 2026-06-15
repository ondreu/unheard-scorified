import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { BuffDataModule } from '../buff/buff-data.module';
import { ConsumableController } from './consumable.controller';
import { ConsumableService } from './consumable.service';

/**
 * Spotřebáky (M10): „use" → dočasný stat buff (`CONSUMABLE_BUFFS`), který se
 * přičítá do bojového profilu přes `InventoryService.getEquipmentStats` (buffy
 * žijí v `BuffDataModule`). Recykluje `InventoryRepository` (spotřeba kusu).
 */
@Module({
  imports: [AuthModule, CharacterModule, InventoryModule, BuffDataModule],
  controllers: [ConsumableController],
  providers: [ConsumableService],
})
export class ConsumableModule {}
