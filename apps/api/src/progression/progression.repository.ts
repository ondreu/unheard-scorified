import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import {
  arenaRatings,
  characterAchievements,
  completedQuests,
  friendships,
  raidRunParticipants,
  raidRuns,
} from '../db/schema';

/**
 * Read-model pro achievementy (M9): agreguje metriky z existujících tabulek
 * (žádné invazivní countery). Stateless.
 */
@Injectable()
export class ProgressionRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  private async count(query: Promise<{ count: number }[]>): Promise<number> {
    const [row] = await query;
    return row?.count ?? 0;
  }

  questsCompleted(characterId: string): Promise<number> {
    return this.count(
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(completedQuests)
        .where(eq(completedQuests.characterId, characterId)),
    );
  }

  /** Počet vítězných group-run clearů daného typu (dungeon/raid) pro postavu. */
  clears(characterId: string, contentType: 'dungeon' | 'raid'): Promise<number> {
    return this.count(
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(raidRunParticipants)
        .innerJoin(raidRuns, eq(raidRunParticipants.raidRunId, raidRuns.id))
        .where(
          and(
            eq(raidRunParticipants.characterId, characterId),
            eq(raidRuns.contentType, contentType),
            eq(raidRuns.victory, 1),
          ),
        ),
    );
  }

  async arenaWins(characterId: string): Promise<number> {
    const [row] = await this.db
      .select({ wins: sql<number>`coalesce(sum(${arenaRatings.wins}), 0)::int` })
      .from(arenaRatings)
      .where(eq(arenaRatings.characterId, characterId));
    return row?.wins ?? 0;
  }

  friends(characterId: string): Promise<number> {
    return this.count(
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(friendships)
        .where(
          and(
            eq(friendships.status, 'accepted'),
            or(
              eq(friendships.requesterCharacterId, characterId),
              eq(friendships.addresseeCharacterId, characterId),
            ),
          ),
        ),
    );
  }

  async claimedIds(characterId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ id: characterAchievements.achievementId })
      .from(characterAchievements)
      .where(eq(characterAchievements.characterId, characterId));
    return new Set(rows.map((r) => r.id));
  }

  /** Idempotentní zápis nároku (PK brání dvojímu udělení). Vrací true při prvním. */
  async claim(characterId: string, achievementId: string): Promise<boolean> {
    const rows = await this.db
      .insert(characterAchievements)
      .values({ characterId, achievementId })
      .onConflictDoNothing()
      .returning();
    return rows.length > 0;
  }
}
