import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, lt, or, sql } from 'drizzle-orm';
import {
  activeSeasonAt,
  ARENA_BRACKETS,
  buildCharacterSheet,
  FACTIONS,
  isFactionId,
  isItemId,
  isProfessionId,
  isQuestId,
  ITEMS,
  MOUNT_LIST,
  PROFESSIONS,
  QUESTS,
  questFaction,
  reputationTier,
  totalXpForLevel,
  MAX_LEVEL,
  type ArenaBracket,
} from '@game/shared';
import { DB, type Database } from '../db/db.module';
import {
  accounts,
  arenaRatings,
  characterAchievements,
  characterActivities,
  characterEquipment,
  characterInventory,
  characterLockouts,
  characterMounts,
  characterProfessions,
  characterReputation,
  characterTalents,
  characters,
  chatMessages,
  completedQuests,
  guildMembers,
  guilds,
} from '../db/schema';
import { CharacterRepository } from '../character/character.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { ProfessionRepository } from '../profession/profession.repository';
import { ActivityRepository } from '../activity/activity.repository';

export interface DevCharacterState {
  id: string;
  name: string;
  level: number;
  totalXp: number;
  gold: number;
}

export interface DevAccountView {
  id: string;
  username: string;
  email: string | null;
  bannedAt: Date | null;
  createdAt: Date;
  characterCount: number;
}

export interface DevCharacterInspect {
  id: string;
  name: string;
  race: string;
  class: string;
  faction: string;
  level: number;
  totalXp: number;
  gold: number;
  accountId: string;
  activity: { type: string; startAt: Date; durationSec: number } | null;
  inventory: { itemId: string; name: string; quantity: number }[];
  equipment: { slot: string; itemId: string; name: string }[];
  professions: { professionId: string; skill: number }[];
  reputation: { factionId: string; factionName: string; standing: number; tier: string }[];
  arenaRatings: { bracket: string; seasonId: string; rating: number; wins: number; losses: number }[];
  guild: { id: string; name: string; rank: string } | null;
  lockouts: { lockoutId: string; weekId: string }[];
  achievements: { id: string; name: string; earnedAt: Date }[];
}

export interface DevChatMessageView {
  id: string;
  channel: string;
  senderId: string | null;
  senderName: string;
  body: string;
  at: string;
}

@Injectable()
export class DevService {
  constructor(
    private readonly charactersRepo: CharacterRepository,
    private readonly inventory: InventoryRepository,
    private readonly professions: ProfessionRepository,
    private readonly activities: ActivityRepository,
    @Inject(DB) private readonly db: Database,
  ) {}

  // ── Dev Tools ──────────────────────────────────────────────────────────────

  async getState(characterId: string): Promise<DevCharacterState> {
    const char = await this.charactersRepo.findById(characterId);
    if (!char) throw new NotFoundException('Character not found');
    const sheet = buildCharacterSheet(char.race, char.class, char.totalXp);
    return { id: char.id, name: char.name, level: sheet.level, totalXp: char.totalXp, gold: char.gold };
  }

  async setLevel(characterId: string, level: number): Promise<DevCharacterState> {
    const char = await this.charactersRepo.findById(characterId);
    if (!char) throw new NotFoundException('Character not found');
    const targetXp = totalXpForLevel(Math.min(level, MAX_LEVEL));
    await this.db.update(characters).set({ totalXp: targetXp }).where(eq(characters.id, characterId));
    return this.getState(characterId);
  }

  async addGold(characterId: string, amount: number): Promise<DevCharacterState> {
    const char = await this.charactersRepo.findById(characterId);
    if (!char) throw new NotFoundException('Character not found');
    await this.charactersRepo.addGold(characterId, amount);
    return this.getState(characterId);
  }

  /** Grant všech mountů postavě (dev/testing speed bonusu, M10+). */
  async grantAllMounts(characterId: string): Promise<DevCharacterState> {
    const char = await this.charactersRepo.findById(characterId);
    if (!char) throw new NotFoundException('Character not found');
    for (const m of MOUNT_LIST) {
      await this.db
        .insert(characterMounts)
        .values({ characterId, mountId: m.id })
        .onConflictDoNothing();
    }
    if (!char.activeMountId && MOUNT_LIST[0]) {
      await this.charactersRepo.setActiveMount(characterId, MOUNT_LIST[0].id);
    }
    return this.getState(characterId);
  }

