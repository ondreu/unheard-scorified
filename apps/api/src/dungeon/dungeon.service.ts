import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  aggregateTalentEffects,
  baseStatsFor,
  computeGroupReward,
  deriveCombatProfile,
  deriveRaidActor,
  DUNGEON_SIZES,
  DUNGEONS,
  groupComposition,
  groupEncounters,
  isDungeonId,
  isDungeonSize,
  isDungeonUnlocked,
  isRaidRole,
  isValidComposition,
  levelFromXp,
  lockoutIdForContent,
  RAID_ROLES,
  seedFromString,
  simulateRaidRun,
  weeklyLockoutId,
  type ClassId,
  type CombatActor,
  type CombatEvent,
  type RaceId,
  type RaidActor,
  type RaidComposition,
  type RaidReward,
  type RaidRole,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryGrantService } from '../inventory/inventory-grant.service';
import { LockoutRepository } from '../lockout/lockout.repository';
import { TalentRepository } from '../talent/talent.repository';
import { PushService } from '../push/push.service';
import type { Character, RaidRun } from '../db/schema';
import { RaidRepository } from '../raid/raid.repository';
import { RAID_QUEUE, type RaidQueue } from '../raid/raid.matchmaking';
import { RotationService } from '../rotation/rotation.service';

const RECENT_RUNS_LIMIT = 8;

/** Frontový klíč dungeonu (sdílená RaidQueue, oddělený namespace od raidů). */
function queueKey(dungeonId: string): string {
  return `dungeon:${dungeonId}`;
}

/** Člen party pro group/idle dungeon run (leader = první). */
export interface DungeonMember {
  character: Character;
  role: RaidRole;
}

export interface DungeonListItem {
  id: string;
  name: string;
  description: string;
  requiredLevel: number;
  recommendedLevel: number;
  encounterCount: number;
  bossName: string;
  /** Povolené velikosti party (1 = solo, 3, 5). */
  sizes: number[];
  unlocked: boolean;
  /** Role, ve které postava čeká ve frontě group dungeonu (nebo null). */
  queuedRole: RaidRole | null;
  /** Tato instance má weekly lockout (M8.6) — clear se počítá jen jednou týdně. */
  hasLockout: boolean;
  /** Postava už tuto instanci tento týden vyčistila (žádná další odměna). */
  lockedOut: boolean;
}

export interface DungeonRewardView {
  xp: number;
  gold: number;
  items: string[];
}

export interface DungeonRunView {
  runId: string;
  dungeonId: string;
  dungeonName: string;
  size: number;
  startAt: string;
  durationSec: number;
  progress: {
    elapsedSec: number;
    remainingSec: number;
    progress: number;
    completed: boolean;
    finishesAt: string;
  };
  party: { name: string; role: RaidRole; maxHealth: number }[];
  encounters: { name: string; isBoss: boolean }[];
  events: CombatEvent[];
  /** null dokud se boj „neodehraje" (reveal dle času); pak true/false. */
  victory: boolean | null;
  /** Počet wipů (po dokončení; řídí snížení odměny). Null dokud běží. */
  wipes: number | null;
  myReward: DungeonRewardView | null;
  myRole: RaidRole | null;
  /** Vítězství proběhlo, ale odměna propadla weekly lockoutem (M8.6). */
  myLockedOut: boolean;
}

export interface DungeonRunSummary {
  runId: string;
  dungeonId: string;
  dungeonName: string;
  role: RaidRole;
  victory: boolean;
  reward: DungeonRewardView;
  createdAt: string;
}

/**
 * Dungeony (M5, sjednoceno M8.5-B na **group PVE run** model). SP dungeon = run
 * s party 1 dps; group dungeon (3/5) = role + NPC backfill jako raid. Combat,
 * persistence (sdílené run tabulky), matchmaking a personal loot recyklují raid
 * infrastrukturu (`RaidRepository`, `RaidQueue`, `simulateRaidRun`, group helpery).
 * Žádný `character_activities` (na rozdíl od původního M5). Viz ADR 0014.
 */
