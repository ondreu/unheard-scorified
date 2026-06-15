import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, or, sql } from 'drizzle-orm';
import { STARTING_RATING, type ArenaBracket } from '@game/shared';
import { DB, type Database } from '../db/db.module';
import {
  arenaMatches,
  arenaRatings,
  arenaSeasonRewards,
  arenaTeamMatches,
  type ArenaMatch,
  type ArenaRating,
  type ArenaSeasonReward,
  type ArenaTeamMatch,
  type NewArenaMatch,
  type NewArenaSeasonReward,
  type NewArenaTeamMatch,
} from '../db/schema';

@Injectable()
export class ArenaRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  // ── Ratings ────────────────────────────────────────────────────────────────

  /** Vrátí rating řádek; pokud neexistuje, založí ho s STARTING_RATING. */
  async ensureRating(
    characterId: string,
    bracket: ArenaBracket,
    seasonId: string,
  ): Promise<ArenaRating> {
    await this.db
      .insert(arenaRatings)
      .values({ characterId, bracket, seasonId, rating: STARTING_RATING })
      .onConflictDoNothing();
    const row = await this.getRating(characterId, bracket, seasonId);
    return row!;
  }

  async getRating(
    characterId: string,
    bracket: ArenaBracket,
    seasonId: string,
  ): Promise<ArenaRating | undefined> {
    const [row] = await this.db
      .select()
      .from(arenaRatings)
      .where(
        and(
          eq(arenaRatings.characterId, characterId),
          eq(arenaRatings.bracket, bracket),
          eq(arenaRatings.seasonId, seasonId),
        ),
      )
      .limit(1);
    return row;
  }

  /** Nastaví nový rating a inkrementuje výhry/prohry (won = true → +1 win). */
  async recordResult(
    characterId: string,
    bracket: ArenaBracket,
    seasonId: string,
    newRating: number,
    won: boolean,
  ): Promise<ArenaRating> {
    const [row] = await this.db
      .update(arenaRatings)
      .set({
        rating: newRating,
        wins: won ? sql`${arenaRatings.wins} + 1` : arenaRatings.wins,
        losses: won ? arenaRatings.losses : sql`${arenaRatings.losses} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(arenaRatings.characterId, characterId),
          eq(arenaRatings.bracket, bracket),
          eq(arenaRatings.seasonId, seasonId),
        ),
      )
      .returning();
    return row!;
  }

  /** Žebříček: nejvyšší ratingy sezóny/bracketu (durable fallback k Redis cache). */
  listTopRatings(seasonId: string, bracket: ArenaBracket, limit: number): Promise<ArenaRating[]> {
    return this.db
      .select()
      .from(arenaRatings)
      .where(and(eq(arenaRatings.seasonId, seasonId), eq(arenaRatings.bracket, bracket)))
      .orderBy(desc(arenaRatings.rating))
      .limit(limit);
  }

  /** Počet postav s vyšším ratingem (rank = count + 1). */
  async countHigher(
    seasonId: string,
    bracket: ArenaBracket,
    rating: number,
  ): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(arenaRatings)
      .where(
        and(
          eq(arenaRatings.seasonId, seasonId),
          eq(arenaRatings.bracket, bracket),
          gt(arenaRatings.rating, rating),
        ),
      );
    return row?.count ?? 0;
  }

  /** Rating řádky postavy napříč sezónami (pro lazy sezónní rollover). */
  listRatingsForCharacter(characterId: string): Promise<ArenaRating[]> {
    return this.db.select().from(arenaRatings).where(eq(arenaRatings.characterId, characterId));
  }

  // ── Sezónní odměny (archiv) ──────────────────────────────────────────────────

  async getSeasonReward(
    characterId: string,
    seasonId: string,
    bracket: ArenaBracket,
  ): Promise<ArenaSeasonReward | undefined> {
    const [row] = await this.db
      .select()
      .from(arenaSeasonRewards)
      .where(
        and(
          eq(arenaSeasonRewards.characterId, characterId),
          eq(arenaSeasonRewards.seasonId, seasonId),
          eq(arenaSeasonRewards.bracket, bracket),
        ),
      )
      .limit(1);
    return row;
  }

  listSeasonRewards(characterId: string): Promise<ArenaSeasonReward[]> {
    return this.db
      .select()
      .from(arenaSeasonRewards)
      .where(eq(arenaSeasonRewards.characterId, characterId));
  }

  /** Idempotentní zápis archivované sezóny (PK brání dvojímu udělení). */
  async insertSeasonReward(data: NewArenaSeasonReward): Promise<boolean> {
    const rows = await this.db
      .insert(arenaSeasonRewards)
      .values(data)
      .onConflictDoNothing()
      .returning();
    return rows.length > 0;
  }

  // ── Zápasy ────────────────────────────────────────────────────────────────

  async createMatch(data: NewArenaMatch): Promise<ArenaMatch> {
    const [row] = await this.db.insert(arenaMatches).values(data).returning();
    return row!;
  }

  async findMatch(id: string): Promise<ArenaMatch | undefined> {
    const [row] = await this.db.select().from(arenaMatches).where(eq(arenaMatches.id, id)).limit(1);
    return row;
  }

  listMatchesForCharacter(characterId: string, limit: number): Promise<ArenaMatch[]> {
    return this.db
      .select()
      .from(arenaMatches)
      .where(or(eq(arenaMatches.aCharacterId, characterId), eq(arenaMatches.bCharacterId, characterId)))
      .orderBy(desc(arenaMatches.createdAt))
      .limit(limit);
  }

  // ── Týmové zápasy (M8.5-C) ───────────────────────────────────────────────────

  async createTeamMatch(data: NewArenaTeamMatch): Promise<ArenaTeamMatch> {
    const [row] = await this.db.insert(arenaTeamMatches).values(data).returning();
    return row!;
  }

  async findTeamMatch(id: string): Promise<ArenaTeamMatch | undefined> {
    const [row] = await this.db
      .select()
      .from(arenaTeamMatches)
      .where(eq(arenaTeamMatches.id, id))
      .limit(1);
    return row;
  }
}
