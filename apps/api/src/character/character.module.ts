import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterController } from './character.controller';
import { CharacterRepository } from './character.repository';
import { CharacterService } from './character.service';
import { InventoryRepository } from '../inventory/inventory.repository';
import { GroupRepository } from '../group/group.repository';

@Module({
  imports: [AuthModule],
  controllers: [CharacterController],
  // InventoryRepository + GroupRepository jsou stateless (jen DB token) — pro
  // veřejný inspect (gear + zda je hráč ve skupině). Vlastní instance se vyhnou
  // modulovým cyklům (InventoryModule/GroupModule importují CharacterModule).
  providers: [CharacterService, CharacterRepository, InventoryRepository, GroupRepository],
  exports: [CharacterRepository],
})
export class CharacterModule {}
