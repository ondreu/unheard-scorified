import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, lte } from 'drizzle-orm';
import type { PartyRunState, PartyRunStatus } from '@game/shared';
import { DB, type Database } from '../db/db.module';
import {
  dungeonPartyParticipants,
  dungeonPartyRuns,
  type DungeonPartyParticipant,
  type DungeonPartyRun,
  type NewDungeonPartyParticipant,
  type NewDungeonPartyRun,
} from '../db/schema';

/**
 * Persistence živých MP tahových dungeon runů (ADR 0038, Slice 4). Sdílený
 * multi-owner run + účastníci (per-člen personal reward), mirror raid runů.
 */
@Injectable()
export class DungeonPartyRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async createRun(data: NewDungeonPartyRun): Promise<DungeonPartyRun> {
    const [row] = await this.db.insert(dungeonPartyRuns).values(data).returning();
    return row!;
  }

  async addParticipant(data: NewDungeonPartyParticipant): Promise<void> {
    await this.db.insert(dungeonPartyParticipants).values(data);
  }

  async findRun(id: string): Promise<DungeonPartyRun | undefined> {
    const [row] = await this.db
      .select()
      .from(dungeonPartyRuns)
      .where(eq(dungeonPartyRuns.id, id))
      .limit(1);
    return row;
  }

  listParticipants(runId: string): Promise<DungeonPartyParticipant[]> {
    return this.db
      .select()
      .from(dungeonPartyParticipants)
      .where(eq(dungeonPartyParticipants.runId, runId));
  }

  async getParticipant(runId: string, characterId: string): Promise<DungeonPartyParticipant | undefined> {
    const [row] = await this.db
      .select()
      .from(dungeonPartyParticipants)
      .where(
        and(
          eq(dungeonPartyParticipants.runId, runId),
          eq(dungeonPartyParticipants.characterId, characterId),
        ),
      )
      .limit(1);
    return row;
  }

  /**
   * Atomicky **zabere prošlé kolo** (deadline ≤ teď) — posune deadline a vrátí
   * řádek, JEN pokud kolo bylo opravdu prošlé. Row-lock serializuje souběh
   * (submit-resolve vs deadline-job na různých instancích) → jeden vítěz, žádné
   * dvojí vyhodnocení. `undefined` = nebylo co zabrat.
   */
  async claimDueRound(runId: string, newDeadline: Date): Promise<DungeonPartyRun | undefined> {
    const now = new Date();
    const [row] = await this.db
      .update(dungeonPartyRuns)
      .set({ roundDeadline: newDeadline, updatedAt: now })
      .where(
        and(
          eq(dungeonPartyRuns.id, runId),
          eq(dungeonPartyRuns.status, 'in_combat'),
          isNotNull(dungeonPartyRuns.roundDeadline),
          lte(dungeonPartyRuns.roundDeadline, now),
        ),
      )
      .returning();
    return row;
  }

  /** Je postava účastníkem daného runu? */
  async isParticipant(runId: string, characterId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ runId: dungeonPartyParticipants.runId })
      .from(dungeonPartyParticipants)
      .where(
        and(
          eq(dungeonPartyParticipants.runId, runId),
          eq(dungeonPartyParticipants.characterId, characterId),
        ),
      )
      .limit(1);
    return !!row;
  }

  /** Aktivní (rozehraný) MP run, jehož je postava účastníkem — nejvýše jeden. */
  async findActiveForCharacter(characterId: string): Promise<DungeonPartyRun | undefined> {
    const partRows = await this.db
      .select({ runId: dungeonPartyParticipants.runId })
      .from(dungeonPartyParticipants)
      .where(eq(dungeonPartyParticipants.characterId, characterId));
    const ids = partRows.map((r) => r.runId);
    if (ids.length === 0) return undefined;
    const [row] = await this.db
      .select()
      .from(dungeonPartyRuns)
      .where(and(inArray(dungeonPartyRuns.id, ids), eq(dungeonPartyRuns.status, 'in_combat')))
      .orderBy(desc(dungeonPartyRuns.createdAt))
      .limit(1);
    return row;
  }

  /** Uloží průběžný stav (po kole / submitu) + deadline dalšího kola. */
  async updateState(
    id: string,
    state: PartyRunState,
    status: PartyRunStatus,
    encountersCleared: number,
    roundDeadline: Date | null,
  ): Promise<void> {
    await this.db
      .update(dungeonPartyRuns)
      .set({ state, status, encountersCleared, roundDeadline, updatedAt: new Date() })
      .where(eq(dungeonPartyRuns.id, id));
  }

  /** Uzavře run (clear / wipe / abandon). */
  async finalizeRun(
    id: string,
    state: PartyRunState,
    status: PartyRunStatus,
    encountersCleared: number,
  ): Promise<void> {
    const now = new Date();
    await this.db
      .update(dungeonPartyRuns)
      .set({ state, status, encountersCleared, roundDeadline: null, updatedAt: now, finishedAt: now })
      .where(eq(dungeonPartyRuns.id, id));
  }

  /** Zapíše per-člen reward (při finalizaci). */
  async setParticipantReward(
    runId: string,
    characterId: string,
    reward: { xp: number; gold: number; items: string[] },
  ): Promise<void> {
    await this.db
      .update(dungeonPartyParticipants)
      .set({ rewardXp: reward.xp, rewardGold: reward.gold, rewardItems: reward.items })
      .where(
        and(
          eq(dungeonPartyParticipants.runId, runId),
          eq(dungeonPartyParticipants.characterId, characterId),
        ),
      );
  }
}
