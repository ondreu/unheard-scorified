import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { GroupMemberStatus, RaidRole } from '@game/shared';
import { DB, type Database } from '../db/db.module';
import { groups, groupMembers, type Group, type GroupMember } from '../db/schema';

/** Skupina + řádek členství volajícího (pro `activeMembership`/`listInvites`). */
export interface GroupWithMember {
  group: Group;
  member: GroupMember;
}

/**
 * Perzistence trvalých skupin (M9, ADR 0022). Postava má nejvýše jedno `joined`
 * členství (hlídá service); pozvánky = řádky se statusem `invited`.
 */
@Injectable()
export class GroupRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async createGroup(leaderCharacterId: string): Promise<Group> {
    const [row] = await this.db.insert(groups).values({ leaderCharacterId }).returning();
    return row!;
  }

  async findGroup(id: string): Promise<Group | undefined> {
    const [row] = await this.db.select().from(groups).where(eq(groups.id, id)).limit(1);
    return row;
  }

  async deleteGroup(id: string): Promise<void> {
    await this.db.delete(groups).where(eq(groups.id, id));
  }

  async setLeader(groupId: string, characterId: string): Promise<void> {
    await this.db.update(groups).set({ leaderCharacterId: characterId }).where(eq(groups.id, groupId));
  }

  async listMembers(groupId: string): Promise<GroupMember[]> {
    return this.db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId));
  }

  async findMember(groupId: string, characterId: string): Promise<GroupMember | undefined> {
    const [row] = await this.db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.characterId, characterId)))
      .limit(1);
    return row;
  }

  async addMember(
    groupId: string,
    characterId: string,
    role: RaidRole,
    status: GroupMemberStatus,
  ): Promise<void> {
    await this.db.insert(groupMembers).values({ groupId, characterId, role, status });
  }

  async setMember(
    groupId: string,
    characterId: string,
    status: GroupMemberStatus,
    role?: RaidRole,
  ): Promise<void> {
    await this.db
      .update(groupMembers)
      .set(role ? { status, role } : { status })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.characterId, characterId)));
  }

  async removeMember(groupId: string, characterId: string): Promise<void> {
    await this.db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.characterId, characterId)));
  }

  /** Skupina, kde je postava `joined` (aktivní členství), nebo undefined. */
  async activeMembership(characterId: string): Promise<GroupWithMember | undefined> {
    const rows = await this.db
      .select({ group: groups, member: groupMembers })
      .from(groupMembers)
      .innerJoin(groups, eq(groupMembers.groupId, groups.id))
      .where(and(eq(groupMembers.characterId, characterId), eq(groupMembers.status, 'joined')))
      .limit(1);
    return rows[0];
  }

  /** Skupiny, kam je postava pozvaná (status `invited`). */
  async listInvites(characterId: string): Promise<GroupWithMember[]> {
    return this.db
      .select({ group: groups, member: groupMembers })
      .from(groupMembers)
      .innerJoin(groups, eq(groupMembers.groupId, groups.id))
      .where(and(eq(groupMembers.characterId, characterId), eq(groupMembers.status, 'invited')));
  }
}
