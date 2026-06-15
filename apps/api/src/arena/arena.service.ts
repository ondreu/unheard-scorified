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
  applyRatingChange,
  ARENA_MIN_LEVEL,
  baseStatsFor,
  DEFAULT_BRACKET,
  deriveCombatProfile,
  levelFromXp,
  ratingTier,
  ratingTierProgress,
  seasonById,
  seedFromString,
  simulatePvpDuel,
  type ArenaBracket,
  type ArenaTier,
  type ClassId,
  type CombatActor,
  type CombatEvent,
  type DuelSide,
  type RaceId,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryService } from '../inventory/inventory.service';
import { TalentRepository } from '../talent/talent.repository';
import { PushService } from '../push/push.service';
import type { ArenaMatch, Character } from '../db/schema';
import { ArenaRepository } from './arena.repository';
import { ArenaEventsRelay } from './arena.events';
import { RotationService } from '../rotation/rotation.service';
import {
  MATCHMAKING_QUEUE,
  type MatchmakingQueue,
  type QueueEntry,
} from './arena.matchmaking';
import { ARENA_LEADERBOARD, type ArenaLeaderboard } from './arena.leaderboard';

const LEADERBOARD_LIMIT = 10;
const RECENT_MATCHES_LIMIT = 8;

export interface LeaderboardRow {
  rank: number;
  characterId: string;
  name: string;
  rating: number;
  tier: ArenaTier;
  tierName: string;
  isSelf: boolean;
}

export interface MatchSummary {
  matchId: string;
  opponentName: string;
  won: boolean;
  ratingDelta: number;
  ratingAfter: number;
  createdAt: string;
}

export interface SeasonRewardView {
  seasonId: string;
  seasonName: string;
  finalRating: number;
  finalTier: string;
  rewardGold: number;
}

export interface ArenaView {
  season: { id: string; name: string; endsAt: string };
  bracket: ArenaBracket;
  minLevel: number;
  eligible: boolean;
  rating: number;
  tier: ArenaTier;
  tierName: string;
  nextTierAt: number | null;
  wins: number;
  losses: number;
  rank: number | null;
  queued: boolean;
  leaderboard: LeaderboardRow[];
  recentMatches: MatchSummary[];
  /** Nově udělené sezónní odměny (lazy rollover) — banner zobrazit jednou. */
  newSeasonRewards: SeasonRewardView[];
}

export interface QueueResult {
  status: 'queued' | 'matched';
  matchId?: string;
  arena: ArenaView;
}

export interface ArenaMatchView {
  matchId: string;
  seasonId: string;
  bracket: ArenaBracket;
  startAt: string;
  durationSec: number;
  progress: {
    elapsedSec: number;
    remainingSec: number;
    progress: number;
    completed: boolean;
    finishesAt: string;
  };
  me: { characterId: string; name: string; maxHealth: number };
  opponent: { characterId: string; name: string; maxHealth: number };
  events: CombatEvent[];
  /** null dokud souboj „neproběhne" (reveal dle uplynulého času); pak win/loss. */
  outcome: 'win' | 'loss' | null;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
}

/**
 * Arena (M7, MP PVP). Matchmaking přes sdílenou frontu (Redis), deterministický
 * 1v1 auto-resolve (recykluje combat engine z M5), Elo rating + sezónní ladder
 * s Redis žebříčkem a lazy sezónními odměnami. Realtime „match found" jde přes
 * WebSocket + Redis pub/sub (ArenaEventsRelay). Viz ADR 0010.
 */
