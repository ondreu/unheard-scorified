import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  canCastDungeonAbility,
  dungeonRunAbilities,
  hasSlotForTier,
  isDuelableEnemy,
  isDungeonAbilityReady,
  isEndTurnAction,
  isValidCastTier,
  levelFromXp,
  resolveDungeonTurn,
  seedFromString,
  startDuelRun,
  type ActiveCondition,
  type CombatActor,
  type CombatEvent,
  type DungeonRunState,
  type DungeonRunStatus,
  type SpellSlots,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { RotationService } from '../rotation/rotation.service';
import type { Character, DuelRun } from '../db/schema';
import { DuelRepository } from './duel.repository';

/** Ability v duel UI (mirror tahového dungeonu — stejná pravidla cooldown/slot/Ki). */
export interface DuelAbilityView {
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
  actionCost: 'action' | 'bonus';
  upcastPerSlot: number;
}

export interface DuelEnemyView {
  idx: number;
  name: string;
  isBoss: boolean;
  maxHealth: number;
  currentHealth: number;
  conditions: ActiveCondition[];
}

export interface DuelRunView {
  runId: string;
  templateId: string;
  enemyName: string;
  status: DungeonRunStatus;
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
    conditions: ActiveCondition[];
  };
  enemies: DuelEnemyView[];
  abilities: DuelAbilityView[];
  events: CombatEvent[];
  /** Po skončení: vyhrál hráč? `null` dokud běží. */
  victory: boolean | null;
}

/**
 * Tahový duel (Duel v bestiáři, Slice 2) — interaktivní **testovací** souboj
 * postavy proti jednomu katalogovému nepříteli. Sdílí engine s tahovým dungeonem
 * (`startDuelRun` / `resolveDungeonTurn`), ale **bez jakýchkoli odměn** (žádné XP
 * / loot / kill counter / lockout). Stateful (uloženo v DB); klient posílá jen
 * volbu (ability + cíl), server tah dopočítá deterministicky (anti-cheat).
 */
