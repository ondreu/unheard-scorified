import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  applyGauntletDraft,
  capGauntletReward,
  CLASSES,
  dailyPeriodId,
  gauntletAbilities,
  gauntletDailyGoldCap,
  gauntletDailyXpCap,
  gauntletRunReward,
  isGauntletAbilityReady,
  levelFromXp,
  resolveGauntletTurn,
  rollGauntletDraft,
  SeededRng,
  seedFromString,
  startGauntletRun,
  ITEMS,
  canEquipArmor,
  type ClassId,
  type CombatActor,
  type CombatEvent,
  type GauntletDraftOption,
  type GauntletReward,
  type GauntletRunState,
  type GauntletStatComparison,
  type ItemDef,
  type ItemStats,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryGrantService } from '../inventory/inventory-grant.service';
import { RotationService } from '../rotation/rotation.service';
import { HistoryRepository } from '../history/history.repository';
import type { Character, GauntletRun } from '../db/schema';
import { GauntletRepository } from './gauntlet.repository';

const RECENT_RUNS_LIMIT = 8;

export interface GauntletAbilityView {
  id: string;
  name: string;
  description: string;
  kind: string;
  cooldownSec: number;
  cooldownRemaining: number;
  ready: boolean;
}

export interface GauntletDailyView {
  xpEarned: number;
  xpCap: number;
  goldEarned: number;
  goldCap: number;
}

export interface GauntletRunView {
  runId: string;
  status: GauntletRunState['status'];
  wave: number;
  wavesCleared: number;
  player: {
    name: string;
    maxHealth: number;
    currentHealth: number;
    absorb: number;
    mitigationTurns: number;
  };
  enemy: { name: string; isElite: boolean; maxHealth: number; currentHealth: number } | null;
  abilities: GauntletAbilityView[];
  events: CombatEvent[];
  draft: GauntletDraftOption[] | null;
  /** Vyplněné až po ukončení runu (smrt/retire/dokončení). */
  reward: GauntletReward | null;
  daily: GauntletDailyView;
}

export interface GauntletStatusView {
  level: number;
  activeRunId: string | null;
  bestWave: number;
  daily: GauntletDailyView;
}

/**
 * The Gauntlet (M13) — aktivní tahová survival aréna. Recykluje bojový profil
 * postavy (`RotationService.buildCombatProfile`) i sdílený engine
 * (`@game/shared/gauntlet`). Run je stateful (uložen v DB); klient posílá jen
 * volbu ability/draftu, server dopočítá vše deterministicky (anti-cheat).
 * Odměny jsou drobné a omezené denním stropem (idle jádro zůstává hlavní progrese).
 */
