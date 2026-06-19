import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { DungeonRunState, DungeonRunStatus } from '@game/shared';
import { DB, type Database } from '../db/db.module';
import { dungeonTurnRuns, type DungeonTurnRun, type NewDungeonTurnRun } from '../db/schema';

/**
 * Persistence tahových dungeon runů (ADR 0037, Slice 2). Mirror
 * `GauntletRepository` — stavový JSON run, nejvýše jeden aktivní na postavu.
 */
@Injectable()
export class DungeonTurnRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async createRun(data: NewDungeonTurnRun): Promise<DungeonTurnRun> {
    const [row] = await this.db.insert(dungeonTurnRuns).values(data).returning();
    return row!;
  }

  async findRun(id: string): Promise<DungeonTurnRun | undefined> {
    const [row] = await this.db
      .select()
      .from(dungeonTurnRuns)
      .where(eq(dungeonTurnRuns.id, id))
      .limit(1);
    return row;
  }

  /** Aktivní (rozehraný) tahový run postavy — nejvýše jeden najednou. */
  async findActiveForCharacter(characterId: string): Promise<DungeonTurnRun | undefined> {
    const [row] = await this.db
      .select()
      .from(dungeonTurnRuns)
      .where(
        and(eq(dungeonTurnRuns.characterId, characterId), eq(dungeonTurnRuns.status, 'in_combat')),
      )
      .orderBy(desc(dungeonTurnRuns.createdAt))
      .limit(1);
    return row;
  }

  /** Uloží průběžný stav (po tahu). */
  async updateState(
    id: string,
    state: DungeonRunState,
    status: DungeonRunStatus,
    encountersCleared: number,
  ): Promise<void> {
    await this.db
      .update(dungeonTurnRuns)
      .set({ state, status, encountersCleared, updatedAt: new Date() })
      .where(eq(dungeonTurnRuns.id, id));
  }

  /** Uzavře run (clear / smrt / abandon) + zapíše udělenou odměnu. */
  async finalizeRun(
    id: string,
    state: DungeonRunState,
    status: DungeonRunStatus,
    encountersCleared: number,
    reward: { xp: number; gold: number; items: string[] },
  ): Promise<void> {
    const now = new Date();
    await this.db
      .update(dungeonTurnRuns)
      .set({
        state,
        status,
        encountersCleared,
        rewardXp: reward.xp,
        rewardGold: reward.gold,
        rewardItems: reward.items,
        updatedAt: now,
        finishedAt: now,
      })
      .where(eq(dungeonTurnRuns.id, id));
  }

  listRecent(characterId: string, limit: number): Promise<DungeonTurnRun[]> {
    return this.db
      .select()
      .from(dungeonTurnRuns)
      .where(eq(dungeonTurnRuns.characterId, characterId))
      .orderBy(desc(dungeonTurnRuns.createdAt))
      .limit(limit);
  }
}
