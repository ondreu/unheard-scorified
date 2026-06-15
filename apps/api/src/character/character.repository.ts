import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
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

  /** Načte více postav podle id najednou (např. pro žebříček arény). */
  findByIds(ids: string[]): Promise<Character[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db.select().from(characters).where(inArray(characters.id, ids));
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

  /**
   * Atomicky strhne zlato, jen pokud má postava dostatek (where gold >= amount).
   * Vrací true při úspěchu (zabraňuje zápornému zůstatku i souběhu). Použito
   * AH (deposit/bid/buyout escrow, M8).
   */
  async spendGold(id: string, amount: number): Promise<boolean> {
    if (amount <= 0) return true;
    const rows = await this.db
      .update(characters)
      .set({ gold: sql`${characters.gold} - ${amount}` })
      .where(and(eq(characters.id, id), sql`${characters.gold} >= ${amount}`))
      .returning({ id: characters.id });
    return rows.length > 0;
  }

  /** Připíše zlato postavě (návrat bidu/depositu, výnos z prodeje). */
  async addGold(id: string, amount: number): Promise<void> {
    if (amount === 0) return;
    await this.db
      .update(characters)
      .set({ gold: sql`${characters.gold} + ${amount}` })
      .where(eq(characters.id, id));
  }
}
