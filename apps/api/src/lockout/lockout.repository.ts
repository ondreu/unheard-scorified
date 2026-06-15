import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { characterLockouts } from '../db/schema';

/**
 * Týdenní lockout per postava (M8.6). Drží, zda je postava „saved" pro daný
 * obsah (`lockoutId`) v daném UTC týdnu (`weekId`). Klíče (lockoutId/weekId)
 * počítá `@game/shared` (`lockoutIdForContent` / `weeklyLockoutId`) — repository
 * jen perzistuje. Viz ADR 0015.
 */
@Injectable()
export class LockoutRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Je postava pro daný obsah už zamčená v tomto týdnu? */
  async isLocked(characterId: string, lockoutId: string, weekId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ characterId: characterLockouts.characterId })
      .from(characterLockouts)
      .where(
        and(
          eq(characterLockouts.characterId, characterId),
          eq(characterLockouts.lockoutId, lockoutId),
          eq(characterLockouts.weekId, weekId),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  /**
   * Zamkne postavu pro daný obsah v tomto týdnu. Idempotentní (PK + DO NOTHING):
   * vrací `true`, pokud lockout právě vznikl, `false` pokud už existoval (závod).
   */
  async acquire(characterId: string, lockoutId: string, weekId: string): Promise<boolean> {
    const rows = await this.db
      .insert(characterLockouts)
      .values({ characterId, lockoutId, weekId })
      .onConflictDoNothing()
      .returning({ characterId: characterLockouts.characterId });
    return rows.length > 0;
  }
}
