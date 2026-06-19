import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  computeGroupReward,
  deriveRaidActor,
  DUNGEONS,
  dungeonReputationGain,
  GENERALIST_FACTION,
  groupContentSizes,
  hasSlotForTier,
  isDungeonId,
  isDungeonUnlocked,
  isRaidRole,
  levelFromXp,
  lockoutIdForContent,
  partyMemberAbilities,
  partyRoundReady,
  resolvePartyRound,
  seedFromString,
  startPartyRun,
  submitPartyAction,
  weeklyLockoutId,
  type CombatEvent,
  type PartyRunSeatInput,
  type PartyRunState,
  type PartyRunStatus,
  type RaidReward,
  type RaidRole,
  type SpellSlots,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { GroupRepository } from '../group/group.repository';
import { InventoryGrantService } from '../inventory/inventory-grant.service';
import { LockoutRepository } from '../lockout/lockout.repository';
import { ReputationRepository } from '../profession/profession.repository';
import { CompletedQuestRepository } from '../quest/quest.repository';
import { RotationService } from '../rotation/rotation.service';
import { HistoryRepository } from '../history/history.repository';
import type { Character, DungeonPartyRun } from '../db/schema';
import { DungeonPartyRepository } from './dungeon-party.repository';

/** Časové okno na tah party (ms). Po něm AI fallback doplní nečinné hráče. */
const ROUND_DEADLINE_MS = 60_000;
/** Bezpečnostní strop „dohnání" overdue kol v jednom volání (determinismus). */
const MAX_CATCHUP_ROUNDS = 1000;

interface PartyAbilityView {
  id: string;
  name: string;
  description: string;
  kind: string;
  cooldownSec: number;
  cooldownRemaining: number;
  ready: boolean;
  spellTier: number;
  outOfSlots: boolean;
  kiCost: number;
  outOfKi: boolean;
}

interface PartyMemberView {
  slot: number;
  name: string;
  role: RaidRole;
  isAi: boolean;
  isYou: boolean;
  currentHealth: number;
  maxHealth: number;
  absorb: number;
  submitted: boolean;
}

export interface DungeonPartyRunView {
  runId: string;
  dungeonId: string;
  dungeonName: string;
  status: PartyRunStatus;
  size: number;
  encounterIndex: number;
  encounterCount: number;
  encountersCleared: number;
  roundReady: boolean;
  /** Deadline aktuálního kola (ms epoch) — UI odpočet do AI fallbacku. */
  roundDeadline: number | null;
  members: PartyMemberView[];
  enemies: { idx: number; name: string; isBoss: boolean; maxHealth: number; currentHealth: number }[];
  /** Stav volajícího hráče (jeho ability bar + zdroje); null, pokud padl. */
  you: {
    slot: number;
    role: RaidRole;
    currentHealth: number;
    maxHealth: number;
    absorb: number;
    submitted: boolean;
    spellSlots: SpellSlots;
    maxSpellSlots: SpellSlots;
    kiPoints: number;
    maxKiPoints: number;
    abilities: PartyAbilityView[];
  } | null;
  events: CombatEvent[];
  /** Vyplněno po ukončení runu — personal reward volajícího. */
  reward: RaidReward | null;
  myLockedOut: boolean;
}

/**
 * Živé MP tahové dungeon sezení (ADR 0038, Slice 4b). Sdílený multi-owner run
 * party reálných hráčů: každý člen posílá svou akci (`submit`); jakmile odešlou
 * všichni živí (nebo vyprší deadline → AI fallback za nečinné), kolo se vyhodnotí
 * (`resolvePartyRound`). Funguje přes REST polling (jako group page) — WS push je
 * Slice 4c. Odměna sdílí `computeGroupReward` + lockout + reputaci se Slice 2/3.
 */
