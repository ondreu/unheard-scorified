import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { characterBank, type CharacterBankRow } from '../db/schema';

/**
 * Banka (M10+ FEAT) — úložiště mimo batoh. Stejný (itemId, quantity) model jako
 * inventář, ale vlastní tabulka/kapacita.
 */
@Injectable()
export class BankRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  list(characterId: string): Promise<CharacterBankRow[]> {
    return this.db
      .select()
      .from(characterBank)
      .where(eq(characterBank.characterId, characterId));
  }

  async getQuantity(characterId: string, itemId: string): Promise<number> {
    const [row] = await this.db
      .select()
      .from(characterBank)
      .where(and(eq(characterBank.characterId, characterId), eq(characterBank.itemId, itemId)))
      .limit(1);
    return row?.quantity ?? 0;
  }

  /** Přidá `qty` kusů do banky (upsert). */
  async addItemQty(characterId: string, itemId: string, qty: number): Promise<void> {
    if (qty <= 0) return;
    const have = await this.getQuantity(characterId, itemId);
    if (have > 0) {
      await this.db
        .update(characterBank)
        .set({ quantity: have + qty })
        .where(and(eq(characterBank.characterId, characterId), eq(characterBank.itemId, itemId)));
    } else {
      await this.db.insert(characterBank).values({ characterId, itemId, quantity: qty });
    }
  }

  /** Odebere `qty` kusů z banky; řádek smaže při ≤0. False = málo kusů. */
  async consume(characterId: string, itemId: string, qty: number): Promise<boolean> {
    const have = await this.getQuantity(characterId, itemId);
    if (have < qty) return false;
    const remaining = have - qty;
    if (remaining <= 0) {
      await this.db
        .delete(characterBank)
        .where(and(eq(characterBank.characterId, characterId), eq(characterBank.itemId, itemId)));
    } else {
      await this.db
        .update(characterBank)
        .set({ quantity: remaining })
        .where(and(eq(characterBank.characterId, characterId), eq(characterBank.itemId, itemId)));
    }
    return true;
  }
}
