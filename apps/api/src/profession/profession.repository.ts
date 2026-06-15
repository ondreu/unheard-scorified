import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import {
  MAX_PROFESSION_SKILL,
  MAX_REPUTATION,
  type FactionId,
  type ProfessionId,
} from '@game/shared';
import { DB, type Database } from '../db/db.module';
import {
  characterProfessions,
  characterReputation,
  type CharacterProfession,
  type CharacterReputation,
} from '../db/schema';

/** Default skill, když postava ještě nemá řádek (umí profese od startu). */
export const DEFAULT_PROFESSION_SKILL = 1;

@Injectable()
export class ProfessionRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  listSkills(characterId: string): Promise<CharacterProfession[]> {
    return this.db
      .select()
      .from(characterProfessions)
      .where(eq(characterProfessions.characterId, characterId));
  }

  /** Aktuální skill profese (default 1, pokud řádek neexistuje). */
  async getSkill(characterId: string, professionId: ProfessionId): Promise<number> {
    const [row] = await this.db
      .select()
      .from(characterProfessions)
      .where(
        and(
          eq(characterProfessions.characterId, characterId),
          eq(characterProfessions.professionId, professionId),
        ),
      )
      .limit(1);
    return row?.skill ?? DEFAULT_PROFESSION_SKILL;
  }

  /** Nastaví skill profese (upsert, ořezáno na strop). */
  async setSkill(characterId: string, professionId: ProfessionId, skill: number): Promise<void> {
    const clamped = Math.max(DEFAULT_PROFESSION_SKILL, Math.min(MAX_PROFESSION_SKILL, skill));
    await this.db
      .insert(characterProfessions)
      .values({ characterId, professionId, skill: clamped })
      .onConflictDoUpdate({
        target: [characterProfessions.characterId, characterProfessions.professionId],
        set: { skill: clamped },
      });
  }
}

@Injectable()
export class ReputationRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  listStandings(characterId: string): Promise<CharacterReputation[]> {
    return this.db
      .select()
      .from(characterReputation)
      .where(eq(characterReputation.characterId, characterId));
  }

  /** Standing s frakcí (0, pokud řádek neexistuje). */
  async getStanding(characterId: string, factionId: FactionId): Promise<number> {
    const [row] = await this.db
      .select()
      .from(characterReputation)
      .where(
        and(
          eq(characterReputation.characterId, characterId),
          eq(characterReputation.factionId, factionId),
        ),
      )
      .limit(1);
    return row?.standing ?? 0;
  }

  /** Připíše standing (upsert, ořezáno na strop). Vrací nový standing. */
  async addStanding(characterId: string, factionId: FactionId, amount: number): Promise<number> {
    const [row] = await this.db
      .insert(characterReputation)
      .values({ characterId, factionId, standing: Math.min(MAX_REPUTATION, amount) })
      .onConflictDoUpdate({
        target: [characterReputation.characterId, characterReputation.factionId],
        set: { standing: sql`LEAST(${characterReputation.standing} + ${amount}, ${MAX_REPUTATION})` },
      })
      .returning();
    return row?.standing ?? 0;
  }
}
