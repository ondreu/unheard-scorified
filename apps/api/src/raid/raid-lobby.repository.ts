import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { LobbyMemberStatus, RaidRole } from '@game/shared';
import { DB, type Database } from '../db/db.module';
import {
  raidLobbies,
  raidLobbyMembers,
  type NewRaidLobby,
  type RaidLobby,
  type RaidLobbyMember,
} from '../db/schema';

/**
 * Přístup k raid lobby tabulkám (M8.5-B, ruční formace). Stateless. Vyšší logika
 * (oprávnění, NPC backfill, spuštění) je v `RaidLobbyService`.
 */
@Injectable()
export class RaidLobbyRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async createLobby(data: NewRaidLobby): Promise<RaidLobby> {
    const [row] = await this.db.insert(raidLobbies).values(data).returning();
    return row!;
  }

  async findLobby(id: string): Promise<RaidLobby | undefined> {
    const [row] = await this.db.select().from(raidLobbies).where(eq(raidLobbies.id, id)).limit(1);
    return row;
  }

  async setStatus(id: string, status: 'forming' | 'started' | 'cancelled', runId?: string): Promise<void> {
    await this.db
      .update(raidLobbies)
      .set({ status, ...(runId ? { runId } : {}) })
      .where(eq(raidLobbies.id, id));
  }

  async addMember(
    lobbyId: string,
    characterId: string,
    role: RaidRole,
    status: LobbyMemberStatus,
  ): Promise<void> {
    await this.db.insert(raidLobbyMembers).values({ lobbyId, characterId, role, status });
  }

  async findMember(lobbyId: string, characterId: string): Promise<RaidLobbyMember | undefined> {
    const [row] = await this.db
      .select()
      .from(raidLobbyMembers)
      .where(
        and(
          eq(raidLobbyMembers.lobbyId, lobbyId),
          eq(raidLobbyMembers.characterId, characterId),
        ),
      )
      .limit(1);
    return row;
  }

  listMembers(lobbyId: string): Promise<RaidLobbyMember[]> {
    return this.db
      .select()
      .from(raidLobbyMembers)
      .where(eq(raidLobbyMembers.lobbyId, lobbyId));
  }

  async setMember(
    lobbyId: string,
    characterId: string,
    status: LobbyMemberStatus,
    role: RaidRole,
  ): Promise<void> {
    await this.db
      .update(raidLobbyMembers)
      .set({ status, role })
      .where(
        and(
          eq(raidLobbyMembers.lobbyId, lobbyId),
          eq(raidLobbyMembers.characterId, characterId),
        ),
      );
  }

  async removeMember(lobbyId: string, characterId: string): Promise<void> {
    await this.db
      .delete(raidLobbyMembers)
      .where(
        and(
          eq(raidLobbyMembers.lobbyId, lobbyId),
          eq(raidLobbyMembers.characterId, characterId),
        ),
      );
  }

  /** Forming lobby, kde je postava připojeným členem (nejvýše jedno). */
  async activeMembership(
    characterId: string,
  ): Promise<{ lobby: RaidLobby; member: RaidLobbyMember } | undefined> {
    const rows = await this.db
      .select({ lobby: raidLobbies, member: raidLobbyMembers })
      .from(raidLobbyMembers)
      .innerJoin(raidLobbies, eq(raidLobbyMembers.lobbyId, raidLobbies.id))
      .where(
        and(
          eq(raidLobbyMembers.characterId, characterId),
          eq(raidLobbyMembers.status, 'joined'),
          eq(raidLobbies.status, 'forming'),
        ),
      )
      .limit(1);
    return rows[0];
  }

  /** Příchozí pozvánky postavy (do formujících se lobby). */
  listInvites(characterId: string): Promise<{ lobby: RaidLobby; member: RaidLobbyMember }[]> {
    return this.db
      .select({ lobby: raidLobbies, member: raidLobbyMembers })
      .from(raidLobbyMembers)
      .innerJoin(raidLobbies, eq(raidLobbyMembers.lobbyId, raidLobbies.id))
      .where(
        and(
          eq(raidLobbyMembers.characterId, characterId),
          eq(raidLobbyMembers.status, 'invited'),
          eq(raidLobbies.status, 'forming'),
        ),
      );
  }
}