@Injectable()
export class DungeonPartyService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly groups: GroupRepository,
    private readonly grant: InventoryGrantService,
    private readonly lockouts: LockoutRepository,
    private readonly reputation: ReputationRepository,
    private readonly completed: CompletedQuestRepository,
    private readonly rotation: RotationService,
    private readonly history: HistoryRepository,
    private readonly repo: DungeonPartyRepository,
  ) {}

  /**
   * Spustí živé MP tahové sezení z **party** leadera (joined členové + jejich
   * role). Velikost = počet členů (3/5). Každý člen vlastní svůj slot.
   */
  async launch(accountId: string, characterId: string, dungeonId: string): Promise<DungeonPartyRunView> {
    const leader = await this.ownedOrThrow(accountId, characterId);
    if (!isDungeonId(dungeonId)) throw new BadRequestException('Unknown dungeon');

    const membership = await this.groups.activeMembership(characterId);
    if (!membership) throw new BadRequestException('You are not in a group');
    if (membership.group.leaderCharacterId !== characterId) {
      throw new ForbiddenException('Only the group leader can start a live dungeon');
    }

    const memberRows = (await this.groups.listMembers(membership.group.id)).filter(
      (m) => m.status === 'joined',
    );
    const size = memberRows.length;
    if (size <= 1 || !groupContentSizes('dungeon', dungeonId).includes(size)) {
      throw new BadRequestException('Live dungeon needs a party of 3 or 5');
    }
    for (const m of memberRows) {
      if (!isRaidRole(m.role)) throw new BadRequestException('Invalid member role');
    }

    const level = levelFromXp(leader.totalXp);
    const completedSet = new Set(await this.completed.completedIds(characterId));
    if (!isDungeonUnlocked(dungeonId, level, completedSet)) {
      throw new ForbiddenException('Dungeon locked (level or attunement)');
    }

    // Žádný člen nesmí být v jiném rozehraném MP runu.
    for (const m of memberRows) {
      if (await this.repo.findActiveForCharacter(m.characterId)) {
        throw new BadRequestException('A party member is already in a live dungeon');
      }
    }

    // Leader první (slot 0), pak ostatní — staví seaty z reálných hráčů.
    memberRows.sort((a, b) => Number(b.characterId === characterId) - Number(a.characterId === characterId));
    const chars = await this.characters.findByIds(memberRows.map((m) => m.characterId));
    const byId = new Map(chars.map((c) => [c.id, c]));
    const seats: PartyRunSeatInput[] = [];
    const participants: { characterId: string; role: RaidRole; initiator: boolean }[] = [];
    for (const m of memberRows) {
      const c = byId.get(m.characterId);
      if (!c) continue;
      const memberLevel = levelFromXp(c.totalXp);
      const base = await this.rotation.buildCombatProfile(c, memberLevel);
      seats.push({ owner: c.id, actor: deriveRaidActor(base, m.role) });
      participants.push({ characterId: c.id, role: m.role, initiator: c.id === characterId });
    }
    if (seats.length <= 1) throw new BadRequestException('Group has no joined members');

    const seed = seedFromString(`dungeon-party:${membership.group.id}:${Date.now()}`);
    const state = startPartyRun(seats, dungeonId, seats.length, level, seed);

    const run = await this.repo.createRun({
      dungeonId,
      leaderCharacterId: characterId,
      level,
      size: seats.length,
      state,
      status: state.status,
      encountersCleared: state.encountersCleared,
      roundDeadline: new Date(Date.now() + ROUND_DEADLINE_MS),
    });
    for (const p of participants) {
      await this.repo.addParticipant({
        runId: run.id,
        characterId: p.characterId,
        role: p.role,
        initiator: p.initiator ? 1 : 0,
      });
    }
    return this.toView(run, state, characterId);
  }

  /** Aktuální stav runu (řídí i AI fallback pro prošlé deadliny). */
  async getRun(accountId: string, characterId: string, runId: string): Promise<DungeonPartyRunView> {
    await this.ownedOrThrow(accountId, characterId);
    let run = await this.participantRunOrThrow(characterId, runId);
    run = await this.progressOverdue(run, characterId);
    return this.toView(run, run.state, characterId);
  }

  /** Postava odešle svou akci pro aktuální kolo (ability + cíl). */
  async submit(
    accountId: string,
    characterId: string,
    runId: string,
    abilityId: string,
    targetId: number,
  ): Promise<DungeonPartyRunView> {
    await this.ownedOrThrow(accountId, characterId);
    let run = await this.participantRunOrThrow(characterId, runId);
    if (run.status !== 'in_combat') throw new BadRequestException('Run already finished');
    if (!abilityId) throw new BadRequestException('Missing ability');

    // Nejdřív dožeň prošlá kola (AI fallback), pak přijmi novou akci.
    run = await this.progressOverdue(run, characterId);
    if (run.status !== 'in_combat') return this.toView(run, run.state, characterId);

    const state = run.state;
    const res = submitPartyAction(state, characterId, abilityId, Number(targetId) || 0);
    if (!res.ok) throw new BadRequestException(res.reason ?? 'Invalid action');

    if (partyRoundReady(state)) {
      resolvePartyRound(state);
      return this.persist(run, state, characterId, true);
    }
    // Čeká se na ostatní — uložit buffer, deadline beze změny.
    await this.repo.updateState(run.id, state, state.status, state.encountersCleared, run.roundDeadline);
    return this.toView({ ...run, state }, state, characterId);
  }

  /** Leader ukončí běh předčasně (žádná odměna). */
  async abandon(accountId: string, characterId: string, runId: string): Promise<DungeonPartyRunView> {
    await this.ownedOrThrow(accountId, characterId);
    const run = await this.participantRunOrThrow(characterId, runId);
    if (run.leaderCharacterId !== characterId) throw new ForbiddenException('Only the leader can abandon');
    if (run.status !== 'in_combat') return this.toView(run, run.state, characterId);
    const next: PartyRunState = { ...run.state, status: 'wiped', enemies: [] };
    return this.finalize(run, next, characterId);
  }

  // ── Interní ────────────────────────────────────────────────────────────────

  /** Vyhodnotí všechna kola s prošlým deadlinem (AI fallback za nečinné hráče). */
  private async progressOverdue(run: DungeonPartyRun, viewer: string): Promise<DungeonPartyRun> {
    if (run.status !== 'in_combat') return run;
    const state = run.state;
    let changed = false;
    let guard = 0;
    while (
      state.status === 'in_combat' &&
      run.roundDeadline != null &&
      Date.now() > run.roundDeadline.getTime() &&
      guard++ < MAX_CATCHUP_ROUNDS
    ) {
      resolvePartyRound(state);
      changed = true;
      run = { ...run, roundDeadline: new Date(Date.now() + ROUND_DEADLINE_MS) };
    }
    if (!changed) return run;
    if (state.status !== 'in_combat') {
      await this.finalize(run, state, viewer);
      return { ...run, state, status: state.status, encountersCleared: state.encountersCleared };
    }
    await this.repo.updateState(run.id, state, state.status, state.encountersCleared, run.roundDeadline);
    return { ...run, state, status: state.status, encountersCleared: state.encountersCleared };
  }

  /** Uloží stav po vyhodnoceném kole; při konci finalizuje (odměny). */
  private async persist(
    run: DungeonPartyRun,
    state: PartyRunState,
    viewer: string,
    newRound: boolean,
  ): Promise<DungeonPartyRunView> {
    if (state.status !== 'in_combat') return this.finalize(run, state, viewer);
    const deadline = newRound ? new Date(Date.now() + ROUND_DEADLINE_MS) : run.roundDeadline;
    await this.repo.updateState(run.id, state, state.status, state.encountersCleared, deadline);
    return this.toView({ ...run, state, roundDeadline: deadline }, state, viewer);
  }

  /**
   * Uzavře run: při clearu udělí **každému účastníkovi** personal reward
   * (computeGroupReward + weekly lockout + reputace + loot), při wipu/abandonu nic.
   */
  private async finalize(
    run: DungeonPartyRun,
    state: PartyRunState,
    viewer: string,
  ): Promise<DungeonPartyRunView> {
    const victory = state.status === 'cleared';
    await this.repo.finalizeRun(run.id, state, state.status, state.encountersCleared);

    const participants = await this.repo.listParticipants(run.id);
    const dungeon = DUNGEONS[run.dungeonId];
    let viewerReward: RaidReward = { xp: 0, gold: 0, items: [] };
    let viewerLockedOut = false;

    for (const p of participants) {
      let reward: RaidReward = { xp: 0, gold: 0, items: [] };
      let lockedOut = false;
      if (victory) {
        const rewardSeed = seedFromString(`${run.id}:${p.characterId}`);
        reward = computeGroupReward('dungeon', run.dungeonId, true, rewardSeed, 0);
        const lockoutId = lockoutIdForContent('dungeon', run.dungeonId);
        if (lockoutId) {
          const acquired = await this.lockouts.acquire(p.characterId, lockoutId, weeklyLockoutId(Date.now()));
          if (!acquired) {
            reward = { xp: 0, gold: 0, items: [] };
            lockedOut = true;
          }
        }
        if (reward.xp > 0 || reward.gold > 0) await this.characters.addRewards(p.characterId, reward.xp, reward.gold);
        if (reward.items.length > 0) {
          await this.grant.grant(p.characterId, reward.items.map((itemId) => ({ itemId, quantity: 1 })));
        }
        if (!lockedOut && dungeon) {
          await this.reputation.addStanding(p.characterId, GENERALIST_FACTION, dungeonReputationGain(dungeon.recommendedLevel));
        }
      }
      await this.repo.setParticipantReward(run.id, p.characterId, reward);
      this.recordHistory(p.characterId, run.dungeonId, victory, lockedOut, reward);
      if (p.characterId === viewer) {
        viewerReward = reward;
        viewerLockedOut = lockedOut;
      }
    }

    const finished: DungeonPartyRun = { ...run, state, status: state.status, encountersCleared: state.encountersCleared };
    return this.toView(finished, state, viewer, viewerReward, viewerLockedOut);
  }

  private recordHistory(
    characterId: string,
    dungeonId: string,
    victory: boolean,
    lockedOut: boolean,
    reward: RaidReward,
  ): void {
    const name = DUNGEONS[dungeonId]?.name ?? dungeonId;
    const itemNote = reward.items.length > 0 ? `, ${reward.items.length} item${reward.items.length === 1 ? '' : 's'}` : '';
    void this.history
      .record({
        characterId,
        kind: 'dungeon',
        title: `${name} (live party) ${victory ? 'cleared' : 'failed'}`,
        detail: victory
          ? lockedOut
            ? 'Already saved this week — no reward.'
            : `+${reward.xp} XP, +${reward.gold}g${itemNote}`
          : 'The party fell in the dungeon.',
        outcome: victory ? 'victory' : 'defeat',
      })
      .catch(() => {
        /* best-effort */
      });
  }

  private toView(
    run: DungeonPartyRun,
    state: PartyRunState,
    viewer: string,
    reward?: RaidReward,
    lockedOut = false,
  ): DungeonPartyRunView {
    const you = state.members.find((m) => m.owner === viewer) ?? null;
    const finishedReward =
      reward ?? (state.status !== 'in_combat' ? { xp: 0, gold: 0, items: [] } : null);
    return {
      runId: run.id,
      dungeonId: run.dungeonId,
      dungeonName: DUNGEONS[run.dungeonId]?.name ?? run.dungeonId,
      status: state.status,
      size: state.size,
      encounterIndex: state.encounterIndex,
      encounterCount: state.encounterCount,
      encountersCleared: state.encountersCleared,
      roundReady: partyRoundReady(state),
      roundDeadline: run.roundDeadline ? run.roundDeadline.getTime() : null,
      members: state.members.map((m) => ({
        slot: m.slot,
        name: m.name,
        role: m.role,
        isAi: m.owner == null,
        isYou: m.owner === viewer,
        currentHealth: Math.max(0, Math.round(m.currentHealth)),
        maxHealth: m.maxHealth,
        absorb: Math.round(m.absorb),
        submitted: state.pending[m.slot] !== undefined,
      })),
      enemies: state.enemies.map((e) => ({
        idx: e.idx,
        name: e.name,
        isBoss: e.isBoss,
        maxHealth: e.maxHealth,
        currentHealth: Math.max(0, Math.round(e.currentHealth)),
      })),
      you: you
        ? {
            slot: you.slot,
            role: you.role,
            currentHealth: Math.max(0, Math.round(you.currentHealth)),
            maxHealth: you.maxHealth,
            absorb: Math.round(you.absorb),
            submitted: state.pending[you.slot] !== undefined,
            spellSlots: you.spellSlots ?? {},
            maxSpellSlots: you.actor.spellSlots ?? {},
            kiPoints: you.kiPoints ?? 0,
            maxKiPoints: you.actor.kiPoints ?? 0,
            abilities: partyMemberAbilities(you.actor).map((a) => {
              const remaining = you.cooldowns[a.id] ?? 0;
              const spellTier = a.spellTier ?? 0;
              const kiCost = a.kiCost ?? 0;
              return {
                id: a.id,
                name: a.name,
                description: a.description ?? '',
                kind: a.kind,
                cooldownSec: a.cooldownSec,
                cooldownRemaining: remaining,
                ready: remaining <= 0,
                spellTier,
                outOfSlots: spellTier >= 1 && !hasSlotForTier(you.spellSlots ?? {}, spellTier),
                kiCost,
                outOfKi: kiCost > (you.kiPoints ?? Number.POSITIVE_INFINITY),
              };
            }),
          }
        : null,
      events: state.log,
      reward: finishedReward,
      myLockedOut: lockedOut,
    };
  }

  private async ownedOrThrow(accountId: string, characterId: string): Promise<Character> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    return character;
  }

  private async participantRunOrThrow(characterId: string, runId: string): Promise<DungeonPartyRun> {
    const run = await this.repo.findRun(runId);
    if (!run || !(await this.repo.isParticipant(runId, characterId))) {
      throw new NotFoundException('Live dungeon run not found');
    }
    return run;
  }
}
