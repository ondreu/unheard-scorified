import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  activeSeasonAt,
  aggregateTalentEffects,
  ARENA_MIN_LEVEL,
  baseStatsFor,
  bracketTeamSize,
  deriveCombatProfile,
  eloDelta,
  isTeamBracket,
  levelFromXp,
  ratingTier,
  seedFromString,
  simulateTeamFight,
  type ArenaBracket,
  type ClassId,
  type CombatActor,
  type CombatEvent,
  type DuelSide,
  type RaceId,
  type TeamBracket,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryService } from '../inventory/inventory.service';
import { TalentRepository } from '../talent/talent.repository';
import { PushService } from '../push/push.service';
import type { ArenaTeamMatch, Character } from '../db/schema';
import { ArenaRepository } from './arena.repository';
import { RotationService } from '../rotation/rotation.service';
import {
  TEAM_ARENA_QUEUE,
  type TeamArenaQueue,
  type TeamMemberEntry,
  type TeamQueueEntry,
} from './team-arena.queue';

export interface TeamBracketView {
  bracket: TeamBracket;
  teamSize: number;
  rating: number;
  tier: string;
  wins: number;
  losses: number;
  queued: boolean;
}

export interface TeamArenaView {
  eligible: boolean;
  minLevel: number;
  seasonId: string;
  brackets: TeamBracketView[];
}

export interface TeamQueueResult {
  status: 'queued' | 'matched';
  bracket: TeamBracket;
  matchId?: string;
}

export interface TeamMatchMemberView {
  name: string;
  maxHealth: number;
}

export interface TeamMatchView {
  matchId: string;
  bracket: ArenaBracket;
  durationSec: number;
  progress: { elapsedSec: number; remainingSec: number; completed: boolean };
  myTeam: TeamMatchMemberView[];
  enemyTeam: TeamMatchMemberView[];
  events: CombatEvent[];
  /** null dokud boj „neproběhne" (reveal dle času); pak 'win'|'loss'. */
  outcome: 'win' | 'loss' | null;
}

/**
 * Týmové arény (M8.5-C, 3v3/5v5). Ruční sestavení: leader uvede parťáky jménem;
 * každý musí být **friend nebo spoluhráč z guildy** (social gate = souhlas) a
 * splnit level. Bez NPC backfillu. Tým se zařadí do fronty (snapshoty) a spáruje
 * s jiným čekajícím týmem bez překryvu → deterministický `simulateTeamFight`.
 * Elo se aplikuje **každému členu** proti průměru ratingu soupeřů. Viz ADR 0020.
 */
