import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import {
  raidRunParticipants,
  raidRuns,
  type NewRaidRun,
  type NewRaidRunParticipant,
  type RaidRun,
  type RaidRunParticipant,
} from '../db/schema';

@Injectable()
export class RaidRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async createRun(data: NewRaidRun): Promise<RaidRun> {
    const [row] = await this.db.insert(raidRuns).values(data).returning();
    return row!;
  }

  async findRun(id: string): Promise<RaidRun | undefined> {
    const [row] = await this.db.select().from(raidRuns).where(eq(raidRuns.id, id)).limit(1);
    return row;
  }

  async addParticipant(data: NewRaidRunParticipant): Promise<RaidRunParticipant> {
    const [row] = await this.db.insert(raidRunParticipants).values(data).returning();
    return row!;
  }

  listParticipants(runId: string): Promise<RaidRunParticipant[]> {
    return this.db
      .select()
      .from(raidRunParticipants)
      .where(eq(raidRunParticipants.raidRunId, runId));
  }

  /** Nedávné runy postavy (s jejím participant řádkem), nejnovější první. */
  async listRecentForCharacter(
    characterId: string,
    limit: number,
  ): Promise<{ run: RaidRun; participant: RaidRunParticipant }[]> {
    const rows = await this.db
      .select({ run: raidRuns, participant: raidRunParticipants })
      .from(raidRunParticipants)
      .innerJoin(raidRuns, eq(raidRunParticipants.raidRunId, raidRuns.id))
      .where(eq(raidRunParticipants.characterId, characterId))
      .orderBy(desc(raidRuns.createdAt))
      .limit(limit);
    return rows;
  }
}
