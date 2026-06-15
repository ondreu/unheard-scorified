import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  arenaBracketForSize,
  friendCounterpart,
  isGroupActivityType,
  isRaidRole,
  levelFromXp,
  type ArenaBracket,
  type RaidRole,
  type TeamBracket,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { GuildRepository } from '../social/guild.repository';
import { SocialRepository } from '../social/social.repository';
import { DungeonService, type DungeonMember } from '../dungeon/dungeon.service';
import { RaidService } from '../raid/raid.service';
import { ArenaService } from '../arena/arena.service';
import { TeamArenaService } from '../arena/team-arena.service';
import type { Character } from '../db/schema';
import { GroupRepository } from './group.repository';

export interface GroupMemberView {
  characterId: string;
  name: string;
  level: number;
  race: string;
  class: string;
  role: RaidRole;
  status: string;
  isLeader: boolean;
}

export interface GroupView {
  id: string;
  leaderCharacterId: string;
  iAmLeader: boolean;
  members: GroupMemberView[];
  /** Počet připojených členů (= velikost party pro launch). */
  joinedCount: number;
}

export interface GroupInviteView {
  groupId: string;
  leaderName: string;
  role: RaidRole;
}

export interface GroupState {
  group: GroupView | null;
  invites: GroupInviteView[];
}

/** Výsledek spuštění obsahu se skupinou (web podle něj naviguje na watch). */
export type GroupLaunchResult =
  | { activityType: 'dungeon'; runId: string }
  | { activityType: 'raid'; runId: string }
  | { activityType: 'arena'; bracket: ArenaBracket; status: 'queued' | 'matched'; matchId?: string };

/**
 * Trvalá skupina (party) — M9 social, ADR 0022. Sjednocuje formaci pro **dungeon,
 * raid i arénu** (nahrazuje raid lobby + ruční team arénu). Postava je v nejvýše
 * jedné skupině; leader zve přátele/spoluhráče z guildy, členové mají PVE roli
 * (aréna ji ignoruje). Leader spustí obsah → run/zápas přes existující enginy
 * (`finalizeRun` / `simulateTeamFight`), žádný NPC backfill.
 */
