import { Module } from '@nestjs/common';
import { ArenaModule } from '../arena/arena.module';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { DungeonModule } from '../dungeon/dungeon.module';
import { SocialModule } from '../social/social.module';
import { GroupController } from './group.controller';
import { GroupRepository } from './group.repository';
import { GroupService } from './group.service';

/**
 * Trvalá skupina (party) — M9, ADR 0022. Jeden formační systém pro dungeon i
 * arénu (nahradil ruční team arénu; raidy vyříznuty — ADR 0033). Spouštění
 * recykluje `DungeonService.runForGroup` a `ArenaService`/`TeamArenaService`
 * (velikost → bracket). Pozvánky gated na friends/guild (SocialModule).
 */
@Module({
  imports: [AuthModule, CharacterModule, SocialModule, DungeonModule, ArenaModule],
  controllers: [GroupController],
  providers: [GroupService, GroupRepository],
})
export class GroupModule {}
