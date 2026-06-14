import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import {
  characterActivities,
  type CharacterActivity,
  type NewCharacterActivity,
} from '../db/schema';

@Injectable()
export class ActivityRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(data: NewCharacterActivity): Promise<CharacterActivity> {
    const [row] = await this.db.insert(characterActivities).values(data).returning();
    return row!;
  }

  async findByCharacter(characterId: string): Promise<CharacterActivity | undefined> {
    const [row] = await this.db
      .select()
      .from(characterActivities)
      .where(eq(characterActivities.characterId, characterId))
      .limit(1);
    return row;
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(characterActivities).where(eq(characterActivities.id, id));
  }
}