@Injectable()
export class GroupService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly groups: GroupRepository,
    private readonly social: SocialRepository,
    private readonly guilds: GuildRepository,
    private readonly dungeons: DungeonService,
    private readonly raids: RaidService,
    private readonly arena: ArenaService,
    private readonly teamArena: TeamArenaService,
  ) {}

  private async own(accountId: string, characterId: string): Promise<Character> {
    const char = await this.characters.findOwned(accountId, characterId);
    if (!char) throw new NotFoundException('Character not found');
    return char;
  }

  async getState(accountId: string, characterId: string): Promise<GroupState> {
    await this.own(accountId, characterId);
    return this.stateFor(characterId);
  }

  private async stateFor(characterId: string): Promise<GroupState> {
    const active = await this.groups.activeMembership(characterId);
    const group = active ? await this.buildView(active.group.id, characterId) : null;

    const inviteRows = await this.groups.listInvites(characterId);
    const invites: GroupInviteView[] = [];
    for (const { group: g, member } of inviteRows) {
      const leader = await this.characters.findById(g.leaderCharacterId);
      invites.push({ groupId: g.id, leaderName: leader?.name ?? 'A group leader', role: member.role });
    }
    return { group, invites };
  }

  private async buildView(groupId: string, viewerId: string): Promise<GroupView> {
    const group = await this.groups.findGroup(groupId);
    if (!group) throw new NotFoundException('Group not found');
    const rows = await this.groups.listMembers(groupId);
    const chars = await this.characters.findByIds(rows.map((m) => m.characterId));
    const byId = new Map(chars.map((c) => [c.id, c]));
    const members: GroupMemberView[] = [];
    for (const m of rows) {
      const c = byId.get(m.characterId);
      if (!c) continue;
      members.push({
        characterId: c.id,
        name: c.name,
        level: levelFromXp(c.totalXp),
        race: c.race,
        class: c.class,
        role: m.role,
        status: m.status,
        isLeader: c.id === group.leaderCharacterId,
      });
    }
    // Leader první, pak připojení, pak pozvaní.
    members.sort(
      (a, b) =>
        Number(b.isLeader) - Number(a.isLeader) ||
        (a.status === b.status ? 0 : a.status === 'joined' ? -1 : 1),
    );
    return {
      id: group.id,
      leaderCharacterId: group.leaderCharacterId,
      iAmLeader: viewerId === group.leaderCharacterId,
      members,
      joinedCount: members.filter((m) => m.status === 'joined').length,
    };
  }

  /** Založí skupinu; zakladatel = leader (joined) v dané roli. */
  async create(accountId: string, characterId: string, role: string): Promise<GroupState> {
    await this.own(accountId, characterId);
    const memberRole = isRaidRole(role) ? role : 'dps';
    if (await this.groups.activeMembership(characterId)) {
      throw new BadRequestException('You are already in a group');
    }
    const group = await this.groups.createGroup(characterId);
    await this.groups.addMember(group.id, characterId, memberRole, 'joined');
    return this.stateFor(characterId);
  }

  /** Pozve postavu (dle jména) do role. Jen leader; cíl musí být friend/guildmate. */
  async invite(
    accountId: string,
    characterId: string,
    targetName: string,
    role: string,
  ): Promise<GroupState> {
    await this.own(accountId, characterId);
    const memberRole = isRaidRole(role) ? role : 'dps';

    // Auto-create skupiny, pokud volající žádnou nemá (pohodlné pozvání z karty hráče).
    let active = await this.groups.activeMembership(characterId);
    if (!active) {
      const group = await this.groups.createGroup(characterId);
      await this.groups.addMember(group.id, characterId, 'dps', 'joined');
      active = (await this.groups.activeMembership(characterId))!;
    }
    if (active.group.leaderCharacterId !== characterId) {
      throw new ForbiddenException('Only the group leader can invite');
    }
    const membership = active;

    const target = await this.characters.findByName(targetName.trim());
    if (!target) throw new NotFoundException('No character with that name');
    if (target.id === characterId) throw new BadRequestException('You are already in this group');
    if (await this.groups.findMember(membership.group.id, target.id)) {
      throw new BadRequestException('Already in this group');
    }
    if (!(await this.eligible(characterId, target.id))) {
      throw new BadRequestException(`${target.name} must be your friend or guild member`);
    }
    await this.groups.addMember(membership.group.id, target.id, memberRole, 'invited');
    return this.stateFor(characterId);
  }

  /**
   * Požádá o vstup do skupiny jiného hráče (když volající žádnou skupinu nemá a
   * cíl ano). Vytvoří žádost (`requested`), kterou leader schválí/odmítne.
   */
  async requestJoin(
    accountId: string,
    characterId: string,
    targetName: string,
  ): Promise<GroupState> {
    await this.own(accountId, characterId);
    if (await this.groups.activeMembership(characterId)) {
      throw new BadRequestException('Leave your current group first');
    }
    const target = await this.characters.findByName(targetName.trim());
    if (!target) throw new NotFoundException('No character with that name');
    if (target.id === characterId) throw new BadRequestException('That is you');

    const theirGroup = await this.groups.activeMembership(target.id);
    if (!theirGroup) throw new BadRequestException(`${target.name} is not in a group`);
    if (!(await this.eligible(target.id, characterId))) {
      throw new BadRequestException(`You must be a friend or guild member of ${target.name}`);
    }
    const existing = await this.groups.findMember(theirGroup.group.id, characterId);
    if (existing) throw new BadRequestException('You already have a pending request or invite');

    await this.groups.addMember(theirGroup.group.id, characterId, 'dps', 'requested');
    return this.stateFor(characterId);
  }

  /** Leader schválí/odmítne žádost o vstup (`requested`). */
  async respondJoinRequest(
    accountId: string,
    characterId: string,
    requesterCharacterId: string,
    accept: boolean,
  ): Promise<GroupState> {
    await this.own(accountId, characterId);
    const membership = await this.requireLeader(characterId);
    const member = await this.groups.findMember(membership.group.id, requesterCharacterId);
    if (!member || member.status !== 'requested') {
      throw new NotFoundException('Join request not found');
    }
    if (accept) {
      if (await this.groups.activeMembership(requesterCharacterId)) {
        // Mezitím vstoupil jinam — žádost zruš.
        await this.groups.removeMember(membership.group.id, requesterCharacterId);
        throw new BadRequestException('That player already joined another group');
      }
      await this.groups.setMember(membership.group.id, requesterCharacterId, 'joined');
    } else {
      await this.groups.removeMember(membership.group.id, requesterCharacterId);
    }
    return this.stateFor(characterId);
  }

  /** Přijme/odmítne pozvánku do skupiny. */
  async respondInvite(
    accountId: string,
    characterId: string,
    groupId: string,
    accept: boolean,
    role?: string,
  ): Promise<GroupState> {
    await this.own(accountId, characterId);
    const member = await this.groups.findMember(groupId, characterId);
    if (!member || member.status !== 'invited') throw new NotFoundException('Invite not found');

    if (accept) {
      if (await this.groups.activeMembership(characterId)) {
        throw new BadRequestException('Leave your current group first');
      }
      const chosen: RaidRole = role && isRaidRole(role) ? role : member.role;
      await this.groups.setMember(groupId, characterId, 'joined', chosen);
    } else {
      await this.groups.removeMember(groupId, characterId);
    }
    return this.stateFor(characterId);
  }

  /** Změní vlastní PVE roli (jen připojený člen). */
  async setRole(accountId: string, characterId: string, role: string): Promise<GroupState> {
    await this.own(accountId, characterId);
    if (!isRaidRole(role)) throw new BadRequestException('Invalid role');
    const membership = await this.groups.activeMembership(characterId);
    if (!membership) throw new BadRequestException('You are not in a group');
    await this.groups.setMember(membership.group.id, characterId, 'joined', role);
    return this.stateFor(characterId);
  }

  /** Opustí skupinu. Odchod leadera → předá vedení nejstaršímu, jinak rozpustí. */
  async leave(accountId: string, characterId: string): Promise<GroupState> {
    await this.own(accountId, characterId);
    const membership = await this.groups.activeMembership(characterId);
    if (!membership) throw new BadRequestException('You are not in a group');
    const groupId = membership.group.id;

    if (membership.group.leaderCharacterId === characterId) {
      const others = (await this.groups.listMembers(groupId)).filter(
        (m) => m.status === 'joined' && m.characterId !== characterId,
      );
      if (others.length === 0) {
        await this.groups.deleteGroup(groupId); // cascade smaže členy
        return this.stateFor(characterId);
      }
      await this.groups.setLeader(groupId, others[0]!.characterId);
    }
    await this.groups.removeMember(groupId, characterId);
    return this.stateFor(characterId);
  }

  /** Vyhodí člena (jen leader, ne sebe). */
  async kick(
    accountId: string,
    characterId: string,
    targetCharacterId: string,
  ): Promise<GroupState> {
    await this.own(accountId, characterId);
    const membership = await this.requireLeader(characterId);
    if (targetCharacterId === characterId) throw new BadRequestException('Use leave instead');
    await this.groups.removeMember(membership.group.id, targetCharacterId);
    return this.stateFor(characterId);
  }

  /** Předá vedení připojenému členovi (jen leader). */
  async promote(
    accountId: string,
    characterId: string,
    targetCharacterId: string,
  ): Promise<GroupState> {
    await this.own(accountId, characterId);
    const membership = await this.requireLeader(characterId);
    const target = await this.groups.findMember(membership.group.id, targetCharacterId);
    if (!target || target.status !== 'joined') throw new BadRequestException('Not a joined member');
    await this.groups.setLeader(membership.group.id, targetCharacterId);
    return this.stateFor(characterId);
  }

  /** Rozpustí skupinu (jen leader). */
  async disband(accountId: string, characterId: string): Promise<GroupState> {
    await this.own(accountId, characterId);
    const membership = await this.requireLeader(characterId);
    await this.groups.deleteGroup(membership.group.id);
    return this.stateFor(characterId);
  }

  /**
   * Spustí obsah se skupinou (jen leader): **dungeon / raid** (group PVE run) nebo
   * **aréna** (velikost → bracket: 1→1v1, 3→3v3, 5→5v5). Recykluje existující
   * run/aréna enginy; žádný NPC backfill.
   */
  async launch(
    accountId: string,
    characterId: string,
    activityType: string,
    contentId: string,
  ): Promise<GroupLaunchResult> {
    const leader = await this.own(accountId, characterId);
    if (!isGroupActivityType(activityType)) throw new BadRequestException('Unknown activity type');
    const membership = await this.requireLeader(characterId);

    const memberRows = (await this.groups.listMembers(membership.group.id)).filter(
      (m) => m.status === 'joined',
    );
    const chars = await this.characters.findByIds(memberRows.map((m) => m.characterId));
    const byId = new Map(chars.map((c) => [c.id, c]));
    // Leader první (iniciátor seeduje běh / je leader týmu).
    memberRows.sort((a, b) => Number(b.characterId === characterId) - Number(a.characterId === characterId));
    const members: DungeonMember[] = memberRows.flatMap((m) => {
      const c = byId.get(m.characterId);
      return c ? [{ character: c, role: m.role }] : [];
    });
    if (members.length === 0) throw new BadRequestException('Group has no joined members');

    if (activityType === 'dungeon') {
      const view = await this.dungeons.runForGroup(leader, contentId, members);
      return { activityType, runId: view.runId };
    }
    if (activityType === 'raid') {
      const { runId } = await this.raids.runForGroup(leader, contentId, members);
      return { activityType, runId };
    }

    // Aréna: velikost → bracket.
    const bracket = arenaBracketForSize(members.length);
    if (!bracket) {
      throw new BadRequestException('Arena needs a group of 1, 3, or 5 players');
    }
    if (bracket === '1v1') {
      const result = await this.arena.queue(accountId, characterId);
      return { activityType, bracket, status: result.status, matchId: result.matchId };
    }
    const memberChars = members.map((m) => m.character);
    const result = await this.teamArena.launchForGroup(leader, memberChars, bracket as TeamBracket);
    return { activityType, bracket, status: result.status, matchId: result.matchId };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Vrátí aktivní členství, jen pokud je volající leaderem; jinak hodí chybu. */
  private async requireLeader(characterId: string): Promise<{ group: { id: string; leaderCharacterId: string } }> {
    const membership = await this.groups.activeMembership(characterId);
    if (!membership) throw new BadRequestException('You are not in a group');
    if (membership.group.leaderCharacterId !== characterId) {
      throw new ForbiddenException('Only the group leader can do that');
    }
    return membership;
  }

  /** Je `targetId` přítel nebo spoluhráč z guildy `leaderId`? (souhlas k pozvání). */
  private async eligible(leaderId: string, targetId: string): Promise<boolean> {
    const friendships = await this.social.listAccepted(leaderId);
    if (
      friendships.some(
        (f) => friendCounterpart(leaderId, f.requesterCharacterId, f.addresseeCharacterId) === targetId,
      )
    ) {
      return true;
    }
    const [lg, tg] = await Promise.all([
      this.guilds.membershipOf(leaderId),
      this.guilds.membershipOf(targetId),
    ]);
    return !!lg && !!tg && lg.guildId === tg.guildId;
  }
}
