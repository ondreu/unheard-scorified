import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { completedQuests, type CompletedQuest } from '../db/schema';

@Injectable()
export class CompletedQuestRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listByCharacter(characterId: string): Promise<CompletedQuest[]> {
    return this.db
      .select()
      .from(completedQuests)
      .where(eq(completedQuests.characterId, characterId));
  }

  async completedIds(characterId: string): Promise<string[]> {
    const rows = await this.listByCharacter(characterId);
    return rows.map((r) => r.questId);
  }

  /** Označí story quest jako dokončený (idempotentně). */
  async markCompleted(characterId: string, questId: string): Promise<void> {
    await this.db.insert(completedQuests).values({ characterId, questId }).onConflictDoNothing();
  }
}
