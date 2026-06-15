import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { characterBags, type CharacterBag } from '../db/schema';

/** Vložené batohy postavy (M10 limited inventory). */
@Injectable()
export class BagRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Batohy ve všech bag slotech postavy (seřazené dle slotu). */
  async list(characterId: string): Promise<CharacterBag[]> {
    const rows = await this.db
      .select()
      .from(characterBags)
      .where(eq(characterBags.characterId, characterId));
    return rows.sort((a, b) => a.slotIndex - b.slotIndex);
  }

  /** Id batohů vložených do bag slotů (pro výpočet kapacity). */
  async equippedBagIds(characterId: string): Promise<string[]> {
    const rows = await this.list(characterId);
    return rows.map((r) => r.bagId);
  }

  async getAt(characterId: string, slotIndex: number): Promise<CharacterBag | undefined> {
    const [row] = await this.db
      .select()
      .from(characterBags)
      .where(and(eq(characterBags.characterId, characterId), eq(characterBags.slotIndex, slotIndex)))
      .limit(1);
    return row;
  }

  /** Vloží/přepíše batoh do daného bag slotu. */
  async set(characterId: string, slotIndex: number, bagId: string): Promise<void> {
    await this.db
      .insert(characterBags)
      .values({ characterId, slotIndex, bagId })
      .onConflictDoUpdate({
        target: [characterBags.characterId, characterBags.slotIndex],
        set: { bagId },
      });
  }

  /** Vyjme batoh z daného bag slotu. */
  async clear(characterId: string, slotIndex: number): Promise<void> {
    await this.db
      .delete(characterBags)
      .where(and(eq(characterBags.characterId, characterId), eq(characterBags.slotIndex, slotIndex)));
  }
}
