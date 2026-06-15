import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  canInvite,
  canManageMember,
  isValidGuildName,
  levelFromXp,
  MAX_GUILD_MEMBERS,
  type ClassId,
  type Faction,
  type GuildRank,
  type RaceId,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import type { Character, GuildMember } from '../db/schema';
import { GuildRepository } from './guild.repository';
import { SocialEventsRelay } from './social.events';

export interface GuildMemberView {
  characterId: string;
  name: string;
  level: number;
  race: RaceId;
  class: ClassId;
  faction: Faction;
  rank: GuildRank;
  joinedAt: string;
}

export interface GuildView {
  id: string;
  name: string;
  leaderCharacterId: string;
  memberCount: number;
  myRank: GuildRank;
  members: GuildMemberView[];
}

export interface GuildInviteView {
  inviteId: string;
  guildId: string;
  guildName: string;
  invitedBy: string | null;
  sentAt: string;
}

export interface GuildState {
  guild: GuildView | null;
  /** Příchozí pozvánky (relevantní, když postava není v guildě). */
  invites: GuildInviteView[];
}

/**
 * Guild (M9 social). Per-postava členství (nejvýše jedna guilda). Ranky
 * member/officer/leader (oprávnění viz `@game/shared/guild`). Vůdce při odchodu
 * předá vedení nejstaršímu zbývajícímu členovi (nebo guildu rozpustí, je-li sám).
 * Stateless, server-authoritative.
 */
