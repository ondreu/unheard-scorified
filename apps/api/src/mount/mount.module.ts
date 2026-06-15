import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { MountDataModule } from './mount-data.module';
import { MountController } from './mount.controller';
import { MountService } from './mount.service';

/**
 * Mounty (M10+ FEAT). Koupě za zlato (gold sink, level-gated) + výběr aktivního
 * (kosmetického) mountu. Speed bonus se aplikuje při startu pohybových aktivit
 * (quest/gather) v Activity/Profession modulech přes sdílený `MountRepository`
 * (MountDataModule), proto tady jen player-facing endpointy.
 */
@Module({
  imports: [AuthModule, CharacterModule, MountDataModule],
  controllers: [MountController],
  providers: [MountService],
})
export class MountModule {}
