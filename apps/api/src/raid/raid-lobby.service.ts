import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildCompanionBase,
  canFillRole,
  COMPANION_NAMES,
  defaultRaidComposition,
  deriveRaidActor,
  isRaidId,
  isRaidRole,
  isRaidUnlocked,
  isValidComposition,
  levelFromXp,
  RAID_ROLES,
  RAIDS,
  remainingSlots,
  type LobbyMemberStatus,
  type RaidActor,
  type RaidComposition,
  type RaidRole,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { CompletedQuestRepository } from '../quest/quest.repository';
import type { Character, RaidLobby } from '../db/schema';
import { RaidEventsRelay } from './raid.events';
import { RaidLobbyRepository } from './raid-lobby.repository';
import { RaidService, type RaidParticipantInput } from './raid.service';

export interface LobbyMemberView {
  characterId: string;
  name: string;
  level: number;
  race: string;
  class: string;
  role: RaidRole;
  status: LobbyMemberStatus;
  isLeader: boolean;
}

export interface RaidLobbyView {
  id: string;
  raidId: string;
  raidName: string;
  size: number;
  composition: RaidComposition;
  status: string;
  runId: string | null;
  leaderCharacterId: string;
  iAmLeader: boolean;
  members: LobbyMemberView[];
  /** Volné sloty per role (po započtení připojených členů). */
  remaining: RaidComposition;
  full: boolean;
}

export interface LobbyInviteView {
  lobbyId: string;
  raidId: string;
  raidName: string;
  role: RaidRole;
  size: number;
}

export interface LobbyState {
  /** Aktivní (formující se) lobby, kde je postava připojena, nebo null. */
  lobby: RaidLobbyView | null;
  /** Příchozí pozvánky (relevantní, když postava není v žádném lobby). */
  invites: LobbyInviteView[];
}

/**
 * Raid lobby (M8.5-B, ruční formace). Odemčeno M9 social: leader sestaví party,
 * zve konkrétní postavy do rolí, a při spuštění se zbytek doplní NPC backfillem
 * (idle-first zachován). Run i odměny recyklují `RaidService.finalizeRun`.
 */
