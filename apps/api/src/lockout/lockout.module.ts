import { Module } from '@nestjs/common';
import { LockoutRepository } from './lockout.repository';

/**
 * Weekly lockout (M8.6, ekonomika). Sdílená perzistence týdenního lockoutu pro
 * group PVE obsah (raidy + vyšší dungeony). Importují raid i dungeon modul; obsah
 * a deterministické klíče počítá `@game/shared`. Viz ADR 0015.
 */
@Module({
  providers: [LockoutRepository],
  exports: [LockoutRepository],
})
export class LockoutModule {}
