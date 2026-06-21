import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { BestiaryController } from './bestiary.controller';
import { BestiaryRepository } from './bestiary.repository';
import { BestiaryService } from './bestiary.service';

/**
 * Bestiář (encyklopedie nepřátel). Read-model nad katalogem nestvůr
 * (`@game/shared`) + per-postava odemčení/kill counter. `BestiaryService` je
 * exportovaný — `ActivityModule`/`DungeonModule` ho používají k zápisu killů.
 */
@Module({
  imports: [AuthModule, CharacterModule],
  controllers: [BestiaryController],
  providers: [BestiaryService, BestiaryRepository],
  exports: [BestiaryService],
})
export class BestiaryModule {}
