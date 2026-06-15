import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { RotationRule } from '@game/shared';
import { DB, type Database } from '../db/db.module';
import { characterRotations } from '../db/schema';

@Injectable()
export class RotationRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Uložená pravidla rotace postavy (nebo null = použít default). */
  async getRules(characterId: string): Promise<RotationRule[] | null> {
    const [row] = await this.db
      .select()
      .from(characterRotations)
      .where(eq(characterRotations.characterId, characterId))
      .limit(1);
    return row?.rules ?? null;
  }

  /** Uloží (upsert) pravidla rotace postavy. */
  async setRules(characterId: string, rules: RotationRule[]): Promise<void> {
    await this.db
      .insert(characterRotations)
      .values({ characterId, rules })
      .onConflictDoUpdate({ target: characterRotations.characterId, set: { rules } });
  }
}