@Injectable()
export class GauntletService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly inventory: InventoryService,
    private readonly grant: InventoryGrantService,
    private readonly rotation: RotationService,
    private readonly history: HistoryRepository,
    private readonly repo: GauntletRepository,
  ) {}

  /** Přehled minihry: aktivní run, nejlepší skóre, denní progres stropu. */
  async getStatus(accountId: string, characterId: string): Promise<GauntletStatusView> {
    const character = await this.ownedOrThrow(accountId, characterId);
    const level = levelFromXp(character.totalXp);
    const active = await this.repo.findActiveForCharacter(characterId);
    return {
      level,
      activeRunId: active?.id ?? null,
      bestWave: await this.repo.bestWave(characterId),
      daily: await this.dailyView(characterId, level),
    };
  }

  /** Vstup do Gauntletu — snapshot profilu + první vlna. */
  async enter(accountId: string, characterId: string): Promise<GauntletRunView> {
    const character = await this.ownedOrThrow(accountId, characterId);

    const existing = await this.repo.findActiveForCharacter(characterId);
    if (existing) {
      throw new BadRequestException('Finish or retire your current run first');
    }

    const level = levelFromXp(character.totalXp);
    const snapshot = await this.rotation.buildCombatProfile(character, level);
    const seed = seedFromString(`gauntlet:${characterId}:${Date.now()}`);
    const state = startGauntletRun(snapshot, level, seed);

    const run = await this.repo.createRun({
      characterId,
      playerSnapshot: snapshot,
      level,
      state,
      status: state.status,
      wavesCleared: state.wavesCleared,
    });
    return this.toRunView(run, state, character);
  }

  /** Detail/aktuální stav runu. */
  async getRun(accountId: string, characterId: string, runId: string): Promise<GauntletRunView> {
    const character = await this.ownedOrThrow(accountId, characterId);
    const run = await this.ownedRunOrThrow(characterId, runId);
    return this.toRunView(run, run.state, character);
  }

  /** Jeden tah: hráč zvolí ability. */
  async act(
    accountId: string,
    characterId: string,
    runId: string,
    abilityId: string,
  ): Promise<GauntletRunView> {
    const character = await this.ownedOrThrow(accountId, characterId);
    const run = await this.ownedRunOrThrow(characterId, runId);
    if (run.status !== 'in_combat') {
      throw new BadRequestException('No active fight — the run is drafting or finished');
    }
    if (!abilityId) throw new BadRequestException('Missing ability');

    const snapshot = run.playerSnapshot;
    const state = run.state;

    // Validace: ability musí být v kitu a ready (server-authoritative anti-cheat).
    const kit = gauntletAbilities(snapshot, state.picks);
    if (!kit.some((a) => a.id === abilityId)) throw new BadRequestException('Unknown ability');
    if (!isGauntletAbilityReady(state, abilityId)) throw new BadRequestException('Ability on cooldown');

    const { state: next } = resolveGauntletTurn(snapshot, state, abilityId);

    if (next.status === 'drafting' && !next.draft) {
      next.draft = await this.buildDraft(snapshot, next, character);
    }

    if (next.status === 'dead') {
      return this.finalize(run, next, character, 'defeat');
    }

    await this.repo.updateState(run.id, next, next.status, next.wavesCleared);
    return this.toRunView({ ...run, state: next, status: next.status }, next, character);
  }

  /** Výběr draftu mezi vlnami. */
  async draft(
    accountId: string,
    characterId: string,
    runId: string,
    optionId: string,
  ): Promise<GauntletRunView> {
    const character = await this.ownedOrThrow(accountId, characterId);
    const run = await this.ownedRunOrThrow(characterId, runId);
    if (run.status !== 'drafting' || !run.state.draft) {
      throw new BadRequestException('No reward to choose right now');
    }
    if (!run.state.draft.some((o) => o.id === optionId)) {
      throw new BadRequestException('Unknown reward option');
    }

    const snapshot = run.playerSnapshot;
    const next = applyGauntletDraft(snapshot, run.state, optionId, run.level);

    if (next.status === 'retired') {
      // Dosažen strop vln → run dokončen jako vítězství.
      return this.finalize(run, next, character, 'victory');
    }

    await this.repo.updateState(run.id, next, next.status, next.wavesCleared);
    return this.toRunView({ ...run, state: next, status: next.status }, next, character);
  }

  /** Předčasné ukončení runu — zinkasuje odměnu za dosavadní vlny. */
  async retire(accountId: string, characterId: string, runId: string): Promise<GauntletRunView> {
    const character = await this.ownedOrThrow(accountId, characterId);
    const run = await this.ownedRunOrThrow(characterId, runId);

    const next: GauntletRunState = { ...run.state, status: 'retired', enemy: null, draft: null };
    return this.finalize(run, next, character, 'victory');
  }

  /** Nedávné runy postavy. */
  async recentRuns(accountId: string, characterId: string): Promise<
    { runId: string; wavesCleared: number; status: string; reward: GauntletReward; createdAt: string }[]
  > {
    await this.ownedOrThrow(accountId, characterId);
    const rows = await this.repo.listRecent(characterId, RECENT_RUNS_LIMIT);
    return rows.map((r) => ({
      runId: r.id,
      wavesCleared: r.wavesCleared,
      status: r.status,
      reward: { xp: r.rewardXp, gold: r.rewardGold, items: r.rewardItems },
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ── Interní ────────────────────────────────────────────────────────────────

  /** Ukončí run: spočítá odměnu (s denním stropem), udělí ji a zapíše historii. */
  private async finalize(
    run: GauntletRun,
    state: GauntletRunState,
    character: Character,
    outcome: 'victory' | 'defeat',
  ): Promise<GauntletRunView> {
    const dayId = dailyPeriodId(Date.now());
    const earned = await this.repo.getDaily(character.id, dayId);
    const rewardRng = new SeededRng(seedFromString(`${run.id}:reward`));
    const raw = gauntletRunReward(state.wavesCleared, run.level, rewardRng);
    const reward = capGauntletReward(raw, run.level, earned.xpEarned, earned.goldEarned);

    if (reward.xp > 0 || reward.gold > 0) {
      await this.characters.addRewards(character.id, reward.xp, reward.gold);
      await this.repo.addDaily(character.id, dayId, reward.xp, reward.gold);
    }
    if (reward.items.length > 0) {
      await this.grant.grant(
        character.id,
        reward.items.map((itemId) => ({ itemId, quantity: 1 })),
      );
    }

    await this.repo.finalizeRun(run.id, state, state.status, state.wavesCleared, reward);

    try {
      const itemNote = reward.items.length > 0 ? `, ${reward.items.length} materials` : '';
      await this.history.record({
        characterId: character.id,
        kind: 'gauntlet',
        title: `The Gauntlet — ${state.wavesCleared} wave${state.wavesCleared === 1 ? '' : 's'} cleared`,
        detail:
          reward.xp > 0 || reward.gold > 0
            ? `+${reward.xp} XP, +${reward.gold}g${itemNote}`
            : 'Daily reward cap reached — no reward.',
        outcome,
      });
    } catch {
      /* best-effort */
    }

    const finished: GauntletRun = {
      ...run,
      state,
      status: state.status,
      wavesCleared: state.wavesCleared,
      rewardXp: reward.xp,
      rewardGold: reward.gold,
      rewardItems: reward.items,
    };
    return this.toRunView(finished, state, character, reward);
  }

  /** Složí draft nabídku: gear (z reálných itemů) + buff + ability (engine). */
  private async buildDraft(
    snapshot: CombatActor,
    state: GauntletRunState,
    character: Character,
  ): Promise<GauntletDraftOption[]> {
    const rng = new SeededRng(seedFromString(`${state.seed}:draft:${state.wave}`));
    const gearOption = await this.rollGearOption(character, rng);
    return rollGauntletDraft(snapshot, state, rng, gearOption);
  }

  /**
   * Vybere nabídku kusu gearu z katalogu (blízko levelu, nositelný classou) a
   * sestaví porovnání se stávajícím kusem v daném slotu. Pick = run-scoped bonus
   * staty (žádné reálné equipnutí → bez persistence/power-creepu).
   */
  private async rollGearOption(
    character: Character,
    rng: SeededRng,
  ): Promise<GauntletDraftOption | null> {
    const klass = character.class as ClassId;
    const level = levelFromXp(character.totalXp);
    const equippable = Object.values(ITEMS).filter(
      (it) => it.slot !== 'bag' && canEquipArmor(klass, it.id),
    );
    const nearLevel = equippable.filter((it) => Math.abs(it.itemLevel - level) <= 14);
    const pool = nearLevel.length > 0 ? nearLevel : equippable;
    if (pool.length === 0) return null;

    const item = pool[rng.int(0, pool.length - 1)]!;
    const equipped = await this.equippedInItemSlot(character, item.slot);
    const delta = this.itemCombatDelta(item, klass);

    return {
      id: `gear:${item.id}`,
      kind: 'gear',
      name: item.name,
      description: `${item.rarity} ${item.slot.replace('_', ' ')} — adds its stats for this run.`,
      comparison: this.statComparison(equipped, item),
      pick: {
        kind: 'gear',
        id: item.id,
        label: item.name,
        bonusAttackPower: delta.attackPower,
        bonusMaxHealth: delta.maxHealth,
        bonusCritChance: delta.critChance,
        bonusArmor: delta.armor,
      },
    };
  }

  /** Najde equipnutý item téhož `ItemSlotType` (pro porovnání v gear draftu). */
  private async equippedInItemSlot(character: Character, slotType: string): Promise<ItemDef | null> {
    const view = await this.inventory.listEquipment(character.accountId, character.id);
    const match = view.equipped.find((e) => e.item.slot === slotType);
    return match?.item ?? null;
  }

  /**
   * Combat delta itemu pro gauntlet gear draft (ADR 0032). Po přechodu na literal
   * D&D magnitudy škáluje hráčův útok přes **modifikátor** primárního atributu
   * (`floor((score−10)/2)`, tady aproximováno přírůstkem `floor(primary/2)` na item
   * statu) + weapon/spell power, a HP přes CON modifikátor za level (aproximace ~6
   * HP/CON-mod-per-level bez znalosti levelu zde). Heuristika pro porovnání draftu —
   * nemusí přesně zrcadlit `deriveCombatProfile`, jen být ve správné (D&D) škále.
   */
  private itemCombatDelta(
    item: ItemDef,
    klass: ClassId,
  ): { attackPower: number; maxHealth: number; critChance: number; armor: number } {
    const s: ItemStats = item.stats;
    const primaryStat = CLASSES[klass].primaryStat;
    const primaryMod = Math.floor((s[primaryStat] ?? 0) / 2);
    const conMod = Math.floor((s.constitution ?? 0) / 2);
    const weaponPower = (s.attack_power ?? 0) + (s.spell_power ?? 0);
    return {
      attackPower: Math.round(primaryMod + weaponPower),
      maxHealth: Math.round(conMod * 6),
      critChance: (s.crit_rating ?? 0) * 0.002,
      armor: s.armor ?? 0,
    };
  }

  /** Porovnání hlavních statů (current vs offered) pro gear draft. */
  private statComparison(current: ItemDef | null, offered: ItemDef): GauntletStatComparison[] {
    const keys = new Set<keyof ItemStats>();
    for (const k of Object.keys(offered.stats) as (keyof ItemStats)[]) keys.add(k);
    if (current) for (const k of Object.keys(current.stats) as (keyof ItemStats)[]) keys.add(k);
    const label: Record<string, string> = {
      strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT',
      wisdom: 'WIS', charisma: 'CHA', armor: 'Armor', attack_power: 'Attack Power',
      spell_power: 'Spell Power', crit_rating: 'Crit', dodge_rating: 'Dodge',
    };
    return [...keys].map((k) => ({
      label: label[k] ?? k,
      current: current?.stats[k] ?? 0,
      offered: offered.stats[k] ?? 0,
    }));
  }

  private async dailyView(characterId: string, level: number): Promise<GauntletDailyView> {
    const earned = await this.repo.getDaily(characterId, dailyPeriodId(Date.now()));
    return {
      xpEarned: earned.xpEarned,
      xpCap: gauntletDailyXpCap(level),
      goldEarned: earned.goldEarned,
      goldCap: gauntletDailyGoldCap(level),
    };
  }

  private abilityViews(
    snapshot: CombatActor,
    state: GauntletRunState,
  ): GauntletAbilityView[] {
    return gauntletAbilities(snapshot, state.picks).map((a) => {
      const remaining = state.player.cooldowns[a.id] ?? 0;
      return {
        id: a.id,
        name: a.name,
        description: a.description ?? '',
        kind: a.kind,
        cooldownSec: a.cooldownSec,
        cooldownRemaining: remaining,
        ready: remaining <= 0,
      };
    });
  }

  private async toRunView(
    run: GauntletRun,
    state: GauntletRunState,
    character: Character,
    reward?: GauntletReward,
  ): Promise<GauntletRunView> {
    const finishedReward =
      reward ??
      (state.status === 'dead' || state.status === 'retired'
        ? { xp: run.rewardXp, gold: run.rewardGold, items: run.rewardItems }
        : null);
    return {
      runId: run.id,
      status: state.status,
      wave: state.wave,
      wavesCleared: state.wavesCleared,
      player: {
        name: run.playerSnapshot.name,
        maxHealth: state.player.maxHealth,
        currentHealth: Math.max(0, Math.round(state.player.currentHealth)),
        absorb: Math.round(state.player.absorb),
        mitigationTurns: state.player.mitigationTurns,
      },
      enemy: state.enemy
        ? {
            name: state.enemy.name,
            isElite: state.enemy.isElite,
            maxHealth: state.enemy.maxHealth,
            currentHealth: Math.max(0, Math.round(state.enemy.currentHealth)),
          }
        : null,
      abilities: this.abilityViews(run.playerSnapshot, state),
      events: state.log,
      draft: state.draft,
      reward: finishedReward,
      daily: await this.dailyView(character.id, run.level),
    };
  }

  private async ownedOrThrow(accountId: string, characterId: string): Promise<Character> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    return character;
  }

  private async ownedRunOrThrow(characterId: string, runId: string): Promise<GauntletRun> {
    const run = await this.repo.findRun(runId);
    if (!run || run.characterId !== characterId) throw new NotFoundException('Gauntlet run not found');
    return run;
  }
}
