import { Inject, Injectable } from '@nestjs/common';
import { eq, and, inArray } from 'drizzle-orm';
import type { LevelUpChoice, SubclassId } from '@game/shared';
import { DB, type Database } from '../db/db.module';
import { characterLevelUpChoices, characters, type CharacterLevelUpChoice } from '../db/schema';

@Injectable()
export class LevelUpRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Všechny uložené level-up volby postavy. */
  async listChoices(characterId: string): Promise<CharacterLevelUpChoice[]> {
    return this.db
      .select()
      .from(characterLevelUpChoices)
      .where(eq(characterLevelUpChoices.characterId, characterId));
  }

  /** Uloží (upsert) volbu do slotu. */
  async setChoice(characterId: string, slotId: string, choice: LevelUpChoice): Promise<void> {
    await this.db
      .insert(characterLevelUpChoices)
      .values({ characterId, slotId, choice })
      .onConflictDoUpdate({
        target: [characterLevelUpChoices.characterId, characterLevelUpChoices.slotId],
        set: { choice },
      });
  }

  /** Nastaví zvolenou subclass na postavě (denormalizace pro rychlý combat lookup). */
  async setSubclass(characterId: string, subclass: SubclassId): Promise<void> {
    await this.db
      .update(characters)
      .set({ subclass })
      .where(eq(characters.id, characterId));
  }

  /** Smaže konkrétní sloty (např. osiřelé class-feature volby po změně subclassi). */
  async deleteSlots(characterId: string, slotIds: string[]): Promise<void> {
    if (slotIds.length === 0) return;
    await this.db
      .delete(characterLevelUpChoices)
      .where(
        and(
          eq(characterLevelUpChoices.characterId, characterId),
          inArray(characterLevelUpChoices.slotId, slotIds),
        ),
      );
  }

  /** Resetuje všechny level-up volby postavy (i denormalizovanou subclass). */
  async resetAll(characterId: string): Promise<void> {
    await this.db
      .delete(characterLevelUpChoices)
      .where(eq(characterLevelUpChoices.characterId, characterId));
    await this.db.update(characters).set({ subclass: null }).where(eq(characters.id, characterId));
  }

  /** Vrátí jednu volbu slotu (nebo undefined). */
  async getChoice(characterId: string, slotId: string): Promise<CharacterLevelUpChoice | undefined> {
    const [row] = await this.db
      .select()
      .from(characterLevelUpChoices)
      .where(
        and(
          eq(characterLevelUpChoices.characterId, characterId),
          eq(characterLevelUpChoices.slotId, slotId),
        ),
      )
      .limit(1);
    return row;
  }
}