@Injectable()
export class DuelService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly rotation: RotationService,
    private readonly repo: DuelRepository,
  ) {}

  /** Vstup do tahového duelu (objevený nepřítel) — snapshot profilu + 1 encounter. */
  async enter(accountId: string, characterId: string, templateId: string): Promise<DuelRunView> {
    const character = await this.ownedOrThrow(accountId, characterId);
    if (!isDuelableEnemy(templateId)) throw new BadRequestException('Unknown enemy');

    const existing = await this.repo.findActiveForCharacter(characterId);
    if (existing) throw new BadRequestException('Finish or abandon your current duel first');

    const level = levelFromXp(character.totalXp);
    const snapshot = await this.rotation.buildCombatProfile(character, level);
    const seed = seedFromString(`duel-turn:${characterId}:${templateId}:${Date.now()}`);
    const state = startDuelRun(snapshot, templateId, level, seed);

    const run = await this.repo.createRun({
      characterId,
      templateId,
      playerSnapshot: snapshot,
      level,
      state,
      status: state.status,
    });
    return this.toRunView(run, state);
  }

  /** Aktuální stav duelu. */
  async getRun(accountId: string, characterId: string, runId: string): Promise<DuelRunView> {
    await this.ownedOrThrow(accountId, characterId);
    const run = await this.ownedRunOrThrow(characterId, runId);
    return this.toRunView(run, run.state);
  }

  /** Jeden tah: hráč zvolí ability + cíl (index nepřítele). Žádné odměny při clearu. */
  async act(
    accountId: string,
    characterId: string,
    runId: string,
    abilityId: string,
    targetId: number,
    bonusAbilityId?: string,
    castTier?: number,
  ): Promise<DuelRunView> {
    await this.ownedOrThrow(accountId, characterId);
    const run = await this.ownedRunOrThrow(characterId, runId);
    if (run.status !== 'in_combat') throw new BadRequestException('Duel already finished');
    if (!abilityId) throw new BadRequestException('Missing ability');

    const snapshot = run.playerSnapshot;
    const state = run.state;

    // Validace (server-authoritative anti-cheat) — sdílená s tahovým dungeonem.
    if (!isEndTurnAction(abilityId)) {
      const ability = dungeonRunAbilities(snapshot).find((a) => a.id === abilityId);
      if (!ability) throw new BadRequestException('Unknown ability');
      if (!isDungeonAbilityReady(state, abilityId)) throw new BadRequestException('Ability on cooldown');
      if (!canCastDungeonAbility(state, ability)) throw new BadRequestException('Out of resources for that ability');
      if (castTier != null && !isValidCastTier(state.player.spellSlots ?? {}, ability.spellTier ?? 0, castTier)) {
        throw new BadRequestException('Invalid spell slot tier');
      }
    }
    if (bonusAbilityId) {
      const bonus = dungeonRunAbilities(snapshot).find((a) => a.id === bonusAbilityId);
      if (!bonus || bonus.actionCost !== 'bonus') throw new BadRequestException('Not a bonus action');
      if (bonusAbilityId === abilityId) throw new BadRequestException('Bonus action must differ from your action');
      if (!isDungeonAbilityReady(state, bonusAbilityId)) throw new BadRequestException('Bonus action on cooldown');
      if (!canCastDungeonAbility(state, bonus)) throw new BadRequestException('Out of resources for that bonus action');
    }

    const { state: next } = resolveDungeonTurn(snapshot, state, abilityId, Number(targetId) || 0, bonusAbilityId, castTier);

    if (next.status === 'in_combat') {
      await this.repo.updateState(run.id, next, next.status);
    } else {
      // Konec duelu — žádné odměny, jen uzavřít run.
      await this.repo.finalizeRun(run.id, next, next.status);
    }
    return this.toRunView({ ...run, state: next, status: next.status }, next);
  }

  /** Předčasné opuštění duelu — žádná odměna (jako abandon dungeonu). */
  async abandon(accountId: string, characterId: string, runId: string): Promise<DuelRunView> {
    await this.ownedOrThrow(accountId, characterId);
    const run = await this.ownedRunOrThrow(characterId, runId);
    if (run.status !== 'in_combat') return this.toRunView(run, run.state);
    const next: DungeonRunState = { ...run.state, status: 'dead', enemies: [] };
    await this.repo.finalizeRun(run.id, next, next.status);
    return this.toRunView({ ...run, state: next, status: next.status }, next);
  }

  // ── Interní ────────────────────────────────────────────────────────────────

  private abilityViews(snapshot: CombatActor, state: DungeonRunState): DuelAbilityView[] {
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
        actionCost: a.actionCost ?? 'action',
        upcastPerSlot: a.dicePerSlotAbove ?? 0,
      };
    });
  }

  private toRunView(run: DuelRun, state: DungeonRunState): DuelRunView {
    return {
      runId: run.id,
      templateId: run.templateId,
      enemyName: state.label ?? run.templateId,
      status: state.status,
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
        conditions: state.player.conditions ?? [],
      },
      enemies: state.enemies.map((e) => ({
        idx: e.idx,
        name: e.name,
        isBoss: e.isBoss,
        maxHealth: e.maxHealth,
        currentHealth: Math.max(0, Math.round(e.currentHealth)),
        conditions: e.conditions ?? [],
      })),
      abilities: this.abilityViews(run.playerSnapshot, state),
      events: state.log,
      victory: state.status === 'in_combat' ? null : state.status === 'cleared',
    };
  }

  private async ownedOrThrow(accountId: string, characterId: string): Promise<Character> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    return character;
  }

  private async ownedRunOrThrow(characterId: string, runId: string): Promise<DuelRun> {
    const run = await this.repo.findRun(runId);
    if (!run || run.characterId !== characterId) throw new NotFoundException('Duel not found');
    return run;
  }
}
