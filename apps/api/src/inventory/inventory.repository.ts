import { Inject, Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import {
  characterInventory,
  characterEquipment,
  type CharacterInventory,
  type CharacterEquipment,
} from '../db/schema';

@Injectable()
export class InventoryRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Vrátí celý inventář postavy. */
  async listInventory(characterId: string): Promise<CharacterInventory[]> {
    return this.db
      .select()
      .from(characterInventory)
      .where(eq(characterInventory.characterId, characterId));
  }

  /** Vrátí všechny equipnuté itemy postavy. */
  async listEquipment(characterId: string): Promise<CharacterEquipment[]> {
    return this.db
      .select()
      .from(characterEquipment)
      .where(eq(characterEquipment.characterId, characterId));
  }

  /** Přidá item do inventáře s inkrementem quantity (upsert). */
  async addItem(characterId: string, itemId: string): Promise<void> {
    // Zjistit existující záznam
    const [existing] = await this.db
      .select()
      .from(characterInventory)
      .where(
        and(
          eq(characterInventory.characterId, characterId),
          eq(characterInventory.itemId, itemId),
        ),
      )
      .limit(1);

    if (existing) {
      await this.db
        .update(characterInventory)
        .set({ quantity: existing.quantity + 1 })
        .where(
          and(
            eq(characterInventory.characterId, characterId),
            eq(characterInventory.itemId, itemId),
          ),
        );
    } else {
      await this.db.insert(characterInventory).values({ characterId, itemId, quantity: 1 });
    }
  }

  /** Přidá `qty` kusů itemu (upsert). Použito AH při doručení/vrácení stacku. */
  async addItemQty(characterId: string, itemId: string, qty: number): Promise<void> {
    if (qty <= 0) return;
    const have = await this.getQuantity(characterId, itemId);
    if (have > 0) {
      await this.db
        .update(characterInventory)
        .set({ quantity: have + qty })
        .where(
          and(
            eq(characterInventory.characterId, characterId),
            eq(characterInventory.itemId, itemId),
          ),
        );
    } else {
      await this.db.insert(characterInventory).values({ characterId, itemId, quantity: qty });
    }
  }

  /** Počet kusů daného itemu v inventáři (0 pokud žádný). */
  async getQuantity(characterId: string, itemId: string): Promise<number> {
    const [row] = await this.db
      .select()
      .from(characterInventory)
      .where(
        and(
          eq(characterInventory.characterId, characterId),
          eq(characterInventory.itemId, itemId),
        ),
      )
      .limit(1);
    return row?.quantity ?? 0;
  }

  /**
   * Odebere `qty` kusů itemu z inventáře. Když by množství kleslo na ≤0, řádek
   * smaže. Vrací `false`, pokud postava nemá dost kusů (žádná změna).
   */
  async consume(characterId: string, itemId: string, qty: number): Promise<boolean> {
    const have = await this.getQuantity(characterId, itemId);
    if (have < qty) return false;
    const remaining = have - qty;
    if (remaining <= 0) {
      await this.db
        .delete(characterInventory)
        .where(
          and(
            eq(characterInventory.characterId, characterId),
            eq(characterInventory.itemId, itemId),
          ),
        );
    } else {
      await this.db
        .update(characterInventory)
        .set({ quantity: remaining })
        .where(
          and(
            eq(characterInventory.characterId, characterId),
            eq(characterInventory.itemId, itemId),
          ),
        );
    }
    return true;
  }

  /** Equipne item do slotu (upsert). */
  async equip(characterId: string, slot: string, itemId: string): Promise<CharacterEquipment> {
    const [row] = await this.db
      .insert(characterEquipment)
      .values({ characterId, slot, itemId })
      .onConflictDoUpdate({
        target: [characterEquipment.characterId, characterEquipment.slot],
        set: { itemId },
      })
      .returning();
    return row!;
  }

  /** Odebere item ze slotu. */
  async unequip(characterId: string, slot: string): Promise<void> {
    await this.db
      .delete(characterEquipment)
      .where(
        and(
          eq(characterEquipment.characterId, characterId),
          eq(characterEquipment.slot, slot),
        ),
      );
  }

  /** Vrátí equipnutý item v konkrétním slotu. */
  async getEquippedInSlot(characterId: string, slot: string): Promise<CharacterEquipment | undefined> {
    const [row] = await this.db
      .select()
      .from(characterEquipment)
      .where(
        and(
          eq(characterEquipment.characterId, characterId),
          eq(characterEquipment.slot, slot),
        ),
      )
      .limit(1);
    return row;
  }
}
