import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { HistoryModule } from '../history/history.module';
import { InventoryModule } from '../inventory/inventory.module';
import { RotationModule } from '../rotation/rotation.module';
import { GauntletController } from './gauntlet.controller';
import { GauntletRepository } from './gauntlet.repository';
import { GauntletService } from './gauntlet.service';

/**
 * The Gauntlet (M13) — aktivní tahová survival aréna („time-killer"). Stateful
 * interaktivní boj (na rozdíl od idle auto-resolve obsahu), recykluje bojový
 * profil postavy (`RotationModule` → `RotationService.buildCombatProfile`),
 * sdílený engine z `@game/shared` a inventory grant pro odměny. Viz ADR 0028.
 */
@Module({
  imports: [AuthModule, CharacterModule, InventoryModule, RotationModule, HistoryModule],
  controllers: [GauntletController],
  providers: [GauntletService, GauntletRepository],
})
export class GauntletModule {}
