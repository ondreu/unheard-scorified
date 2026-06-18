import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { SpellController } from './spell.controller';
import { SpellService } from './spell.service';

/** Spell sloty + spellbook (MR-4). D&D tiered spell sloty, Long Rest recharge. */
@Module({
  imports: [AuthModule, CharacterModule],
  controllers: [SpellController],
  providers: [SpellService],
  exports: [SpellService],
})
export class SpellModule {}
