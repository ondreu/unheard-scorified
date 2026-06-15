import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { GuildRank } from '@game/shared';
import { DB, type Database } from '../db/db.module';
import {
  guildCharterSignatures,
  guildCharters,
  guildInvites,
  guildMembers,
  guilds,
  type Guild,
  type GuildCharter,
  type GuildCharterSignature,
  type GuildInvite,
  type GuildMember,
} from '../db/schema';

/**
 * Přístup k tabulkám guildy (M9 social). Stateless. Operace nad členstvím a
 * pozvánkami; vyšší logika (oprávnění, auto-promote vůdce) je v `GuildService`.
 */
@Injectable()
export class GuildRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findById(id: string): Promise<Guild | undefined> {
    const [row] = await this.db.select().from(guilds).where(eq(guilds.id, id)).limit(1);
    return row;
  }

  async findByName(name: string): Promise<Guild | undefined> {
    const [row] = await this.db.select().from(guilds).where(eq(guilds.name, name)).limit(1);
    return row;
  }

  /** Členství postavy (postava je nejvýše v jedné guildě). */
  async membershipOf(characterId: string): Promise<GuildMember | undefined> {
    const [row] = await this.db
      .select()
      .from(guildMembers)
      .where(eq(guildMembers.characterId, characterId))
      .limit(1);
    return row;
  }

  listMembers(guildId: string): Promise<GuildMember[]> {
    return this.db.select().from(guildMembers).where(eq(guildMembers.guildId, guildId));
  }

  async countMembers(guildId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, guildId));
    return row?.count ?? 0;
  }

  /** Vytvoří guildu a založí vůdce jako prvního člena. */
  async createGuild(name: string, leaderCharacterId: string): Promise<Guild> {
    const [guild] = await this.db
      .insert(guilds)
      .values({ name, leaderCharacterId })
      .returning();
    await this.db
      .insert(guildMembers)
      .values({ guildId: guild!.id, characterId: leaderCharacterId, rank: 'leader' });
    return guild!;
  }

  async addMember(guildId: string, characterId: string, rank: GuildRank): Promise<void> {
    await this.db.insert(guildMembers).values({ guildId, characterId, rank });
  }

  async removeMember(guildId: string, characterId: string): Promise<void> {
    await this.db
      .delete(guildMembers)
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.characterId, characterId)));
  }

  async setRank(guildId: string, characterId: string, rank: GuildRank): Promise<void> {
    await this.db
      .update(guildMembers)
      .set({ rank })
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.characterId, characterId)));
  }

  async setLeader(guildId: string, characterId: string): Promise<void> {
    await this.db
      .update(guilds)
      .set({ leaderCharacterId: characterId })
      .where(eq(guilds.id, guildId));
  }

  async deleteGuild(id: string): Promise<void> {
    await this.db.delete(guilds).where(eq(guilds.id, id));
  }

  // ── Invites ──────────────────────────────────────────────────────────────

  async createInvite(
    guildId: string,
    characterId: string,
    invitedByCharacterId: string,
  ): Promise<GuildInvite> {
    const [row] = await this.db
      .insert(guildInvites)
      .values({ guildId, characterId, invitedByCharacterId })
      .returning();
    return row!;
  }

  async findInviteById(id: string): Promise<GuildInvite | undefined> {
    const [row] = await this.db
      .select()
      .from(guildInvites)
      .where(eq(guildInvites.id, id))
      .limit(1);
    return row;
  }

  async findInvite(guildId: string, characterId: string): Promise<GuildInvite | undefined> {
    const [row] = await this.db
      .select()
      .from(guildInvites)
      .where(
        and(eq(guildInvites.guildId, guildId), eq(guildInvites.characterId, characterId)),
      )
      .limit(1);
    return row;
  }

  listInvitesForCharacter(characterId: string): Promise<GuildInvite[]> {
    return this.db
      .select()
      .from(guildInvites)
      .where(eq(guildInvites.characterId, characterId));
  }

  async deleteInvite(id: string): Promise<void> {
    await this.db.delete(guildInvites).where(eq(guildInvites.id, id));
  }

  // ── Charters (vanilla-WoW založení: poplatek + podpisy) ────────────────────

  async createCharter(name: string, founderCharacterId: string): Promise<GuildCharter> {
    const [row] = await this.db
      .insert(guildCharters)
      .values({ name, founderCharacterId })
      .returning();
    return row!;
  }

  async findCharterById(id: string): Promise<GuildCharter | undefined> {
    const [row] = await this.db
      .select()
      .from(guildCharters)
      .where(eq(guildCharters.id, id))
      .limit(1);
    return row;
  }

  async findCharterByName(name: string): Promise<GuildCharter | undefined> {
    const [row] = await this.db
      .select()
      .from(guildCharters)
      .where(eq(guildCharters.name, name))
      .limit(1);
    return row;
  }

  /** Charter založený danou postavou (postava má nejvýše jeden). */
  async charterOf(founderCharacterId: string): Promise<GuildCharter | undefined> {
    const [row] = await this.db
      .select()
      .from(guildCharters)
      .where(eq(guildCharters.founderCharacterId, founderCharacterId))
      .limit(1);
    return row;
  }

  async deleteCharter(id: string): Promise<void> {
    await this.db.delete(guildCharters).where(eq(guildCharters.id, id));
  }

  /** Vytvoří žádost o podpis (signed=false) pro danou postavu. */
  async createSignatureRequest(
    charterId: string,
    characterId: string,
  ): Promise<GuildCharterSignature> {
    const [row] = await this.db
      .insert(guildCharterSignatures)
      .values({ charterId, characterId })
      .returning();
    return row!;
  }

  async findSignature(
    charterId: string,
    characterId: string,
  ): Promise<GuildCharterSignature | undefined> {
    const [row] = await this.db
      .select()
      .from(guildCharterSignatures)
      .where(
        and(
          eq(guildCharterSignatures.charterId, charterId),
          eq(guildCharterSignatures.characterId, characterId),
        ),
      )
      .limit(1);
    return row;
  }

  listSignatures(charterId: string): Promise<GuildCharterSignature[]> {
    return this.db
      .select()
      .from(guildCharterSignatures)
      .where(eq(guildCharterSignatures.charterId, charterId));
  }

  /** Počet potvrzených (signed=true) podpisů charteru. */
  async countSignatures(charterId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(guildCharterSignatures)
      .where(
        and(
          eq(guildCharterSignatures.charterId, charterId),
          eq(guildCharterSignatures.signed, true),
        ),
      );
    return row?.count ?? 0;
  }

  /** Čekající žádosti o podpis pro danou postavu (signed=false). */
  listPendingSignaturesForCharacter(characterId: string): Promise<GuildCharterSignature[]> {
    return this.db
      .select()
      .from(guildCharterSignatures)
      .where(
        and(
          eq(guildCharterSignatures.characterId, characterId),
          eq(guildCharterSignatures.signed, false),
        ),
      );
  }

  async markSigned(id: string): Promise<void> {
    await this.db
      .update(guildCharterSignatures)
      .set({ signed: true })
      .where(eq(guildCharterSignatures.id, id));
  }

  async deleteSignature(id: string): Promise<void> {
    await this.db.delete(guildCharterSignatures).where(eq(guildCharterSignatures.id, id));
  }
}
