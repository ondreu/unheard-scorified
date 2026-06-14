import { Inject, Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { characterTalents, type CharacterTalent } from '../db/schema';

@Injectable()
export class TalentRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Vrátí všechny talenty postavy jako mapa talentId → points. */
  async listTalents(characterId: string): Promise<CharacterTalent[]> {
    return this.db
      .select()
      .from(characterTalents)
      .where(eq(characterTalents.characterId, characterId));
  }

  /** Alokuje nebo inkrementuje bod v talentu. */
  async allocate(characterId: string, talentId: string): Promise<CharacterTalent> {
    const [existing] = await this.db
      .select()
      .from(characterTalents)
      .where(
        and(
          eq(characterTalents.characterId, characterId),
          eq(characterTalents.talentId, talentId),
        ),
      )
      .limit(1);

    if (existing) {
      const [row] = await this.db
        .update(characterTalents)
        .set({ points: existing.points + 1 })
        .where(
          and(
            eq(characterTalents.characterId, characterId),
            eq(characterTalents.talentId, talentId),
          ),
        )
        .returning();
      return row!;
    } else {
      const [row] = await this.db
        .insert(characterTalents)
        .values({ characterId, talentId, points: 1 })
        .returning();
      return row!;
    }
  }

  /** Resetuje všechny talenty postavy. */
  async resetAll(characterId: string): Promise<void> {
    await this.db.delete(characterTalents).where(eq(characterTalents.characterId, characterId));
  }
}