  async addItem(characterId: string, itemId: string, quantity = 1): Promise<{ itemId: string; quantity: number; name: string }> {
    const char = await this.charactersRepo.findById(characterId);
    if (!char) throw new NotFoundException('Character not found');
    if (!isItemId(itemId)) throw new BadRequestException(`Unknown item: ${itemId}`);
    await this.inventory.addItemQty(characterId, itemId, quantity);
    return { itemId, quantity, name: ITEMS[itemId]!.name };
  }

  async completeActivity(characterId: string): Promise<{ completed: boolean; message: string }> {
    const activity = await this.activities.findByCharacter(characterId);
    if (!activity) return { completed: false, message: 'No active activity' };
    const pastDate = new Date(Date.now() - (activity.durationSec + 10) * 1000);
    await this.db
      .update(characterActivities)
      .set({ startAt: pastDate })
      .where(eq(characterActivities.characterId, characterId));
    return { completed: true, message: `Activity "${activity.activityType}" is now claimable` };
  }

  async timeWarp(characterId: string, hours: number): Promise<{ warped: boolean; message: string }> {
    const activity = await this.activities.findByCharacter(characterId);
    if (!activity) return { warped: false, message: 'No active activity to warp' };
    const shiftMs = hours * 60 * 60 * 1000;
    const newStartAt = new Date(activity.startAt.getTime() - shiftMs);
    await this.db
      .update(characterActivities)
      .set({ startAt: newStartAt })
      .where(eq(characterActivities.characterId, characterId));
    return { warped: true, message: `Warped ${hours}h forward — activity now claimable` };
  }

  async setProfession(characterId: string, professionId: string, skill: number): Promise<{ professionId: string; skill: number }> {
    const char = await this.charactersRepo.findById(characterId);
    if (!char) throw new NotFoundException('Character not found');
    if (!isProfessionId(professionId)) throw new BadRequestException(`Unknown profession: ${professionId}`);
    await this.professions.setSkill(characterId, professionId, skill);
    return { professionId, skill };
  }

  async resetCharacter(characterId: string): Promise<{ reset: boolean }> {
    const char = await this.charactersRepo.findById(characterId);
    if (!char) throw new NotFoundException('Character not found');
    await this.db.delete(characterActivities).where(eq(characterActivities.characterId, characterId));
    await this.db.delete(characterInventory).where(eq(characterInventory.characterId, characterId));
    await this.db.delete(characterEquipment).where(eq(characterEquipment.characterId, characterId));
    await this.db.delete(characterTalents).where(eq(characterTalents.characterId, characterId));
    await this.db.delete(characterMounts).where(eq(characterMounts.characterId, characterId));
    await this.db
      .update(characters)
      .set({ totalXp: 0, gold: 0, activeMountId: null })
      .where(eq(characters.id, characterId));
    return { reset: true };
  }

  listItems(): { id: string; name: string; slot: string; rarity: string; itemLevel: number }[] {
    return Object.values(ITEMS).map((item) => ({
      id: item.id,
      name: item.name,
      slot: item.slot,
      rarity: item.rarity,
      itemLevel: item.itemLevel,
    }));
  }

  listProfessions(): { id: string; name: string }[] {
    return Object.values(PROFESSIONS).map((p) => ({ id: p.id, name: p.name }));
  }

  listQuests(): { id: string; name: string; zone: string; faction: string }[] {
    return Object.values(QUESTS).map((q) => ({
      id: q.id,
      name: q.name,
      zone: q.zoneId,
      faction: questFaction(q),
    }));
  }

  async setArenaRating(characterId: string, bracket: string, rating: number): Promise<{ bracket: string; seasonId: string; rating: number }> {
    const char = await this.charactersRepo.findById(characterId);
    if (!char) throw new NotFoundException('Character not found');
    if (!(ARENA_BRACKETS as readonly string[]).includes(bracket)) {
      throw new BadRequestException(`Invalid bracket: ${bracket}`);
    }
    const seasonId = activeSeasonAt(Date.now()).id;
    await this.db
      .insert(arenaRatings)
      .values({ characterId, bracket: bracket as ArenaBracket, seasonId, rating, wins: 0, losses: 0 })
      .onConflictDoUpdate({
        target: [arenaRatings.characterId, arenaRatings.bracket, arenaRatings.seasonId],
        set: { rating, updatedAt: new Date() },
      });
    return { bracket, seasonId, rating };
  }

  async setReputation(characterId: string, factionId: string, standing: number): Promise<{ factionId: string; standing: number }> {
    const char = await this.charactersRepo.findById(characterId);
    if (!char) throw new NotFoundException('Character not found');
    if (!isFactionId(factionId)) throw new BadRequestException(`Unknown faction: ${factionId}`);
    await this.db
      .insert(characterReputation)
      .values({ characterId, factionId, standing })
      .onConflictDoUpdate({
        target: [characterReputation.characterId, characterReputation.factionId],
        set: { standing },
      });
    return { factionId, standing };
  }

