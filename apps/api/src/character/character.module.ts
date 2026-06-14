import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterController } from './character.controller';
import { CharacterRepository } from './character.repository';
import { CharacterService } from './character.service';

@Module({
  imports: [AuthModule],
  controllers: [CharacterController],
  providers: [CharacterService, CharacterRepository],
  exports: [CharacterRepository],
})
export class CharacterModule {}
