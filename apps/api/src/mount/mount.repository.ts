import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { characterMounts, type CharacterMount } from '../db/schema';

@Injectable()
export class MountRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Všechny vlastněné mounty postavy. */
  listByCharacter(characterId: string): Promise<CharacterMount[]> {
    return this.db
      .select()
      .from(characterMounts)
      .where(eq(characterMounts.characterId, characterId));
  }

  /** Id vlastněných mountů (pro výpočet speed bonusu). */
  async ownedIds(characterId: string): Promise<string[]> {
    const rows = await this.db
      .select({ mountId: characterMounts.mountId })
      .from(characterMounts)
      .where(eq(characterMounts.characterId, characterId));
    return rows.map((r) => r.mountId);
  }

  async owns(characterId: string, mountId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ mountId: characterMounts.mountId })
      .from(characterMounts)
      .where(and(eq(characterMounts.characterId, characterId), eq(characterMounts.mountId, mountId)))
      .limit(1);
    return row !== undefined;
  }

  /** Přidá mount postavě (idempotentně — duplicitní vlastnictví ignoruje). */
  async add(characterId: string, mountId: string): Promise<void> {
    await this.db
      .insert(characterMounts)
      .values({ characterId, mountId })
      .onConflictDoNothing();
  }
}