@Injectable()
export class RaidLobbyService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly completed: CompletedQuestRepository,
    private readonly lobbies: RaidLobbyRepository,
    private readonly raid: RaidService,
    private readonly events: RaidEventsRelay,
  ) {}

  private async own(accountId: string, characterId: string): Promise<Character> {
    const char = await this.characters.findOwned(accountId, characterId);
    if (!char) throw new NotFoundException('Character not found');
    return char;
  }

  async getState(accountId: string, characterId: string): Promise<LobbyState> {
    await this.own(accountId, characterId);
    return this.stateFor(characterId);
  }

  private async stateFor(characterId: string): Promise<LobbyState> {
    const active = await this.lobbies.activeMembership(characterId);
    const lobby = active ? await this.buildView(active.lobby, characterId) : null;

    const inviteRows = await this.lobbies.listInvites(characterId);
    const invites: LobbyInviteView[] = inviteRows.map(({ lobby: l, member }) => ({
      lobbyId: l.id,
      raidId: l.raidId,
      raidName: RAIDS[l.raidId]?.name ?? l.raidId,
      role: member.role,
      size: l.size,
    }));
    return { lobby, invites };
  }

  private async buildView(lobby: RaidLobby, viewerId: string): Promise<RaidLobbyView> {
    const memberRows = await this.lobbies.listMembers(lobby.id);
    const chars = await this.characters.findByIds(memberRows.map((m) => m.characterId));
    const byId = new Map(chars.map((c) => [c.id, c]));
    const members: LobbyMemberView[] = [];
    for (const m of memberRows) {
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
        isLeader: c.id === lobby.leaderCharacterId,
      });
    }
    // Leader první, pak připojení, pak pozvaní; uvnitř dle role.
    const roleOrder: Record<RaidRole, number> = { tank: 0, healer: 1, dps: 2 };
    members.sort(
      (a, b) =>
        Number(b.isLeader) - Number(a.isLeader) ||
        (a.status === b.status ? 0 : a.status === 'joined' ? -1 : 1) ||
        roleOrder[a.role] - roleOrder[b.role],
    );

    const joinedRoles = members.filter((m) => m.status === 'joined').map((m) => m.role);
    const remaining = remainingSlots(lobby.composition, joinedRoles);
    return {
      id: lobby.id,
      raidId: lobby.raidId,
      raidName: RAIDS[lobby.raidId]?.name ?? lobby.raidId,
      size: lobby.size,
      composition: lobby.composition,
      status: lobby.status,
      runId: lobby.runId,
      leaderCharacterId: lobby.leaderCharacterId,
      iAmLeader: viewerId === lobby.leaderCharacterId,
      members,
      remaining,
      full: remaining.tank + remaining.healer + remaining.dps === 0,
    };
  }

  /** Založí lobby; zakladatel = leader v dané roli. */
  async create(
    accountId: string,
    characterId: string,
    raidId: string,
    role: string,
    size?: number,
    composition?: RaidComposition,
  ): Promise<LobbyState> {
    const character = await this.own(accountId, characterId);
    if (!isRaidId(raidId)) throw new BadRequestException('Unknown raid');
    if (!isRaidRole(role)) throw new BadRequestException('Invalid role');
    if (await this.lobbies.activeMembership(characterId)) {
      throw new BadRequestException('You are already in a lobby');
    }

    const level = levelFromXp(character.totalXp);
    const completedIds = await this.completed.completedIds(characterId);
    if (!isRaidUnlocked(raidId, level, completedIds)) {
      throw new BadRequestException('Raid is not unlocked (level / attunement)');
    }

    const raid = RAIDS[raidId]!;
    const chosenSize = size ?? raid.sizes[0]!;
    if (!raid.sizes.includes(chosenSize)) {
      throw new BadRequestException(`Raid size ${chosenSize} not allowed (${raid.sizes.join('/')})`);
    }
    const comp = composition ?? defaultRaidComposition(chosenSize);
    if (!isValidComposition(comp, chosenSize, role)) {
      throw new BadRequestException(
        `Invalid composition: counts must be non-negative, sum to ${chosenSize}, and include your role`,
      );
    }

    const lobby = await this.lobbies.createLobby({
      raidId,
      leaderCharacterId: characterId,
      size: chosenSize,
      composition: comp,
    });
    await this.lobbies.addMember(lobby.id, characterId, role, 'joined');
    return this.stateFor(characterId);
  }

  /** Pozve postavu (dle jména) do role (jen leader). */
  async invite(
    accountId: string,
    characterId: string,
    lobbyId: string,
    targetName: string,
    role: string,
  ): Promise<LobbyState> {
    await this.own(accountId, characterId);
    if (!isRaidRole(role)) throw new BadRequestException('Invalid role');
    const lobby = await this.requireFormingLobby(lobbyId);
    if (lobby.leaderCharacterId !== characterId) {
      throw new ForbiddenException('Only the leader can invite');
    }

    const target = await this.characters.findByName(targetName.trim());
    if (!target) throw new NotFoundException('No character with that name');
    if (target.id === characterId) throw new BadRequestException('You are already in this lobby');
    if (await this.lobbies.findMember(lobby.id, target.id)) {
      throw new BadRequestException('Already in this lobby');
    }

    const targetLevel = levelFromXp(target.totalXp);
    const targetCompleted = await this.completed.completedIds(target.id);
    if (!isRaidUnlocked(lobby.raidId, targetLevel, targetCompleted)) {
      throw new BadRequestException('That character has not unlocked this raid');
    }

    // Drž rezervace (joined + invited) v mezích kompozice.
    const reservedRoles = (await this.lobbies.listMembers(lobby.id)).map((m) => m.role);
    if (!canFillRole(lobby.composition, reservedRoles, role)) {
      throw new BadRequestException(`No open ${role} slot`);
    }

    await this.lobbies.addMember(lobby.id, target.id, role, 'invited');
    const leader = await this.characters.findById(characterId);
    this.events.lobbyInvite(
      target.id,
      lobby.id,
      RAIDS[lobby.raidId]?.name ?? lobby.raidId,
      leader?.name ?? 'A raid leader',
    );
    return this.stateFor(characterId);
  }

  /** Přijme/odmítne pozvánku. */
  async respondInvite(
    accountId: string,
    characterId: string,
    lobbyId: string,
    accept: boolean,
    role?: string,
  ): Promise<LobbyState> {
    await this.own(accountId, characterId);
    const lobby = await this.requireFormingLobby(lobbyId);
    const member = await this.lobbies.findMember(lobby.id, characterId);
    if (!member || member.status !== 'invited') throw new NotFoundException('Invite not found');

    if (accept) {
      if (await this.lobbies.activeMembership(characterId)) {
        throw new BadRequestException('You are already in a lobby');
      }
      const chosenRole: RaidRole =
        role && isRaidRole(role) ? role : member.role;
      const joinedRoles = (await this.lobbies.listMembers(lobby.id))
        .filter((m) => m.status === 'joined')
        .map((m) => m.role);
      if (!canFillRole(lobby.composition, joinedRoles, chosenRole)) {
        throw new BadRequestException(`No open ${chosenRole} slot`);
      }
      await this.lobbies.setMember(lobby.id, characterId, 'joined', chosenRole);
    } else {
      await this.lobbies.removeMember(lobby.id, characterId);
    }
    return this.stateFor(characterId);
  }

  /** Opustí lobby. Odchod leadera lobby zruší (cancelled). */
  async leave(accountId: string, characterId: string, lobbyId: string): Promise<LobbyState> {
    await this.own(accountId, characterId);
    const lobby = await this.requireFormingLobby(lobbyId);
    const member = await this.lobbies.findMember(lobby.id, characterId);
    if (!member) throw new BadRequestException('You are not in this lobby');

    if (lobby.leaderCharacterId === characterId) {
      await this.lobbies.setStatus(lobby.id, 'cancelled');
    } else {
      await this.lobbies.removeMember(lobby.id, characterId);
    }
    return this.stateFor(characterId);
  }

  /** Vyhodí člena (jen leader, ne sebe). */
  async kick(
    accountId: string,
    characterId: string,
    lobbyId: string,
    targetCharacterId: string,
  ): Promise<LobbyState> {
    await this.own(accountId, characterId);
    const lobby = await this.requireFormingLobby(lobbyId);
    if (lobby.leaderCharacterId !== characterId) {
      throw new ForbiddenException('Only the leader can kick');
    }
    if (targetCharacterId === characterId) throw new BadRequestException('Use leave instead');
    await this.lobbies.removeMember(lobby.id, targetCharacterId);
    return this.stateFor(characterId);
  }

  /**
   * Spustí raid: sestaví party z připojených členů (čerstvé snapshoty) + NPC
   * backfill na zbylé sloty, odsimuluje a udělí odměny (`RaidService.finalizeRun`).
   * Vrací id runu (web naviguje na watch). Lobby přejde do `started`.
   */
  async start(
    accountId: string,
    characterId: string,
    lobbyId: string,
  ): Promise<{ runId: string }> {
    await this.own(accountId, characterId);
    const lobby = await this.requireFormingLobby(lobbyId);
    if (lobby.leaderCharacterId !== characterId) {
      throw new ForbiddenException('Only the leader can start the raid');
    }
    const raid = RAIDS[lobby.raidId];
    if (!raid) throw new BadRequestException('Unknown raid');

    const joined = (await this.lobbies.listMembers(lobby.id)).filter((m) => m.status === 'joined');
    const chars = await this.characters.findByIds(joined.map((m) => m.characterId));
    const byId = new Map(chars.map((c) => [c.id, c]));

    // Leader první (iniciátor seeduje běh).
    joined.sort((a, b) => Number(b.characterId === characterId) - Number(a.characterId === characterId));

    const party: RaidActor[] = [];
    const real: RaidParticipantInput[] = [];
    const joinedRoles: RaidRole[] = [];
    for (const m of joined) {
      const c = byId.get(m.characterId);
      if (!c) continue;
      const actor = await this.raid.buildRaidActor(c, levelFromXp(c.totalXp), m.role);
      party.push(actor);
      real.push({ character: c, role: m.role, initiator: c.id === characterId });
      joinedRoles.push(m.role);
    }
    if (real.length === 0) throw new BadRequestException('Lobby has no joined members');

    // NPC backfill na zbylé sloty kompozice.
    const remaining = remainingSlots(lobby.composition, joinedRoles);
    for (const r of RAID_ROLES) {
      for (let i = 0; i < remaining[r]; i++) {
        const name = `${COMPANION_NAMES[r]} ${i + 1}`;
        party.push(deriveRaidActor(buildCompanionBase(raid, name), r));
      }
    }

    const { run } = await this.raid.finalizeRun(raid, party, real, characterId);
    await this.lobbies.setStatus(lobby.id, 'started', run.id);
    return { runId: run.id };
  }

  private async requireFormingLobby(lobbyId: string): Promise<RaidLobby> {
    const lobby = await this.lobbies.findLobby(lobbyId);
    if (!lobby) throw new NotFoundException('Lobby not found');
    if (lobby.status !== 'forming') throw new BadRequestException('Lobby is no longer forming');
    return lobby;
  }
}
