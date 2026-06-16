import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterController } from './character.controller';
import { CharacterRepository } from './character.repository';
import { CharacterService } from './character.service';
import { InventoryRepository } from '../inventory/inventory.repository';
import { GroupRepository } from '../group/group.repository';
import { GuildRepository } from '../social/guild.repository';

@Module({
  imports: [AuthModule],
  controllers: [CharacterController],
  // InventoryRepository + GroupRepository + GuildRepository jsou stateless (jen
  // DB token) — pro veřejný inspect (gear, skupina, guilda). Vlastní instance se
  // vyhnou modulovým cyklům (Inventory/Group/Social moduly importují CharacterModule).
  providers: [
    CharacterService,
    CharacterRepository,
    InventoryRepository,
    GroupRepository,
    GuildRepository,
  ],
  exports: [CharacterRepository],
})
export class CharacterModule {}