  async clearLockouts(characterId: string): Promise<{ cleared: number }> {
    const char = await this.charactersRepo.findById(characterId);
    if (!char) throw new NotFoundException('Character not found');
    const rows = await this.db
      .delete(characterLockouts)
      .where(eq(characterLockouts.characterId, characterId))
      .returning();
    return { cleared: rows.length };
  }

  async completeQuest(characterId: string, questId: string): Promise<{ questId: string; alreadyDone: boolean }> {
    const char = await this.charactersRepo.findById(characterId);
    if (!char) throw new NotFoundException('Character not found');
    if (!isQuestId(questId)) throw new BadRequestException(`Unknown quest: ${questId}`);
    const existing = await this.db
      .select({ questId: completedQuests.questId })
      .from(completedQuests)
      .where(and(eq(completedQuests.characterId, characterId), eq(completedQuests.questId, questId)))
      .limit(1);
    if (existing.length) return { questId, alreadyDone: true };
    await this.db.insert(completedQuests).values({ characterId, questId });
    return { questId, alreadyDone: false };
  }

  // ── Moderation ─────────────────────────────────────────────────────────────

  async listAccounts(): Promise<DevAccountView[]> {
    const rows = await this.db
      .select({
        id: accounts.id,
        username: accounts.username,
        email: accounts.email,
        bannedAt: accounts.bannedAt,
        createdAt: accounts.createdAt,
        characterCount: sql<number>`cast(count(${characters.id}) as int)`,
      })
      .from(accounts)
      .leftJoin(characters, eq(characters.accountId, accounts.id))
      .groupBy(accounts.id)
      .orderBy(accounts.createdAt);
    return rows;
  }

  async banAccount(accountId: string): Promise<{ banned: boolean }> {
    const [row] = await this.db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
    if (!row) throw new NotFoundException('Account not found');
    await this.db.update(accounts).set({ bannedAt: new Date() }).where(eq(accounts.id, accountId));
    return { banned: true };
  }

  async unbanAccount(accountId: string): Promise<{ banned: boolean }> {
    const [row] = await this.db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
    if (!row) throw new NotFoundException('Account not found');
    await this.db.update(accounts).set({ bannedAt: null }).where(eq(accounts.id, accountId));
    return { banned: false };
  }

  async deleteAccount(accountId: string): Promise<{ deleted: boolean }> {
    const [row] = await this.db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
    if (!row) throw new NotFoundException('Account not found');
    await this.db.delete(accounts).where(eq(accounts.id, accountId));
    return { deleted: true };
  }

  /** Postavy patřící danému účtu — drill-down z accounts listu (admin panel). */
  async listCharactersByAccount(
    accountId: string,
  ): Promise<{ id: string; name: string; race: string; class: string; level: number; accountId: string }[]> {
    const rows = await this.charactersRepo.listByAccount(accountId);
    return rows.map((c) => {
      const sheet = buildCharacterSheet(c.race, c.class, c.totalXp);
      return { id: c.id, name: c.name, race: c.race, class: c.class, level: sheet.level, accountId: c.accountId };
    });
  }

  async searchCharacters(name: string): Promise<{ id: string; name: string; race: string; class: string; level: number; accountId: string }[]> {
    const rows = await this.db
      .select()
      .from(characters)
      .where(ilike(characters.name, `%${name}%`))
      .limit(20);
    return rows.map((c) => {
      const sheet = buildCharacterSheet(c.race, c.class, c.totalXp);
      return { id: c.id, name: c.name, race: c.race, class: c.class, level: sheet.level, accountId: c.accountId };
    });
  }

