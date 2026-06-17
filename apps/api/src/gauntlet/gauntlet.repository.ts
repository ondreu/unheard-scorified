import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, max, sql } from 'drizzle-orm';
import type { GauntletRunState, GauntletStatus } from '@game/shared';
import { DB, type Database } from '../db/db.module';
import { gauntletDaily, gauntletRuns, type GauntletRun, type NewGauntletRun } from '../db/schema';

/** Stavy „run běží" (lze v nich pokračovat). */
const ACTIVE_STATUSES: GauntletStatus[] = ['in_combat', 'drafting'];

@Injectable()
export class GauntletRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async createRun(data: NewGauntletRun): Promise<GauntletRun> {
    const [row] = await this.db.insert(gauntletRuns).values(data).returning();
    return row!;
  }

  async findRun(id: string): Promise<GauntletRun | undefined> {
    const [row] = await this.db.select().from(gauntletRuns).where(eq(gauntletRuns.id, id)).limit(1);
    return row;
  }

  /** Aktivní (rozehraný) run postavy — nejvýše jeden najednou. */
  async findActiveForCharacter(characterId: string): Promise<GauntletRun | undefined> {
    const [row] = await this.db
      .select()
      .from(gauntletRuns)
      .where(
        and(eq(gauntletRuns.characterId, characterId), inArray(gauntletRuns.status, ACTIVE_STATUSES)),
      )
      .orderBy(desc(gauntletRuns.createdAt))
      .limit(1);
    return row;
  }

  /** Uloží průběžný stav (po tahu / draftu). */
  async updateState(
    id: string,
    state: GauntletRunState,
    status: GauntletStatus,
    wavesCleared: number,
  ): Promise<void> {
    await this.db
      .update(gauntletRuns)
      .set({ state, status, wavesCleared, updatedAt: new Date() })
      .where(eq(gauntletRuns.id, id));
  }

  /** Uzavře run (smrt / retire / dokončení) + zapíše udělenou odměnu. */
  async finalizeRun(
    id: string,
    state: GauntletRunState,
    status: GauntletStatus,
    wavesCleared: number,
    reward: { xp: number; gold: number; items: string[] },
  ): Promise<void> {
    const now = new Date();
    await this.db
      .update(gauntletRuns)
      .set({
        state,
        status,
        wavesCleared,
        rewardXp: reward.xp,
        rewardGold: reward.gold,
        rewardItems: reward.items,
        updatedAt: now,
        finishedAt: now,
      })
      .where(eq(gauntletRuns.id, id));
  }

  /** Nejlepší dosažené skóre (počet vyčištěných vln) postavy. */
  async bestWave(characterId: string): Promise<number> {
    const [row] = await this.db
      .select({ best: max(gauntletRuns.wavesCleared) })
      .from(gauntletRuns)
      .where(eq(gauntletRuns.characterId, characterId));
    return row?.best ?? 0;
  }

  listRecent(characterId: string, limit: number): Promise<GauntletRun[]> {
    return this.db
      .select()
      .from(gauntletRuns)
      .where(eq(gauntletRuns.characterId, characterId))
      .orderBy(desc(gauntletRuns.createdAt))
      .limit(limit);
  }

  /** Dnešní (UTC den) získané odměny — pro denní strop. */
  async getDaily(characterId: string, dayId: string): Promise<{ xpEarned: number; goldEarned: number }> {
    const [row] = await this.db
      .select()
      .from(gauntletDaily)
      .where(and(eq(gauntletDaily.characterId, characterId), eq(gauntletDaily.dayId, dayId)))
      .limit(1);
    return { xpEarned: row?.xpEarned ?? 0, goldEarned: row?.goldEarned ?? 0 };
  }

  /** Atomicky připíše dnešní získané odměny (upsert + increment). */
  async addDaily(characterId: string, dayId: string, xp: number, gold: number): Promise<void> {
    if (xp === 0 && gold === 0) return;
    await this.db
      .insert(gauntletDaily)
      .values({ characterId, dayId, xpEarned: xp, goldEarned: gold })
      .onConflictDoUpdate({
        target: [gauntletDaily.characterId, gauntletDaily.dayId],
        set: {
          xpEarned: sql`${gauntletDaily.xpEarned} + ${xp}`,
          goldEarned: sql`${gauntletDaily.goldEarned} + ${gold}`,
        },
      });
  }
}
