import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { TalentModule } from '../talent/talent.module';
import { RotationController } from './rotation.controller';
import { RotationRepository } from './rotation.repository';
import { RotationService } from './rotation.service';

@Module({
  imports: [AuthModule, CharacterModule, TalentModule, InventoryModule],
  controllers: [RotationController],
  providers: [RotationService, RotationRepository],
  exports: [RotationService, RotationRepository],
})
export class RotationModule {}