  async inspectCharacter(characterId: string): Promise<DevCharacterInspect> {
    const char = await this.charactersRepo.findById(characterId);
    if (!char) throw new NotFoundException('Character not found');

    const sheet = buildCharacterSheet(char.race, char.class, char.totalXp);

    const [activity, invRows, equipRows, profRows, repRows, ratingRows, guildRow, lockoutRows, achievRows] =
      await Promise.all([
        this.activities.findByCharacter(characterId),
        this.inventory.listInventory(characterId),
        this.inventory.listEquipment(characterId),
        this.db.select().from(characterProfessions).where(eq(characterProfessions.characterId, characterId)),
        this.db.select().from(characterReputation).where(eq(characterReputation.characterId, characterId)),
        this.db.select().from(arenaRatings).where(eq(arenaRatings.characterId, characterId)),
        this.db
          .select({ guildId: guildMembers.guildId, rank: guildMembers.rank, guildName: guilds.name })
          .from(guildMembers)
          .innerJoin(guilds, eq(guilds.id, guildMembers.guildId))
          .where(eq(guildMembers.characterId, characterId))
          .limit(1),
        this.db.select().from(characterLockouts).where(eq(characterLockouts.characterId, characterId)),
        this.db.select().from(characterAchievements).where(eq(characterAchievements.characterId, characterId)),
      ]);

    return {
      id: char.id,
      name: char.name,
      race: char.race,
      class: char.class,
      faction: char.faction,
      level: sheet.level,
      totalXp: char.totalXp,
      gold: char.gold,
      accountId: char.accountId,
      activity: activity
        ? { type: activity.activityType, startAt: activity.startAt, durationSec: activity.durationSec }
        : null,
      inventory: invRows.map((r) => ({
        itemId: r.itemId,
        name: ITEMS[r.itemId]?.name ?? r.itemId,
        quantity: r.quantity,
      })),
      equipment: equipRows.map((r) => ({
        slot: r.slot,
        itemId: r.itemId,
        name: ITEMS[r.itemId]?.name ?? r.itemId,
      })),
      professions: profRows.map((r) => ({ professionId: r.professionId, skill: r.skill })),
      reputation: repRows.map((r) => ({
        factionId: r.factionId,
        factionName: FACTIONS[r.factionId]?.name ?? r.factionId,
        standing: r.standing,
        tier: reputationTier(r.standing),
      })),
      arenaRatings: ratingRows.map((r) => ({
        bracket: r.bracket,
        seasonId: r.seasonId,
        rating: r.rating,
        wins: r.wins,
        losses: r.losses,
      })),
      guild: guildRow[0] ? { id: guildRow[0].guildId, name: guildRow[0].guildName, rank: guildRow[0].rank } : null,
      lockouts: lockoutRows.map((r) => ({ lockoutId: r.lockoutId, weekId: r.weekId })),
      achievements: achievRows.map((r) => ({ id: r.achievementId, name: r.achievementId, earnedAt: r.claimedAt })),
    };
  }

  async deleteCharacter(characterId: string): Promise<{ deleted: boolean }> {
    const char = await this.charactersRepo.findById(characterId);
    if (!char) throw new NotFoundException('Character not found');
    await this.db.delete(characters).where(eq(characters.id, characterId));
    return { deleted: true };
  }

  // ── Chat moderation ────────────────────────────────────────────────────────

  async listChatMessages(opts: {
    channel?: string;
    search?: string;
    senderId?: string;
    before?: string;
    limit?: number;
  }): Promise<{ messages: DevChatMessageView[]; hasMore: boolean }> {
    const limit = Math.min(opts.limit ?? 50, 100);
    const channel = (opts.channel ?? 'global') as 'global' | 'guild';

    const filters = [
      eq(chatMessages.channel, channel),
      isNull(chatMessages.scopeId),
    ];

    if (opts.search?.trim()) {
      const q = `%${opts.search.trim()}%`;
      filters.push(or(ilike(chatMessages.body, q), ilike(chatMessages.senderName, q))!);
    }
    if (opts.senderId) {
      filters.push(eq(chatMessages.senderCharacterId, opts.senderId));
    }
    if (opts.before) {
      filters.push(lt(chatMessages.createdAt, new Date(opts.before)));
    }

    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(and(...filters))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    return {
      messages: rows.slice(0, limit).map((r) => ({
        id: r.id,
        channel: r.channel,
        senderId: r.senderCharacterId,
        senderName: r.senderName,
        body: r.body,
        at: r.createdAt.toISOString(),
      })),
      hasMore,
    };
  }

  async deleteChatMessage(messageId: string): Promise<{ deleted: boolean }> {
    const [row] = await this.db
      .select({ id: chatMessages.id })
      .from(chatMessages)
      .where(eq(chatMessages.id, messageId))
      .limit(1);
    if (!row) throw new NotFoundException('Message not found');
    await this.db.delete(chatMessages).where(eq(chatMessages.id, messageId));
    return { deleted: true };
  }

  verifySecret(secret: string): boolean {
    const devSecret = process.env['DEV_SECRET'];
    if (devSecret) return secret === devSecret;
    // V dev módu bez nastaveného DEV_SECRET stačí jakékoliv neprázdné heslo.
    return process.env['NODE_ENV'] === 'development' && secret.length > 0;
  }
}
