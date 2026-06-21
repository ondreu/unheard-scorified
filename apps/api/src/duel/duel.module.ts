import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { RotationModule } from '../rotation/rotation.module';
import { DuelController } from './duel.controller';
import { DuelRepository } from './duel.repository';
import { DuelService } from './duel.service';

/**
 * Tahový duel (Duel v bestiáři, Slice 2) — interaktivní testovací souboj proti
 * katalogovému nepříteli. Stateful run (vlastní tabulka `duel_runs`), sdílí engine
 * s tahovým dungeonem, ale **bez jakýchkoli odměn**. `RotationModule` = combat profil.
 */
@Module({
  imports: [AuthModule, CharacterModule, RotationModule],
  controllers: [DuelController],
  providers: [DuelService, DuelRepository],
})
export class DuelModule {}