@Injectable()
export class GuildService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly guilds: GuildRepository,
    private readonly relay: SocialEventsRelay,
  ) {}

  private async own(accountId: string, characterId: string): Promise<Character> {
    const char = await this.characters.findOwned(accountId, characterId);
    if (!char) throw new NotFoundException('Character not found');
    return char;
  }

  /** Sestaví GuildState postavy: její guilda (vč. rosteru) + příchozí pozvánky. */
  async getState(accountId: string, characterId: string): Promise<GuildState> {
    await this.own(accountId, characterId);
    return this.stateFor(characterId);
  }

  /** Bez ownership checku (volá se interně po ověření). */
  private async stateFor(characterId: string): Promise<GuildState> {
    const membership = await this.guilds.membershipOf(characterId);
    const guild = membership ? await this.buildGuildView(membership) : null;

    const inviteRows = await this.guilds.listInvitesForCharacter(characterId);
    const invites: GuildInviteView[] = [];
    for (const inv of inviteRows) {
      const g = await this.guilds.findById(inv.guildId);
      if (!g) continue;
      const by = inv.invitedByCharacterId
        ? await this.characters.findById(inv.invitedByCharacterId)
        : undefined;
      invites.push({
        inviteId: inv.id,
        guildId: inv.guildId,
        guildName: g.name,
        invitedBy: by?.name ?? null,
        sentAt: inv.createdAt.toISOString(),
      });
    }
    return { guild, invites };
  }

  private async buildGuildView(membership: GuildMember): Promise<GuildView> {
    const guild = await this.guilds.findById(membership.guildId);
    if (!guild) throw new NotFoundException('Guild not found');
    const memberRows = await this.guilds.listMembers(guild.id);
    const chars = await this.characters.findByIds(memberRows.map((m) => m.characterId));
    const byId = new Map(chars.map((c) => [c.id, c]));

    const members: GuildMemberView[] = [];
    for (const m of memberRows) {
      const c = byId.get(m.characterId);
      if (!c) continue;
      members.push({
        characterId: c.id,
        name: c.name,
        level: levelFromXp(c.totalXp),
        race: c.race,
        class: c.class,
        faction: c.faction,
        rank: m.rank,
        joinedAt: m.joinedAt.toISOString(),
      });
    }
    // Roster: leader → officer → member, pak dle data vstupu.
    const order: Record<GuildRank, number> = { leader: 0, officer: 1, member: 2 };
    members.sort(
      (a, b) =>
        order[a.rank] - order[b.rank] ||
        new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
    );

    return {
      id: guild.id,
      name: guild.name,
      leaderCharacterId: guild.leaderCharacterId,
      memberCount: members.length,
      myRank: membership.rank,
      members,
    };
  }

  /** Založí guildu (postava se stane vůdcem). */
  async create(accountId: string, characterId: string, rawName: string): Promise<GuildState> {
    await this.own(accountId, characterId);
    const name = rawName.trim();
    if (!isValidGuildName(name)) throw new BadRequestException('Invalid guild name');
    if (await this.guilds.membershipOf(characterId)) {
      throw new BadRequestException('You are already in a guild');
    }
    if (await this.guilds.findByName(name)) {
      throw new BadRequestException('Guild name already taken');
    }
    await this.guilds.createGuild(name, characterId);
    return this.stateFor(characterId);
  }

  /** Pozve postavu (dle jména) do guildy volajícího (officer+). */
  async invite(accountId: string, characterId: string, targetName: string): Promise<GuildState> {
    await this.own(accountId, characterId);
    const membership = await this.requireMembership(characterId);
    if (!canInvite(membership.rank)) throw new ForbiddenException('Insufficient guild rank');

    const target = await this.characters.findByName(targetName.trim());
    if (!target) throw new NotFoundException('No character with that name');
    if (target.id === characterId) throw new BadRequestException('You are already in this guild');
    if (await this.guilds.membershipOf(target.id)) {
      throw new BadRequestException('That character is already in a guild');
    }
    if (await this.guilds.findInvite(membership.guildId, target.id)) {
      throw new BadRequestException('Already invited');
    }
    if ((await this.guilds.countMembers(membership.guildId)) >= MAX_GUILD_MEMBERS) {
      throw new BadRequestException('Guild is full');
    }

    await this.guilds.createInvite(membership.guildId, target.id, characterId);
    const guild = await this.guilds.findById(membership.guildId);
    const self = await this.characters.findById(characterId);
    if (guild && self) this.relay.guildInvite(target.id, guild.name, self.name);
    return this.stateFor(characterId);
  }

  /** Přijme/odmítne příchozí pozvánku. */
  async respondInvite(
    accountId: string,
    characterId: string,
    inviteId: string,
    accept: boolean,
  ): Promise<GuildState> {
    await this.own(accountId, characterId);
    const invite = await this.guilds.findInviteById(inviteId);
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.characterId !== characterId) throw new ForbiddenException('Not your invite');

    if (accept) {
      if (await this.guilds.membershipOf(characterId)) {
        throw new BadRequestException('You are already in a guild');
      }
      const guild = await this.guilds.findById(invite.guildId);
      if (!guild) {
        await this.guilds.deleteInvite(invite.id);
        throw new NotFoundException('Guild no longer exists');
      }
      if ((await this.guilds.countMembers(guild.id)) >= MAX_GUILD_MEMBERS) {
        throw new BadRequestException('Guild is full');
      }
      await this.guilds.addMember(guild.id, characterId, 'member');
    }
    await this.guilds.deleteInvite(invite.id);
    return this.stateFor(characterId);
  }

  /** Opustí guildu. Vůdce předá vedení (nebo rozpustí, je-li sám). */
  async leave(accountId: string, characterId: string): Promise<GuildState> {
    await this.own(accountId, characterId);
    const membership = await this.requireMembership(characterId);
    const guildId = membership.guildId;

    if (membership.rank === 'leader') {
      const others = (await this.guilds.listMembers(guildId)).filter(
        (m) => m.characterId !== characterId,
      );
      if (others.length === 0) {
        await this.guilds.deleteGuild(guildId);
        return this.stateFor(characterId);
      }
      const heir = this.pickHeir(others);
      await this.guilds.setRank(guildId, heir.characterId, 'leader');
      await this.guilds.setLeader(guildId, heir.characterId);
    }
    await this.guilds.removeMember(guildId, characterId);
    return this.stateFor(characterId);
  }

  /** Vyhodí člena (officer+ a striktně vyšší rank). */
  async kick(
    accountId: string,
    characterId: string,
    targetCharacterId: string,
  ): Promise<GuildState> {
    await this.own(accountId, characterId);
    const membership = await this.requireMembership(characterId);
    if (targetCharacterId === characterId) throw new BadRequestException('Use leave instead');
    const target = await this.guilds.membershipOf(targetCharacterId);
    if (!target || target.guildId !== membership.guildId) {
      throw new NotFoundException('Member not found');
    }
    if (!canManageMember(membership.rank, target.rank)) {
      throw new ForbiddenException('Insufficient guild rank');
    }
    await this.guilds.removeMember(membership.guildId, targetCharacterId);
    return this.stateFor(characterId);
  }

  /** Nastaví rank člena (jen vůdce; member ↔ officer, leadera nelze takto měnit). */
  async setRank(
    accountId: string,
    characterId: string,
    targetCharacterId: string,
    rank: GuildRank,
  ): Promise<GuildState> {
    await this.own(accountId, characterId);
    const membership = await this.requireMembership(characterId);
    if (membership.rank !== 'leader') throw new ForbiddenException('Only the leader can set ranks');
    if (rank === 'leader') throw new BadRequestException('Transfer leadership by leaving instead');
    if (targetCharacterId === characterId) throw new BadRequestException('Cannot change own rank');
    const target = await this.guilds.membershipOf(targetCharacterId);
    if (!target || target.guildId !== membership.guildId) {
      throw new NotFoundException('Member not found');
    }
    await this.guilds.setRank(membership.guildId, targetCharacterId, rank);
    return this.stateFor(characterId);
  }

  /** Rozpustí guildu (jen vůdce). */
  async disband(accountId: string, characterId: string): Promise<GuildState> {
    await this.own(accountId, characterId);
    const membership = await this.requireMembership(characterId);
    if (membership.rank !== 'leader') throw new ForbiddenException('Only the leader can disband');
    await this.guilds.deleteGuild(membership.guildId);
    return this.stateFor(characterId);
  }

  private async requireMembership(characterId: string): Promise<GuildMember> {
    const membership = await this.guilds.membershipOf(characterId);
    if (!membership) throw new BadRequestException('You are not in a guild');
    return membership;
  }

  /** Nástupce vůdce: nejvyšší rank, pak nejdříve vstoupivší. */
  private pickHeir(members: GuildMember[]): GuildMember {
    const order: Record<GuildRank, number> = { leader: 0, officer: 1, member: 2 };
    return [...members].sort(
      (a, b) =>
        order[a.rank] - order[b.rank] || a.joinedAt.getTime() - b.joinedAt.getTime(),
    )[0]!;
  }
}
