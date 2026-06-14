import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { characters, type Character, type NewCharacter } from '../db/schema';

@Injectable()
export class CharacterRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(data: NewCharacter): Promise<Character> {
    const [row] = await this.db.insert(characters).values(data).returning();
    return row!;
  }

  listByAccount(accountId: string): Promise<Character[]> {
    return this.db.select().from(characters).where(eq(characters.accountId, accountId));
  }

  async findOwned(accountId: string, id: string): Promise<Character | undefined> {
    const [row] = await this.db
      .select()
      .from(characters)
      .where(and(eq(characters.id, id), eq(characters.accountId, accountId)))
      .limit(1);
    return row;
  }

  async findById(id: string): Promise<Character | undefined> {
    const [row] = await this.db.select().from(characters).where(eq(characters.id, id)).limit(1);
    return row;
  }

  /** Připíše XP a zlato postavě (odměny z aktivity). Vrací aktualizovaný řádek. */
  async addRewards(id: string, xp: number, gold: number): Promise<Character> {
    const [row] = await this.db
      .update(characters)
      .set({ totalXp: sql`${characters.totalXp} + ${xp}`, gold: sql`${characters.gold} + ${gold}` })
      .where(eq(characters.id, id))
      .returning();
    return row!;
  }
}