@Injectable()
export class DungeonService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly inventory: InventoryService,
    private readonly inventoryRepo: InventoryRepository,
    private readonly grant: InventoryGrantService,
    private readonly talents: TalentRepository,
    private readonly push: PushService,
    private readonly repo: RaidRepository,
    private readonly lockouts: LockoutRepository,
    private readonly rotation: RotationService,
    @Inject(RAID_QUEUE) private readonly queue: RaidQueue,
  ) {}

  /** Seznam dungeonů s flagem `unlocked` dle levelu + stav fronty (group). */
  async listDungeons(accountId: string, characterId: string): Promise<DungeonListItem[]> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const level = levelFromXp(character.totalXp);
    const weekId = weeklyLockoutId(Date.now());
    const result: DungeonListItem[] = [];
    for (const d of Object.values(DUNGEONS).sort((a, b) => a.requiredLevel - b.requiredLevel)) {
      const queuedRole = await this.queue.queuedRole(queueKey(d.id), characterId);
      const lockoutId = lockoutIdForContent('dungeon', d.id);
      const lockedOut = lockoutId !== null && (await this.lockouts.isLocked(characterId, lockoutId, weekId));
      result.push({
        id: d.id,
        name: d.name,
        description: d.description,
        requiredLevel: d.requiredLevel,
        recommendedLevel: d.recommendedLevel,
        encounterCount: d.encounters.length,
        bossName: d.encounters.at(-1)?.name ?? '',
        sizes: [...DUNGEON_SIZES],
        unlocked: isDungeonUnlocked(d.id, level),
        queuedRole,
        hasLockout: lockoutId !== null,
        lockedOut,
      });
    }
    return result;
  }

  /** Zařadí postavu do fronty group dungeonu v dané roli (čeká na vytažení). */
  async queueForDungeon(
    accountId: string,
    characterId: string,
    dungeonId: string,
    role: string,
  ): Promise<{ queued: true; role: RaidRole }> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    if (!isDungeonId(dungeonId)) throw new BadRequestException('Unknown dungeon');
    if (!isRaidRole(role)) throw new BadRequestException('Invalid role');

    const level = levelFromXp(character.totalXp);
    if (!isDungeonUnlocked(dungeonId, level)) {
      throw new BadRequestException(`Dungeon requires level ${DUNGEONS[dungeonId]!.requiredLevel}`);
    }

    const snapshot = await this.buildRaidActor(character, level, role);
    await this.queue.enqueue(queueKey(dungeonId), {
      characterId,
      accountId,
      name: character.name,
      role,
      snapshot,
      queuedAt: Date.now(),
    });
    return { queued: true, role };
  }

  /** Opustí frontu group dungeonu. */
  async leaveQueue(
    accountId: string,
    characterId: string,
    dungeonId: string,
  ): Promise<{ left: boolean }> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    if (!isDungeonId(dungeonId)) throw new BadRequestException('Unknown dungeon');
    const wasQueued = await this.queue.isQueued(queueKey(dungeonId), characterId);
    await this.queue.remove(queueKey(dungeonId), characterId);
    return { left: wasQueued };
  }

  /**
   * Pošle postavu do dungeonu (SP `size=1` nebo group 3/5). Sestaví party
   * (vytažení čekajících + NPC backfill), deterministicky vyřeší a uloží jako
   * group run; **personal loot** se udělí každému reálnému účastníkovi.
   */
  async enter(
    accountId: string,
    characterId: string,
    dungeonId: string,
    size?: number,
    role?: string,
    composition?: RaidComposition,
  ): Promise<DungeonRunView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    if (!isDungeonId(dungeonId)) throw new BadRequestException('Unknown dungeon');

    const dungeon = DUNGEONS[dungeonId]!;
    const level = levelFromXp(character.totalXp);
    if (!isDungeonUnlocked(dungeonId, level)) {
      throw new BadRequestException(`Dungeon requires level ${dungeon.requiredLevel}`);
    }

    const chosenSize = size ?? 1;
    if (!isDungeonSize(chosenSize)) {
      throw new BadRequestException(`Dungeon size ${chosenSize} not allowed (${DUNGEON_SIZES.join('/')})`);
    }

    // Role: SP je vždy dps; group default dps, lze zvolit.
    const myRole: RaidRole = chosenSize === 1 ? 'dps' : isRaidRole(role ?? '') ? (role as RaidRole) : 'dps';
    const comp = composition ?? groupComposition('dungeon', chosenSize);
    if (!isValidComposition(comp, chosenSize, myRole)) {
      throw new BadRequestException(
        `Invalid composition: counts must be non-negative, sum to ${chosenSize}, and include your role`,
      );
    }

    await this.queue.remove(queueKey(dungeonId), characterId);

    // Party = iniciátor + vytažení čekající hráči z fronty (žádný NPC backfill;
    // chybí-li hráči, party je menší a obsah se škáluje její velikostí).
    const members: DungeonMember[] = [{ character, role: myRole }];
    const need: Record<RaidRole, number> = { tank: comp.tank, healer: comp.healer, dps: comp.dps };
    need[myRole] -= 1;
    for (const r of RAID_ROLES) {
      for (let i = 0; i < need[r]; i++) {
        const candidate = await this.queue.takeByRole(queueKey(dungeonId), r, characterId);
        if (!candidate) break; // žádný další čekající hráč této role
        const pc = await this.characters.findById(candidate.characterId);
        if (pc) members.push({ character: pc, role: candidate.role });
      }
    }

    return this.finalizeDungeonRun(dungeonId, character, members);
  }

  /**
   * Spustí dungeon s předem sestavenou skupinou (M9 group). Členové (leader =
   * `members[0]`) jdou rovnou do runu — žádná fronta. Unlock gatuje leaderův level.
   */
  async runForGroup(
    leader: Character,
    dungeonId: string,
    members: DungeonMember[],
  ): Promise<DungeonRunView> {
    if (!isDungeonId(dungeonId)) throw new BadRequestException('Unknown dungeon');
    const dungeon = DUNGEONS[dungeonId]!;
    if (!isDungeonUnlocked(dungeonId, levelFromXp(leader.totalXp))) {
      throw new BadRequestException(`Dungeon requires level ${dungeon.requiredLevel}`);
    }
    return this.finalizeDungeonRun(dungeonId, leader, members);
  }

  /**
   * Sdílené dokončení dungeon runu: snapshot party, deterministická simulace,
   * uložení runu (`content_type='dungeon'`) a personal loot každému členu.
   * Volá idle `enter` (fronta) i group `runForGroup` (ruční parta).
   */
  private async finalizeDungeonRun(
    dungeonId: string,
    leader: Character,
    members: DungeonMember[],
  ): Promise<DungeonRunView> {
    const dungeon = DUNGEONS[dungeonId]!;
    const party: RaidActor[] = [];
    for (const m of members) {
      party.push(await this.buildRaidActor(m.character, levelFromXp(m.character.totalXp), m.role));
    }

    const seed = seedFromString(`${dungeonId}:${leader.id}:${Date.now()}`);
    const encounters = this.encountersFor(dungeonId, party.length);
    const result = simulateRaidRun(party, encounters, seed);

    const run = await this.repo.createRun({
      contentType: 'dungeon',
      raidId: dungeonId,
      party,
      seed,
      victory: result.victory ? 1 : 0,
      durationSec: result.durationSec,
    });

    let leaderReward: RaidReward | null = null;
    for (let i = 0; i < members.length; i++) {
      const m = members[i]!;
      const initiator = i === 0;
      const reward = await this.grantParticipant(
        run.id, m.character, m.role, initiator, dungeonId, result.victory, result.wipes,
      );
      if (initiator) {
        leaderReward = reward;
      } else {
        await this.push.sendToAccount(m.character.accountId, {
          title: 'Dungeon Complete!',
          body: `${m.character.name} joined ${leader.name}'s ${dungeon.name} and the party ${result.victory ? 'cleared it' : 'wiped'}.`,
          characterId: m.character.id,
        });
      }
    }

    return this.toRunView(run, leader.id, Date.now(), leaderReward, members[0]!.role);
  }

  /** Detail/přehrání dungeon runu z perspektivy postavy (reveal dle času). */
  async getRun(accountId: string, characterId: string, runId: string): Promise<DungeonRunView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const run = await this.repo.findRun(runId);
    if (!run || run.contentType !== 'dungeon') throw new NotFoundException('Dungeon run not found');
    const participants = await this.repo.listParticipants(runId);
    const mine = participants.find((p) => p.characterId === characterId);
    if (!mine) throw new ForbiddenException('Not a participant of this dungeon run');

    return this.toRunView(
      run,
      characterId,
      Date.now(),
      { xp: mine.rewardXp, gold: mine.rewardGold, items: mine.rewardItems },
      mine.role,
    );
  }

  /** Nedávné dungeon runy postavy. */
  async recentRuns(accountId: string, characterId: string): Promise<DungeonRunSummary[]> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const rows = await this.repo.listRecentForCharacter(characterId, RECENT_RUNS_LIMIT, 'dungeon');
    return rows.map(({ run, participant }) => ({
      runId: run.id,
      dungeonId: run.raidId,
      dungeonName: DUNGEONS[run.raidId]?.name ?? run.raidId,
      role: participant.role,
      victory: run.victory === 1,
      reward: { xp: participant.rewardXp, gold: participant.rewardGold, items: participant.rewardItems },
      createdAt: run.createdAt.toISOString(),
    }));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** `CombatActor[]` encounterů (škálované velikostí party) přes group helper. */
  private encountersFor(dungeonId: string, partySize: number): CombatActor[] {
    return groupEncounters('dungeon', dungeonId, partySize);
  }

  private async grantParticipant(
    runId: string,
    character: Character,
    role: RaidRole,
    initiator: boolean,
    dungeonId: string,
    victory: boolean,
    wipes: number,
  ): Promise<RaidReward> {
    const rewardSeed = seedFromString(`${runId}:${character.id}`);
    let reward = computeGroupReward('dungeon', dungeonId, victory, rewardSeed, wipes);

    // Weekly lockout (M8.6): jen vyšší dungeony (lockoutId != null). První vítězný
    // run v týdnu zamkne; další clear v témže UTC týdnu odměnu nedá.
    if (victory) {
      const lockoutId = lockoutIdForContent('dungeon', dungeonId);
      if (lockoutId) {
        const weekId = weeklyLockoutId(Date.now());
        const acquired = await this.lockouts.acquire(character.id, lockoutId, weekId);
        if (!acquired) reward = { xp: 0, gold: 0, items: [] };
      }
    }

    await this.characters.addRewards(character.id, reward.xp, reward.gold);
    await this.grant.grant(
      character.id,
      reward.items.map((itemId) => ({ itemId, quantity: 1 })),
    );
    await this.repo.addParticipant({
      raidRunId: runId,
      characterId: character.id,
      role,
      initiator: initiator ? 1 : 0,
      rewardXp: reward.xp,
      rewardGold: reward.gold,
      rewardItems: reward.items,
    });
    return reward;
  }

  private async buildRaidActor(
    character: Character,
    level: number,
    role: RaidRole,
  ): Promise<RaidActor> {
    const base = await this.buildCombatProfile(character, level);
    return deriveRaidActor(base, role);
  }

  private async buildCombatProfile(character: Character, level: number): Promise<CombatActor> {
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
    // Deklarativní rotace (MIL): připoj uloženou rotaci do snapshotu profilu.
    const rotation = await this.rotation.rotationForCombat(
      character.id,
      character.class as ClassId,
      level,
    );
    return rotation ? { ...profile, rotation } : profile;
  }

  private toRunView(
    run: RaidRun,
    viewerId: string,
    now: number,
    myReward: RaidReward | null,
    myRole: RaidRole | null,
  ): DungeonRunView {
    const dungeon = DUNGEONS[run.raidId];
    const startMs = run.createdAt.getTime();
    const elapsedSec = Math.max(0, Math.floor((now - startMs) / 1000));
    const remainingSec = Math.max(0, run.durationSec - elapsedSec);
    const completed = now >= startMs + run.durationSec * 1000;
    const progress = run.durationSec <= 0 ? 1 : Math.min(1, elapsedSec / run.durationSec);

    const encounters = this.encountersFor(run.raidId, run.party.length);
    const result = simulateRaidRun(run.party, encounters, run.seed);
    const visible = result.events.filter((e) => e.t <= elapsedSec);

    // Weekly lockout (M8.6): vítězný run lockoutovaného dungeonu s nulovou
    // odměnou ⇒ propadlo lockoutem (odvozeno z výsledku + odměny).
    const hasLockout = lockoutIdForContent('dungeon', run.raidId) !== null;
    const myLockedOut =
      hasLockout && run.victory === 1 && myReward !== null && myReward.xp === 0;

    return {
      runId: run.id,
      dungeonId: run.raidId,
      dungeonName: dungeon?.name ?? run.raidId,
      size: run.party.length,
      startAt: run.createdAt.toISOString(),
      durationSec: run.durationSec,
      progress: {
        elapsedSec,
        remainingSec,
        progress,
        completed,
        finishesAt: new Date(startMs + run.durationSec * 1000).toISOString(),
      },
      party: run.party.map((a) => ({
        name: a.name,
        role: a.role,
        maxHealth: a.maxHealth,
      })),
      encounters: (dungeon?.encounters ?? []).map((e) => ({ name: e.name, isBoss: e.isBoss ?? false })),
      events: visible,
      victory: completed ? run.victory === 1 : null,
      wipes: completed ? result.wipes : null,
      myReward: myReward ? { xp: myReward.xp, gold: myReward.gold, items: myReward.items } : null,
      myRole,
      myLockedOut,
    };
  }
}
