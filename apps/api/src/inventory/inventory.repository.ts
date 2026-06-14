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
