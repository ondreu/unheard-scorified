import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { DungeonRunState, DungeonRunStatus } from '@game/shared';
import { DB, type Database } from '../db/db.module';
import { duelRuns, type DuelRun, type NewDuelRun } from '../db/schema';

/**
 * Persistence tahových duelů (Duel v bestiáři, Slice 2). Mirror
 * `DungeonTurnRepository`, ale **bez reward sloupců** (duel nikdy nedává odměny).
 * Nejvýše jeden aktivní duel na postavu (samostatná tabulka → nekoliduje s
 * aktivním dungeon runem).
 */
@Injectable()
export class DuelRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async createRun(data: NewDuelRun): Promise<DuelRun> {
    const [row] = await this.db.insert(duelRuns).values(data).returning();
    return row!;
  }

  async findRun(id: string): Promise<DuelRun | undefined> {
    const [row] = await this.db.select().from(duelRuns).where(eq(duelRuns.id, id)).limit(1);
    return row;
  }

  /** Aktivní (rozehraný) duel postavy — nejvýše jeden najednou. */
  async findActiveForCharacter(characterId: string): Promise<DuelRun | undefined> {
    const [row] = await this.db
      .select()
      .from(duelRuns)
      .where(and(eq(duelRuns.characterId, characterId), eq(duelRuns.status, 'in_combat')))
      .orderBy(desc(duelRuns.createdAt))
      .limit(1);
    return row;
  }

  /** Uloží průběžný stav (po tahu). */
  async updateState(id: string, state: DungeonRunState, status: DungeonRunStatus): Promise<void> {
    await this.db
      .update(duelRuns)
      .set({ state, status, updatedAt: new Date() })
      .where(eq(duelRuns.id, id));
  }

  /** Uzavře duel (clear / smrt / abandon) — žádné odměny k zápisu. */
  async finalizeRun(id: string, state: DungeonRunState, status: DungeonRunStatus): Promise<void> {
    const now = new Date();
    await this.db
      .update(duelRuns)
      .set({ state, status, updatedAt: now, finishedAt: now })
      .where(eq(duelRuns.id, id));
  }
}
