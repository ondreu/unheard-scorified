import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { SpellSlots } from '@game/shared';
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

  /** Najde postavu podle (globálně unikátního) jména. Pro friends (M9 social). */
  async findByName(name: string): Promise<Character | undefined> {
    const [row] = await this.db
      .select()
      .from(characters)
      .where(eq(characters.name, name))
      .limit(1);
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

  /** Nastaví kosmeticky zvolený („active") mount postavy (M10+). */
  async setActiveMount(id: string, mountId: string | null): Promise<Character> {
    const [row] = await this.db
      .update(characters)
      .set({ activeMountId: mountId })
      .where(eq(characters.id, id))
      .returning();
    return row!;
  }

  /** Připíše zlato postavě (návrat bidu/depositu, výnos z prodeje). */
  async addGold(id: string, amount: number): Promise<void> {
    if (amount === 0) return;
    await this.db
      .update(characters)
      .set({ gold: sql`${characters.gold} + ${amount}` })
      .where(eq(characters.id, id));
  }

  /**
   * Nastaví vyčerpané spell sloty (MR-4). Aktivita při startu spotřebuje
   * (spend), Long Rest při claimu/návratu dobije (`{}`). Vrací aktualizovaný řádek.
   */
  async setSpentSpellSlots(id: string, spent: SpellSlots): Promise<Character> {
    const [row] = await this.db
      .update(characters)
      .set({ spentSpellSlots: spent })
      .where(eq(characters.id, id))
      .returning();
    return row!;
  }

  /**
   * Uloží aktivní (prepared) kouzla postavy (Kniha kouzel, ADR 0039). `null` =
   * vrátit na legacy baseline kit (auto). Vrací aktualizovaný řádek.
   */
  async setPreparedSpells(id: string, prepared: string[] | null): Promise<Character> {
    const [row] = await this.db
      .update(characters)
      .set({ preparedSpells: prepared })
      .where(eq(characters.id, id))
      .returning();
    return row!;
  }

  /** Smaže postavu (cascade FK smaže i inventář/aktivity/guild membership atd.). */
  async delete(id: string): Promise<void> {
    await this.db.delete(characters).where(eq(characters.id, id));
  }
}