@Injectable()
export class ArenaService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly inventory: InventoryService,
    private readonly talents: TalentRepository,
    private readonly repo: ArenaRepository,
    private readonly push: PushService,
    private readonly events: ArenaEventsRelay,
    private readonly rotation: RotationService,
    @Inject(MATCHMAKING_QUEUE) private readonly matchmaking: MatchmakingQueue,
    @Inject(ARENA_LEADERBOARD) private readonly leaderboard: ArenaLeaderboard,
  ) {}

  /** Přehled arény: rating, tier, žebříček, historie, stav fronty. */
  async getArena(accountId: string, characterId: string): Promise<ArenaView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    const season = activeSeasonAt(Date.now());
    const rewards = await this.settlePastSeasons(character, season.id);
    return this.buildArenaView(character, rewards);
  }

  /**
   * Zařadí postavu do fronty. Je-li k dispozici čekající soupeř, zápas se okamžitě
   * deterministicky vyřeší (a obě strany dostanou realtime „match found"); jinak
   * se uloží snapshot a postava čeká (idle — soupeř může přijít později).
   */
  async queue(accountId: string, characterId: string): Promise<QueueResult> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const level = levelFromXp(character.totalXp);
    if (level < ARENA_MIN_LEVEL) {
      throw new BadRequestException(`Arena requires level ${ARENA_MIN_LEVEL}`);
    }

    const now = Date.now();
    const season = activeSeasonAt(now);
    const bracket = DEFAULT_BRACKET;

    const rewards = await this.settlePastSeasons(character, season.id);
    const myRating = await this.repo.ensureRating(characterId, bracket, season.id);
    await this.leaderboard.setRating(season.id, bracket, characterId, myRating.rating);

    const snapshot = await this.buildPlayer(character, level);
    const me: Omit<QueueEntry, 'queuedAt'> = {
      characterId,
      accountId,
      name: character.name,
      rating: myRating.rating,
      snapshot,
    };

    const opponent = await this.matchmaking.takeOpponent(bracket, season.id, characterId);
    if (!opponent) {
      await this.matchmaking.enqueue(bracket, season.id, { ...me, queuedAt: now });
      return { status: 'queued', arena: await this.buildArenaView(character, rewards) };
    }

    const matchId = await this.resolveMatch(season.id, bracket, me, opponent);
    return { status: 'matched', matchId, arena: await this.buildArenaView(character, rewards) };
  }

  /** Opustí frontu. */
  async leaveQueue(accountId: string, characterId: string): Promise<{ left: boolean }> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    const season = activeSeasonAt(Date.now());
    const wasQueued = await this.matchmaking.isQueued(DEFAULT_BRACKET, season.id, characterId);
    await this.matchmaking.remove(DEFAULT_BRACKET, season.id, characterId);
    return { left: wasQueued };
  }

  /** Detail zápasu z perspektivy postavy (timeline se odhaluje dle času). */
  async getMatch(
    accountId: string,
    characterId: string,
    matchId: string,
  ): Promise<ArenaMatchView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const match = await this.repo.findMatch(matchId);
    if (!match) throw new NotFoundException('Match not found');
    if (match.aCharacterId !== characterId && match.bCharacterId !== characterId) {
      throw new ForbiddenException('Not a participant of this match');
    }

    return this.toMatchView(match, characterId, Date.now());
  }

  // ── Resolve ──────────────────────────────────────────────────────────────

  private async resolveMatch(
    seasonId: string,
    bracket: ArenaBracket,
    a: Omit<QueueEntry, 'queuedAt'>,
    b: QueueEntry,
  ): Promise<string> {
    // Soupeřův rating čteme aktuální z DB (snapshot ve frontě nesl rating ze
    // zařazení; mohl se mezitím změnit jen nepatrně — pro jistotu re-read).
    const bRow = await this.repo.ensureRating(b.characterId, bracket, seasonId);
    const aBefore = a.rating;
    const bBefore = bRow.rating;

    const seed = seedFromString(`${a.characterId}:${b.characterId}:${Date.now()}`);
    const result = simulatePvpDuel(a.snapshot, b.snapshot, seed);
    const aWon = result.winner === 'a';

    const change = aWon ? applyRatingChange(aBefore, bBefore) : applyRatingChange(bBefore, aBefore);
    const aAfter = aWon ? change.winner : change.loser;
    const bAfter = aWon ? change.loser : change.winner;

    await this.repo.recordResult(a.characterId, bracket, seasonId, aAfter, aWon);
    await this.repo.recordResult(b.characterId, bracket, seasonId, bAfter, !aWon);

    const match = await this.repo.createMatch({
      seasonId,
      bracket,
      aCharacterId: a.characterId,
      bCharacterId: b.characterId,
      aSnapshot: a.snapshot,
      bSnapshot: b.snapshot,
      seed,
      winner: result.winner,
      durationSec: result.durationSec,
      aRatingBefore: aBefore,
      aRatingAfter: aAfter,
      bRatingBefore: bBefore,
      bRatingAfter: bAfter,
    });

    await this.leaderboard.setRating(seasonId, bracket, a.characterId, aAfter);
    await this.leaderboard.setRating(seasonId, bracket, b.characterId, bAfter);

    // Realtime „match found" oběma stranám (cross-instance přes Redis adaptér).
    this.events.matchFound(match.id, a.characterId, b.characterId);
    // Push soupeři (typicky offline idle hráč) — best-effort.
    await this.notifyOpponent(b, a.name, !aWon, bAfter);

    return match.id;
  }

  private async notifyOpponent(
    opponent: QueueEntry,
    challengerName: string,
    opponentWon: boolean,
    opponentRating: number,
  ): Promise<void> {
    await this.push.sendToAccount(opponent.accountId, {
      title: 'Arena Match Resolved!',
      body: `${opponent.name} ${opponentWon ? 'defeated' : 'was defeated by'} ${challengerName} in the Arena. Rating: ${opponentRating}.`,
      characterId: opponent.characterId,
    });
  }

  // ── Views ──────────────────────────────────────────────────────────────────

  private async buildArenaView(
    character: Character,
    newSeasonRewards: SeasonRewardView[] = [],
  ): Promise<ArenaView> {
    const level = levelFromXp(character.totalXp);
    const now = Date.now();
    const season = activeSeasonAt(now);
    const bracket = DEFAULT_BRACKET;

    const ratingRow = await this.repo.ensureRating(character.id, bracket, season.id);
    await this.leaderboard.setRating(season.id, bracket, character.id, ratingRow.rating);

    const prog = ratingTierProgress(ratingRow.rating);
    const queued = await this.matchmaking.isQueued(bracket, season.id, character.id);

    // Žebříček: Redis cache, fallback na DB.
    let lb = await this.leaderboard.top(season.id, bracket, LEADERBOARD_LIMIT);
    if (lb.length === 0) {
      const rows = await this.repo.listTopRatings(season.id, bracket, LEADERBOARD_LIMIT);
      lb = rows.map((r, i) => ({ characterId: r.characterId, rating: r.rating, rank: i + 1 }));
    }
    const names = await this.characters.findByIds(lb.map((e) => e.characterId));
    const nameById = new Map(names.map((c) => [c.id, c.name]));
    const leaderboard: LeaderboardRow[] = lb.map((e) => {
      const t = ratingTier(e.rating);
      return {
        rank: e.rank,
        characterId: e.characterId,
        name: nameById.get(e.characterId) ?? '???',
        rating: e.rating,
        tier: t.tier,
        tierName: t.name,
        isSelf: e.characterId === character.id,
      };
    });

    let rank = await this.leaderboard.rank(season.id, bracket, character.id);
    if (rank === null) {
      rank = (await this.repo.countHigher(season.id, bracket, ratingRow.rating)) + 1;
    }

    const matches = await this.repo.listMatchesForCharacter(character.id, RECENT_MATCHES_LIMIT);
    const recentMatches: MatchSummary[] = matches.map((m) => {
      const side: DuelSide = m.aCharacterId === character.id ? 'a' : 'b';
      const won = m.winner === side;
      const before = side === 'a' ? m.aRatingBefore : m.bRatingBefore;
      const after = side === 'a' ? m.aRatingAfter : m.bRatingAfter;
      const opponentName = (side === 'a' ? m.bSnapshot : m.aSnapshot).name;
      return {
        matchId: m.id,
        opponentName,
        won,
        ratingDelta: after - before,
        ratingAfter: after,
        createdAt: m.createdAt.toISOString(),
      };
    });

    return {
      season: { id: season.id, name: season.name, endsAt: new Date(season.endsAt).toISOString() },
      bracket,
      minLevel: ARENA_MIN_LEVEL,
      eligible: level >= ARENA_MIN_LEVEL,
      rating: ratingRow.rating,
      tier: prog.tier.tier,
      tierName: prog.tier.name,
      nextTierAt: prog.nextMin,
      wins: ratingRow.wins,
      losses: ratingRow.losses,
      rank,
      queued,
      leaderboard,
      recentMatches,
      newSeasonRewards,
    };
  }

  private toMatchView(match: ArenaMatch, viewerId: string, now: number): ArenaMatchView {
    const side: DuelSide = match.aCharacterId === viewerId ? 'a' : 'b';
    const mine = side === 'a' ? match.aSnapshot : match.bSnapshot;
    const theirs = side === 'a' ? match.bSnapshot : match.aSnapshot;
    const myId = side === 'a' ? match.aCharacterId : match.bCharacterId;
    const oppId = side === 'a' ? match.bCharacterId : match.aCharacterId;
    const ratingBefore = side === 'a' ? match.aRatingBefore : match.bRatingBefore;
    const ratingAfter = side === 'a' ? match.aRatingAfter : match.bRatingAfter;

    const startMs = match.createdAt.getTime();
    const elapsedSec = Math.max(0, Math.floor((now - startMs) / 1000));
    const remainingSec = Math.max(0, match.durationSec - elapsedSec);
    const completed = now >= startMs + match.durationSec * 1000;
    const progress = match.durationSec <= 0 ? 1 : Math.min(1, elapsedSec / match.durationSec);

    const result = simulatePvpDuel(match.aSnapshot, match.bSnapshot, match.seed);
    const visible = result.events.filter((e) => e.t <= elapsedSec);
    const won = match.winner === side;

    return {
      matchId: match.id,
      seasonId: match.seasonId,
      bracket: match.bracket,
      startAt: match.createdAt.toISOString(),
      durationSec: match.durationSec,
      progress: {
        elapsedSec,
        remainingSec,
        progress,
        completed,
        finishesAt: new Date(startMs + match.durationSec * 1000).toISOString(),
      },
      me: { characterId: myId, name: mine.name, maxHealth: mine.maxHealth },
      opponent: { characterId: oppId, name: theirs.name, maxHealth: theirs.maxHealth },
      events: visible,
      outcome: completed ? (won ? 'win' : 'loss') : null,
      ratingBefore,
      ratingAfter,
      ratingDelta: ratingAfter - ratingBefore,
    };
  }

  // ── Sezónní rollover (lazy, idempotentní) ─────────────────────────────────

  private async settlePastSeasons(
    character: Character,
    activeSeasonId: string,
  ): Promise<SeasonRewardView[]> {
    const rows = await this.repo.listRatingsForCharacter(character.id);
    const granted: SeasonRewardView[] = [];
    for (const row of rows) {
      if (row.seasonId === activeSeasonId) continue;
      const existing = await this.repo.getSeasonReward(character.id, row.seasonId, row.bracket);
      if (existing) continue;

      const tier = ratingTier(row.rating);
      const inserted = await this.repo.insertSeasonReward({
        characterId: character.id,
        seasonId: row.seasonId,
        bracket: row.bracket,
        finalRating: row.rating,
        finalTier: tier.tier,
        rewardGold: tier.rewardGold,
      });
      if (!inserted) continue;

      if (tier.rewardGold > 0) {
        await this.characters.addRewards(character.id, 0, tier.rewardGold);
      }
      const season = seasonById(row.seasonId);
      granted.push({
        seasonId: row.seasonId,
        seasonName: season?.name ?? row.seasonId,
        finalRating: row.rating,
        finalTier: tier.name,
        rewardGold: tier.rewardGold,
      });
    }
    return granted;
  }

  /** Bojový profil postavy ze snapshotu staty + gear + talenty (jako dungeon). */
  private async buildPlayer(character: Character, level: number): Promise<CombatActor> {
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
    );
    return rotation ? { ...profile, rotation } : profile;
  }
}
