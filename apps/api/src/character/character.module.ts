import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterController } from './character.controller';
import { CharacterRepository } from './character.repository';
import { CharacterService } from './character.service';
import { InventoryRepository } from '../inventory/inventory.repository';

@Module({
  imports: [AuthModule],
  controllers: [CharacterController],
  // InventoryRepository je stateless (jen DB token) — pro veřejný inspect (equipnutý
  // gear). Vlastní instance v CharacterModule se vyhne cyklu s InventoryModule.
  providers: [CharacterService, CharacterRepository, InventoryRepository],
  exports: [CharacterRepository],
})
export class CharacterModule {}
