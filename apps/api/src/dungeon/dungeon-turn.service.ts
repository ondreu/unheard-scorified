import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  canCastDungeonAbility,
  computeGroupReward,
  DUNGEONS,
  dungeonReputationGain,
  dungeonRunAbilities,
  GENERALIST_FACTION,
  hasSlotForTier,
  isDungeonAbilityReady,
  isDungeonId,
  isDungeonUnlocked,
  levelFromXp,
  lockoutIdForContent,
  resolveDungeonTurn,
  seedFromString,
  startDungeonRun,
  weeklyLockoutId,
  type CombatActor,
  type CombatEvent,
  type DungeonRunState,
  type DungeonRunStatus,
  type RaidReward,
  type SpellSlots,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryGrantService } from '../inventory/inventory-grant.service';
import { LockoutRepository } from '../lockout/lockout.repository';
import { ReputationRepository } from '../profession/profession.repository';
import { CompletedQuestRepository } from '../quest/quest.repository';
import { RotationService } from '../rotation/rotation.service';
import { HistoryRepository } from '../history/history.repository';
import type { Character, DungeonTurnRun } from '../db/schema';
import { DungeonTurnRepository } from './dungeon-turn.repository';

const RECENT_RUNS_LIMIT = 8;

export interface DungeonTurnAbilityView {
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

export interface DungeonTurnEnemyView {
  idx: number;
  name: string;
  isBoss: boolean;
  maxHealth: number;
  currentHealth: number;
}

export interface DungeonTurnRunView {
  runId: string;
  dungeonId: string;
  dungeonName: string;
  status: DungeonRunStatus;
  encounterIndex: number;
  encounterCount: number;
  encountersCleared: number;
  player: {
    name: string;
    maxHealth: number;
    currentHealth: number;
    absorb: number;
    mitigationTurns: number;
    spellSlots: SpellSlots;
    maxSpellSlots: SpellSlots;
    kiPoints: number;
    maxKiPoints: number;
    rageCharges: number;
    maxRageCharges: number;
    raging: boolean;
  };
  enemies: DungeonTurnEnemyView[];
  abilities: DungeonTurnAbilityView[];
  events: CombatEvent[];
  /** Vyplněno po ukončení runu (clear/smrt/abandon). */
  reward: RaidReward | null;
  /** Vítězství proběhlo, ale odměna propadla weekly lockoutem (M8.6). */
  myLockedOut: boolean;
}

/**
 * Tahový dungeon run (dungeon overhaul Slice 2, ADR 0037) — interaktivní solo
 * alternativa k idle auto-resolve. Run je stateful (uložen v DB); klient posílá
 * jen volbu (ability + cíl), server dopočítá tah deterministicky (anti-cheat).
 * Odměna při vyčištění sdílí `computeGroupReward` + weekly lockout + reputaci
 * s auto-resolve dungeonem.
 */
@Injectable()
export class DungeonTurnService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly grant: InventoryGrantService,
    private readonly lockouts: LockoutRepository,
    private readonly reputation: ReputationRepository,
    private readonly completed: CompletedQuestRepository,
    private readonly rotation: RotationService,
    private readonly history: HistoryRepository,
    private readonly repo: DungeonTurnRepository,
  ) {}

  /** Vstup do tahového (solo) dungeonu — snapshot profilu + první encounter. */
  async enter(accountId: string, characterId: string, dungeonId: string): Promise<DungeonTurnRunView> {
    const character = await this.ownedOrThrow(accountId, characterId);
    if (!isDungeonId(dungeonId)) throw new BadRequestException('Unknown dungeon');

    const existing = await this.repo.findActiveForCharacter(characterId);
    if (existing) throw new BadRequestException('Finish or abandon your current run first');

    const level = levelFromXp(character.totalXp);
    const completedSet = new Set(await this.completed.completedIds(characterId));
    if (!isDungeonUnlocked(dungeonId, level, completedSet)) {
      throw new ForbiddenException('Dungeon locked (level or attunement)');
    }

    const snapshot = await this.rotation.buildCombatProfile(character, level);
    const seed = seedFromString(`dungeon-turn:${characterId}:${Date.now()}`);
    const state = startDungeonRun(snapshot, dungeonId, 1, level, seed);

    const run = await this.repo.createRun({
      characterId,
      dungeonId,
      playerSnapshot: snapshot,
      level,
      size: 1,
      state,
      status: state.status,
      encountersCleared: state.encountersCleared,
    });
    return this.toRunView(run, state);
  }

  /** Detail/aktuální stav runu. */
  async getRun(accountId: string, characterId: string, runId: string): Promise<DungeonTurnRunView> {
    await this.ownedOrThrow(accountId, characterId);
    const run = await this.ownedRunOrThrow(characterId, runId);
    return this.toRunView(run, run.state);
  }

  /** Jeden tah: hráč zvolí ability + cíl (index nepřítele). */
  async act(
    accountId: string,
    characterId: string,
    runId: string,
    abilityId: string,
    targetId: number,
  ): Promise<DungeonTurnRunView> {
    const character = await this.ownedOrThrow(accountId, characterId);
    const run = await this.ownedRunOrThrow(characterId, runId);
    if (run.status !== 'in_combat') throw new BadRequestException('Run already finished');
    if (!abilityId) throw new BadRequestException('Missing ability');

    const snapshot = run.playerSnapshot;
    const state = run.state;

    // Validace (server-authoritative anti-cheat): ability v kitu, ready, má zdroj.
    const ability = dungeonRunAbilities(snapshot).find((a) => a.id === abilityId);
    if (!ability) throw new BadRequestException('Unknown ability');
    if (!isDungeonAbilityReady(state, abilityId)) throw new BadRequestException('Ability on cooldown');
    if (!canCastDungeonAbility(state, ability)) throw new BadRequestException('Out of resources for that ability');

    const { state: next } = resolveDungeonTurn(snapshot, state, abilityId, Number(targetId) || 0);

    if (next.status === 'cleared') return this.finalize(run, next, character, true);
    if (next.status === 'dead') return this.finalize(run, next, character, false);

    await this.repo.updateState(run.id, next, next.status, next.encountersCleared);
    return this.toRunView({ ...run, state: next, status: next.status }, next);
  }

  /** Předčasné opuštění runu — žádná odměna (na rozdíl od Gauntlet retire). */
  async abandon(accountId: string, characterId: string, runId: string): Promise<DungeonTurnRunView> {
    const character = await this.ownedOrThrow(accountId, characterId);
    const run = await this.ownedRunOrThrow(characterId, runId);
    if (run.status !== 'in_combat') return this.toRunView(run, run.state);
    const next: DungeonRunState = { ...run.state, status: 'dead', enemies: [] };
    return this.finalize(run, next, character, false);
  }

  /** Nedávné tahové runy postavy. */
  async recentRuns(accountId: string, characterId: string): Promise<
    { runId: string; dungeonId: string; dungeonName: string; status: string; reward: RaidReward; createdAt: string }[]
  > {
    await this.ownedOrThrow(accountId, characterId);
    const rows = await this.repo.listRecent(characterId, RECENT_RUNS_LIMIT);
    return rows.map((r) => ({
      runId: r.id,
      dungeonId: r.dungeonId,
      dungeonName: DUNGEONS[r.dungeonId]?.name ?? r.dungeonId,
      status: r.status,
      reward: { xp: r.rewardXp, gold: r.rewardGold, items: r.rewardItems },
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ── Interní ────────────────────────────────────────────────────────────────

  /**
   * Ukončí run: při clearu udělí odměnu (computeGroupReward + weekly lockout +
   * reputace + loot), při smrti/abandonu nic. Sdílí odměnový model s auto-resolve.
   */
  private async finalize(
    run: DungeonTurnRun,
    state: DungeonRunState,
    character: Character,
    victory: boolean,
  ): Promise<DungeonTurnRunView> {
    let reward: RaidReward = { xp: 0, gold: 0, items: [] };
    let lockedOut = false;

    if (victory) {
      const rewardSeed = seedFromString(`${run.id}:${character.id}`);
      reward = computeGroupReward('dungeon', run.dungeonId, true, rewardSeed, 0);

      // Weekly lockout (M8.6): jen vyšší dungeony; první vítězný run v týdnu zamkne.
      const lockoutId = lockoutIdForContent('dungeon', run.dungeonId);
      if (lockoutId) {
        const acquired = await this.lockouts.acquire(character.id, lockoutId, weeklyLockoutId(Date.now()));
        if (!acquired) {
          reward = { xp: 0, gold: 0, items: [] };
          lockedOut = true;
        }
      }

      if (reward.xp > 0 || reward.gold > 0) await this.characters.addRewards(character.id, reward.xp, reward.gold);
      if (reward.items.length > 0) {
        await this.grant.grant(character.id, reward.items.map((itemId) => ({ itemId, quantity: 1 })));
      }
      if (!lockedOut) {
        const dungeon = DUNGEONS[run.dungeonId];
        if (dungeon) {
          await this.reputation.addStanding(
            character.id,
            GENERALIST_FACTION,
            dungeonReputationGain(dungeon.recommendedLevel),
          );
        }
      }
    }

    await this.repo.finalizeRun(run.id, state, state.status, state.encountersCleared, reward);

    try {
      const name = DUNGEONS[run.dungeonId]?.name ?? run.dungeonId;
      const itemNote = reward.items.length > 0 ? `, ${reward.items.length} item${reward.items.length === 1 ? '' : 's'}` : '';
      await this.history.record({
        characterId: character.id,
        kind: 'dungeon',
        title: `${name} (turn-based) ${victory ? 'cleared' : 'failed'}`,
        detail: victory
          ? lockedOut
            ? 'Already saved this week — no reward.'
            : `+${reward.xp} XP, +${reward.gold}g${itemNote}`
          : 'Fell in the dungeon.',
        outcome: victory ? 'victory' : 'defeat',
      });
    } catch {
      /* best-effort */
    }

    const finished: DungeonTurnRun = {
      ...run,
      state,
      status: state.status,
      encountersCleared: state.encountersCleared,
      rewardXp: reward.xp,
      rewardGold: reward.gold,
      rewardItems: reward.items,
    };
    return this.toRunView(finished, state, reward, lockedOut);
  }

  private abilityViews(snapshot: CombatActor, state: DungeonRunState): DungeonTurnAbilityView[] {
    return dungeonRunAbilities(snapshot).map((a) => {
      const remaining = state.player.cooldowns[a.id] ?? 0;
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
        outOfSlots: spellTier >= 1 && !hasSlotForTier(state.player.spellSlots ?? {}, spellTier),
        kiCost,
        outOfKi: kiCost > (state.player.kiPoints ?? Number.POSITIVE_INFINITY),
      };
    });
  }

  private toRunView(
    run: DungeonTurnRun,
    state: DungeonRunState,
    reward?: RaidReward,
    lockedOut = false,
  ): DungeonTurnRunView {
    const finishedReward =
      reward ??
      (state.status === 'cleared' || state.status === 'dead'
        ? { xp: run.rewardXp, gold: run.rewardGold, items: run.rewardItems }
        : null);
    return {
      runId: run.id,
      dungeonId: run.dungeonId,
      dungeonName: DUNGEONS[run.dungeonId]?.name ?? run.dungeonId,
      status: state.status,
      encounterIndex: state.encounterIndex,
      encounterCount: state.encounterCount,
      encountersCleared: state.encountersCleared,
      player: {
        name: run.playerSnapshot.name,
        maxHealth: state.player.maxHealth,
        currentHealth: Math.max(0, Math.round(state.player.currentHealth)),
        absorb: Math.round(state.player.absorb),
        mitigationTurns: state.player.mitigationTurns,
        spellSlots: state.player.spellSlots ?? {},
        maxSpellSlots: run.playerSnapshot.spellSlots ?? {},
        kiPoints: state.player.kiPoints ?? 0,
        maxKiPoints: run.playerSnapshot.kiPoints ?? 0,
        rageCharges: state.player.rageCharges ?? 0,
        maxRageCharges: run.playerSnapshot.rageCharges ?? 0,
        raging: state.player.raging ?? false,
      },
      enemies: state.enemies.map((e) => ({
        idx: e.idx,
        name: e.name,
        isBoss: e.isBoss,
        maxHealth: e.maxHealth,
        currentHealth: Math.max(0, Math.round(e.currentHealth)),
      })),
      abilities: this.abilityViews(run.playerSnapshot, state),
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

  private async ownedRunOrThrow(characterId: string, runId: string): Promise<DungeonTurnRun> {
    const run = await this.repo.findRun(runId);
    if (!run || run.characterId !== characterId) throw new NotFoundException('Dungeon run not found');
    return run;
  }
}