@Injectable()
export class TeamArenaService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly inventory: InventoryService,
    private readonly talents: TalentRepository,
    private readonly arena: ArenaRepository,
    private readonly push: PushService,
    private readonly rotation: RotationService,
    @Inject(TEAM_ARENA_QUEUE) private readonly queue: TeamArenaQueue,
  ) {}

  private season(): string {
    return activeSeasonAt(Date.now()).id;
  }

  private async own(accountId: string, characterId: string): Promise<Character> {
    const char = await this.characters.findOwned(accountId, characterId);
    if (!char) throw new NotFoundException('Character not found');
    return char;
  }

  /** Přehled týmových bracketů: rating, tier, W/L, stav fronty. */
  async getTeamArena(accountId: string, characterId: string): Promise<TeamArenaView> {
    const char = await this.own(accountId, characterId);
    const seasonId = this.season();
    const level = levelFromXp(char.totalXp);

    const brackets: TeamBracketView[] = [];
    for (const bracket of ['2v2', '3v3', '5v5'] as TeamBracket[]) {
      const rating = await this.arena.ensureRating(characterId, bracket, seasonId);
      const queued =
        (await this.queue.isLeaderQueued(bracket, seasonId, characterId)) ||
        (await this.queue.isMemberQueued(bracket, seasonId, characterId));
      brackets.push({
        bracket,
        teamSize: bracketTeamSize(bracket),
        rating: rating.rating,
        tier: ratingTier(rating.rating).tier,
        wins: rating.wins,
        losses: rating.losses,
        queued,
      });
    }
    return { eligible: level >= ARENA_MIN_LEVEL, minLevel: ARENA_MIN_LEVEL, seasonId, brackets };
  }

  /**
   * Spustí týmovou arénu s předem sestavenou **skupinou** (M9 group): leader +
   * členové (eligibilita friend/guild je vyřešená už při vstupu do skupiny).
   * Zařadí tým do fronty (snapshoty); čeká-li vhodný soupeř, hned odbojuje a
   * oraťuje obě strany. `bracket` určuje velikost (group ji odvozuje z velikosti).
   */
  async launchForGroup(
    leader: Character,
    members: Character[],
    bracket: TeamBracket,
  ): Promise<TeamQueueResult> {
    const seasonId = this.season();
    if (members.length !== bracketTeamSize(bracket)) {
      throw new BadRequestException(`${bracket} needs exactly ${bracketTeamSize(bracket)} members`);
    }
    for (const m of members) {
      if (levelFromXp(m.totalXp) < ARENA_MIN_LEVEL) {
        throw new BadRequestException(`${m.name} is below level ${ARENA_MIN_LEVEL}`);
      }
      if (await this.queue.isMemberQueued(bracket, seasonId, m.id)) {
        throw new BadRequestException(`${m.name} is already queued in this bracket`);
      }
    }

    // Snapshoty + ratingy.
    const entries: TeamMemberEntry[] = [];
    for (const m of members) {
      const rating = await this.arena.ensureRating(m.id, bracket, seasonId);
      entries.push({
        characterId: m.id,
        accountId: m.accountId,
        name: m.name,
        rating: rating.rating,
        snapshot: await this.buildCombatProfile(m),
      });
    }
    const myTeam: TeamQueueEntry = {
      leaderCharacterId: leader.id,
      members: entries,
      queuedAt: Date.now(),
    };

    const opponent = await this.queue.takeOpponent(
      bracket,
      seasonId,
      leader.id,
      entries.map((e) => e.characterId),
    );
    if (!opponent) {
      await this.queue.enqueue(bracket, seasonId, myTeam);
      return { status: 'queued', bracket };
    }

    const match = await this.resolveMatch(bracket, seasonId, myTeam, opponent);
    return { status: 'matched', bracket, matchId: match.id };
  }

  /** Opustí frontu daného bracketu (jen pokud je leaderem čekajícího týmu). */
  async leaveQueue(
    accountId: string,
    characterId: string,
    bracket: string,
  ): Promise<{ left: boolean }> {
    await this.own(accountId, characterId);
    if (!isTeamBracket(bracket)) throw new BadRequestException('Not a team bracket');
    const seasonId = this.season();
    const queued = await this.queue.isLeaderQueued(bracket, seasonId, characterId);
    await this.queue.remove(bracket, seasonId, characterId);
    return { left: queued };
  }

  /** Detail/přehrání týmového zápasu z perspektivy postavy (reveal dle času). */
  async getMatch(accountId: string, characterId: string, matchId: string): Promise<TeamMatchView> {
    await this.own(accountId, characterId);
    const match = await this.arena.findTeamMatch(matchId);
    if (!match) throw new NotFoundException('Match not found');
    const onA = match.aMemberIds.includes(characterId);
    const onB = match.bMemberIds.includes(characterId);
    if (!onA && !onB) throw new ForbiddenException('Not a participant of this match');
    return this.toMatchView(match, onA ? 'a' : 'b', Date.now());
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async resolveMatch(
    bracket: TeamBracket,
    seasonId: string,
    teamA: TeamQueueEntry,
    teamB: TeamQueueEntry,
  ): Promise<ArenaTeamMatch> {
    const seed = seedFromString(`${bracket}:${teamA.leaderCharacterId}:${teamB.leaderCharacterId}:${Date.now()}`);
    const result = simulateTeamFight(
      teamA.members.map((m) => m.snapshot),
      teamB.members.map((m) => m.snapshot),
      seed,
    );

    const match = await this.arena.createTeamMatch({
      seasonId,
      bracket,
      aMembers: teamA.members.map((m) => m.snapshot),
      bMembers: teamB.members.map((m) => m.snapshot),
      aMemberIds: teamA.members.map((m) => m.characterId),
      bMemberIds: teamB.members.map((m) => m.characterId),
      seed,
      winner: result.winner,
      durationSec: result.durationSec,
    });

    const avg = (team: TeamQueueEntry): number =>
      Math.round(team.members.reduce((s, m) => s + m.rating, 0) / team.members.length);
    const aAvg = avg(teamA);
    const bAvg = avg(teamB);

    await this.applyRatings(teamA, bAvg, bracket, seasonId, result.winner === 'a');
    await this.applyRatings(teamB, aAvg, bracket, seasonId, result.winner === 'b');

    // Notifikuj členy soupeřova (čekajícího) týmu — byli offline.
    for (const m of teamB.members) {
      await this.push.sendToAccount(m.accountId, {
        title: 'Arena Match!',
        body: `Your ${bracket} team ${result.winner === 'b' ? 'won' : 'lost'} a match.`,
        characterId: m.characterId,
      });
    }
    return match;
  }

  private async applyRatings(
    team: TeamQueueEntry,
    opponentAvg: number,
    bracket: TeamBracket,
    seasonId: string,
    won: boolean,
  ): Promise<void> {
    for (const m of team.members) {
      const { rating } = eloDelta(m.rating, opponentAvg, won);
      await this.arena.recordResult(m.characterId, bracket, seasonId, rating, won);
    }
  }

  private async buildCombatProfile(character: Character): Promise<CombatActor> {
    const level = levelFromXp(character.totalXp);
    const primary = baseStatsFor(character.race as RaceId, character.class as ClassId, level);
    const equipment = await this.inventory.getEquipmentStats(character.id);
    const talentRows = await this.talents.listTalents(character.id);
    const allocations: Record<string, number> = {};
    for (const r of talentRows) allocations[r.talentId] = r.points;
    const talents = aggregateTalentEffects(character.class as ClassId, allocations);
    const profile = deriveCombatProfile({
      name: character.name,
      level,
      klass: character.class as ClassId,
      primary,
      equipment,
      talents,
    });
    const rotation = await this.rotation.rotationForCombat(
      character.id,
      character.class as ClassId,
      level,
    );
    return rotation ? { ...profile, rotation } : profile;
  }

  private toMatchView(match: ArenaTeamMatch, mySide: DuelSide, now: number): TeamMatchView {
    const startMs = match.createdAt.getTime();
    const elapsedSec = Math.max(0, Math.floor((now - startMs) / 1000));
    const completed = now >= startMs + match.durationSec * 1000;
    const result = simulateTeamFight(match.aMembers, match.bMembers, match.seed);
    const visible = result.events.filter((e) => e.t <= elapsedSec);

    const aView = match.aMembers.map((m) => ({ name: m.name, maxHealth: m.maxHealth }));
    const bView = match.bMembers.map((m) => ({ name: m.name, maxHealth: m.maxHealth }));
    const outcome: 'win' | 'loss' | null = !completed ? null : match.winner === mySide ? 'win' : 'loss';

    return {
      matchId: match.id,
      bracket: match.bracket,
      durationSec: match.durationSec,
      progress: {
        elapsedSec,
        remainingSec: Math.max(0, match.durationSec - elapsedSec),
        completed,
      },
      myTeam: mySide === 'a' ? aView : bView,
      enemyTeam: mySide === 'a' ? bView : aView,
      events: visible,
      outcome,
    };
  }
}
