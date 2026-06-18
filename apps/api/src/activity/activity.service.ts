import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  activityProgress,
  activitySeed,
  activitySlotCost,
  applyMountSpeed,
  applyXpGain,
  buildCharacterSheet,
  computeActivityReward,
  longRest,
  spellSlotsFor,
  spendHighestSlots,
  FACTIONS,
  GATHERING_NODES,
  GRIND,
  isQuestAvailable,
  isQuestId,
  GENERALIST_FACTION,
  levelFromXp,
  questReputationGain,
  mountSpeedBonus,
  professionReputationGains,
  professionSkillUp,
  PROFESSIONS,
  QUESTS,
  questingZoneForLevel,
  RECIPES,
  reputationProgress,
  simulateGrindRun,
  simulateQuestRun,
  ZONES,
  type ActivityReward,
  type ActivityState,
  type CharacterSheet,
  type CraftActivityParams,
  type FactionId,
  type GatherActivityParams,
  type GrindActivityParams,
  type ProfessionId,
  type QuestActivityParams,
  type QuestStepResult,
  type RepTier,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryGrantService } from '../inventory/inventory-grant.service';
import { CompletedQuestRepository } from '../quest/quest.repository';
import { ProfessionRepository, ReputationRepository } from '../profession/profession.repository';
import { MountRepository } from '../mount/mount.repository';
import { RotationService } from '../rotation/rotation.service';
import { HistoryRepository } from '../history/history.repository';
import type { Character, CharacterActivity } from '../db/schema';
import { ActivityRepository } from './activity.repository';
import { ACTIVITY_SCHEDULER, type ActivityScheduler } from './activity.scheduler';

export interface ActivityView {
  id: string;
  activityType: string;
  /** Zobrazovaný název aktivity. */
  title: string;
  startAt: string;
  durationSec: number;
  /** Vyplněno jen pro `activityType === 'quest'`. */
  questId?: string;
  quest?: { id: string; name: string; zoneId: string; kind: string };
  progress: {
    elapsedSec: number;
    remainingSec: number;
    progress: number;
    completed: boolean;
    finishesAt: string;
  };
}

export interface CharacterStateView {
  id: string;
  name: string;
  race: string;
  class: string;
  faction: string;
  gold: number;
  sheet: CharacterSheet;
}

/** Profession skill-up z dokončeného gather/craft běhu (M6). */
export interface ProfessionGainView {
  id: ProfessionId;
  name: string;
  skillBefore: number;
  skillAfter: number;
}

/** Reputační zisk z dokončeného profession běhu (M6). */
export interface ReputationGainView {
  factionId: FactionId;
  name: string;
  gained: number;
  standing: number;
  tier: RepTier;
  tierName: string;
}

export interface ClaimResult {
  reward: ActivityReward;
  levelBefore: number;
  levelAfter: number;
  leveledUp: boolean;
  levelsGained: number;
  character: CharacterStateView;
  /** Počet sekund, po které aktivita čekala na claim (offline progres). 0 = okamžitý claim. */
  offlineDurationSec: number;
  /** Itemy přidané do inventáře při claimu. */
  items: string[];
  /** Profession skill-up (jen u gather/craft). */
  profession?: ProfessionGainView;
  /** Reputační zisky (profese u gather/craft + Explorers' Guild u quest/grind). */
  reputation?: ReputationGainView[];
  /**
   * Příběhový log questu (M9): narativní beaty + auto-resolved combaty, generované
   * deterministicky ze seedu aktivity. Jen u `quest` aktivit; flavor nad odměnami.
   */
  questLog?: QuestStepResult[];
  /**
   * Combat-objective quest (M12) prohrán: postava padla v souboji → žádná odměna
   * (reward = 0), quest se nedokončil a lze ho opakovat. `false`/nedefinováno =
   * běžný úspěšný claim. Viz `QuestDef.combatObjective`.
   */
  questFailed?: boolean;
}

export interface StartActivityInput {
  activityType: string;
  /** Jen pro `activityType === 'quest'`. */
  questId?: string;
  /** Jen pro `activityType === 'grind'` (Gone Questing) — hráčem volená délka (s). */
  durationSec?: number;
}

@Injectable()
export class ActivityService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly activities: ActivityRepository,
    private readonly completed: CompletedQuestRepository,
    private readonly inventoryRepo: InventoryRepository,
    private readonly grant: InventoryGrantService,
    private readonly professionRepo: ProfessionRepository,
    private readonly reputationRepo: ReputationRepository,
    private readonly mounts: MountRepository,
    private readonly rotation: RotationService,
    private readonly history: HistoryRepository,
    @Inject(ACTIVITY_SCHEDULER) private readonly scheduler: ActivityScheduler,
  ) {}

  /** Pošle postavu na aktivitu (zatím jen 'quest'). */
  async start(
    accountId: string,
    characterId: string,
    input: StartActivityInput,
  ): Promise<ActivityView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const existing = await this.activities.findByCharacter(characterId);
    if (existing) throw new ConflictException('Character already has an active activity');

    // Gone Questing (generický grind): hráč volí jen délku; level flexuje s ním,
    // zóna (loot bracket + flavor) se auto-odvodí z levelu + frakce.
    if (input.activityType === 'grind') {
      return this.startQuesting(character, input.durationSec);
    }

    if (input.activityType !== 'quest') {
      throw new BadRequestException('Unsupported activity type');
    }
    if (input.questId === undefined || !isQuestId(input.questId)) {
      throw new BadRequestException('Unknown quest');
    }

    const quest = QUESTS[input.questId]!;
    const level = levelFromXp(character.totalXp);
    const completedIds = await this.completed.completedIds(characterId);
    if (!isQuestAvailable(quest, level, completedIds, character.faction)) {
      throw new BadRequestException('Quest is not available for this character');
    }

    const startAt = new Date();
    const seed = activitySeed(characterId, quest.id, startAt.getTime());
    // Mount speed (M10+): questing je pohybová aktivita → zkracuje se durationSec.
    const ownedMounts = await this.mounts.ownedIds(characterId);
    const durationSec = applyMountSpeed(quest.durationSec, mountSpeedBonus(ownedMounts));
    const row = await this.activities.create({
      characterId,
      activityType: 'quest',
      params: { questId: quest.id },
      startAt,
      durationSec,
      seed,
    });

    await this.scheduler.schedule(row.id, characterId, durationSec * 1000);
    await this.spendActivitySlots(character, level, durationSec);
    return this.toActivityView(row, Date.now());
  }

  /**
   * MR-4: aktivita při startu spotřebuje spell sloty (caster sešle nejlepší
   * dostupná kouzla). Non-caster nemá sloty → no-op. Long Rest při claimu je
   * dobije zpět. Best-effort: případné selhání zápisu nesmí shodit start.
   */
  private async spendActivitySlots(
    character: Character,
    level: number,
    durationSec: number,
  ): Promise<void> {
    const cost = activitySlotCost(durationSec);
    if (cost <= 0) return;
    const max = spellSlotsFor(character.class, level);
    const spent = spendHighestSlots(max, character.spentSpellSlots ?? {}, cost);
    await this.characters.setSpentSpellSlots(character.id, spent);
  }

  /**
   * Spustí "Gone Questing" (generický grind). Caller už ověřil vlastnictví a
   * absenci běžící aktivity. Level je snapshot aktuálního levelu (flexuje s
   * hráčem), zóna se auto-odvodí z levelu + frakce; délku volí hráč v mezích
   * `GRIND.minSec..maxSec` (clamp). Žádný mount speed — délku si hráč zvolil sám.
   */
  private async startQuesting(character: Character, durationSecInput?: number): Promise<ActivityView> {
    const requested = Number(durationSecInput);
    if (!Number.isFinite(requested) || requested <= 0) {
      throw new BadRequestException('Invalid questing duration');
    }
    const durationSec = Math.round(Math.max(GRIND.minSec, Math.min(GRIND.maxSec, requested)));

    const level = levelFromXp(character.totalXp);
    const zoneId = questingZoneForLevel(character.faction, level);
    const startAt = new Date();
    const seed = activitySeed(character.id, 'grind', startAt.getTime());
    const params: GrindActivityParams = { zoneId, level };
    const row = await this.activities.create({
      characterId: character.id,
      activityType: 'grind',
      params,
      startAt,
      durationSec,
      seed,
    });

    await this.scheduler.schedule(row.id, character.id, durationSec * 1000);
    await this.spendActivitySlots(character, level, durationSec);
    return this.toActivityView(row, Date.now());
  }

  /** Aktuální běžící aktivita postavy (s lazy dopočtem průběhu), nebo null. */
  async getCurrent(accountId: string, characterId: string): Promise<ActivityView | null> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const row = await this.activities.findByCharacter(characterId);
    return row ? this.toActivityView(row, Date.now()) : null;
  }

  /**
   * Vybere odměny z dokončené aktivity: deterministicky dopočítá XP/zlato,
   * připíše je postavě, story quest označí za dokončený a aktivitu odstraní.
   */
  async claim(accountId: string, characterId: string): Promise<ClaimResult> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const row = await this.activities.findByCharacter(characterId);
    if (!row) throw new BadRequestException('No active activity');

    const claimAt = Date.now();
    const state = toActivityState(row);
    let reward = computeActivityReward(state, claimAt);
    if (!reward) throw new BadRequestException('Activity has not finished yet');

    const finishesAt = state.startAt + state.durationSec * 1000;
    const offlineDurationSec = Math.max(0, Math.floor((claimAt - finishesAt) / 1000));

    // Quest narrative log (M9): deterministicky ze seedu aktivity. Combat kroky
    // používají snapshot bojového profilu (gear/talenty/rotace) → silnější postava
    // = čistší boj. Vyhodnotí se PŘED připsáním odměn, protože combat-objective
    // questy (M12) lze prohrát → reward gating (žádné XP/zlato/loot, quest nedokončen).
    const levelBefore = levelFromXp(character.totalXp);
    let questLog: QuestStepResult[] | undefined;
    let questFailed = false;
    if (row.activityType === 'quest') {
      const questId = (row.params as QuestActivityParams).questId;
      const quest = QUESTS[questId];
      if (quest) {
        const profile = await this.rotation.buildCombatProfile(character, levelBefore);
        const run = simulateQuestRun(quest, profile, state.seed);
        questLog = run.steps;
        if (quest.combatObjective && !run.success) {
          // Prohra: nulová odměna, quest se nedokončí (lze opakovat se silnějším buildem).
          questFailed = true;
          reward = { xp: 0, gold: 0, items: [] };
        } else if (quest.kind === 'story') {
          await this.completed.markCompleted(characterId, questId);
        }
      }
    } else if (row.activityType === 'grind') {
      // Gone Questing: generický flavor log (úvod + auto-resolved souboje + závěr).
      const profile = await this.rotation.buildCombatProfile(character, levelBefore);
      questLog = simulateGrindRun(
        row.params as GrindActivityParams,
        profile,
        row.durationSec,
        state.seed,
      ).steps;
    }

    const gain = applyXpGain(character.totalXp, reward.xp);
    const updated = await this.characters.addRewards(character.id, reward.xp, reward.gold);

    // Long Rest (MR-4): návrat z aktivity plně dobije spell sloty (reset spent).
    await this.characters.setSpentSpellSlots(character.id, longRest());

    // Přidá loot/materiály/output do inventáře (přebytek nad kapacitu → pošta).
    const grantedItems: string[] = [...reward.items];
    await this.grant.grant(
      characterId,
      reward.items.map((itemId) => ({ itemId, quantity: 1 })),
    );

    // Profese (M6): skill-up + reputace u gather/craft běhů.
    const professionRewards = await this.applyProfessionRewards(row);

    // Reputace z běžného hraní (M9 retrofit): dokončený quest i Gone Questing
    // dávají standing Explorers' Guild (generalisté „odměňují veškerou poctivou
    // práci"). Jen při úspěšném claimu — combat-objective prohra nedává nic.
    const reputation: ReputationGainView[] = [...(professionRewards.reputation ?? [])];
    if ((row.activityType === 'quest' || row.activityType === 'grind') && !questFailed) {
      reputation.push(await this.grantAdventuringReputation(characterId, levelBefore));
    }

    // Persistentní historie (best-effort — selhání zápisu nesmí shodit claim).
    const itemNote =
      grantedItems.length > 0
        ? `, ${grantedItems.length} item${grantedItems.length === 1 ? '' : 's'}`
        : '';
    try {
      await this.history.record({
        characterId,
        kind: row.activityType,
        title: this.toActivityView(row, claimAt).title,
        detail: questFailed
          ? 'Defeated — no reward earned'
          : `+${reward.xp} XP, +${reward.gold}g${itemNote}${gain.leveledUp ? ` · Level ${gain.levelAfter}!` : ''}`,
        outcome: questFailed ? 'defeat' : null,
      });
    } catch {
      /* best-effort */
    }

    await this.activities.deleteById(row.id);
    await this.scheduler.cancel(row.id);

    return {
      reward,
      levelBefore: gain.levelBefore,
      levelAfter: gain.levelAfter,
      leveledUp: gain.leveledUp,
      levelsGained: gain.levelsGained,
      character: toCharacterStateView(updated),
      offlineDurationSec,
      items: grantedItems,
      questLog,
      ...(questFailed ? { questFailed: true } : {}),
      ...(professionRewards.profession ? { profession: professionRewards.profession } : {}),
      ...(reputation.length > 0 ? { reputation } : {}),
    };
  }

  /**
   * Připíše standing Explorers' Guild za dokončený quest/grind (M9 retrofit).
   * Vrací view pro claim banner (stejný tvar jako profession reputace).
   */
  private async grantAdventuringReputation(
    characterId: string,
    level: number,
  ): Promise<ReputationGainView> {
    const gained = questReputationGain(level);
    const standing = await this.reputationRepo.addStanding(characterId, GENERALIST_FACTION, gained);
    const prog = reputationProgress(standing);
    return {
      factionId: GENERALIST_FACTION,
      name: FACTIONS[GENERALIST_FACTION].name,
      gained,
      standing,
      tier: prog.tier,
      tierName: prog.tierName,
    };
  }

  /**
   * Připíše profession skill-up a reputaci za dokončený gather/craft běh.
   * Vrací prázdný objekt pro ostatní typy aktivit.
   */
  private async applyProfessionRewards(
    row: CharacterActivity,
  ): Promise<{ profession?: ProfessionGainView; reputation?: ReputationGainView[] }> {
    let professionId: ProfessionId;
    let skillUpTo: number;
    let repSource: typeof GATHERING_NODES[string] | typeof RECIPES[string];

    if (row.activityType === 'gather') {
      const node = GATHERING_NODES[(row.params as GatherActivityParams).nodeId];
      if (!node) return {};
      professionId = node.professionId;
      skillUpTo = node.skillUpTo;
      repSource = node;
    } else if (row.activityType === 'craft') {
      const recipe = RECIPES[(row.params as CraftActivityParams).recipeId];
      if (!recipe) return {};
      professionId = recipe.professionId;
      skillUpTo = recipe.skillUpTo;
      repSource = recipe;
    } else {
      return {};
    }

    const skillBefore = await this.professionRepo.getSkill(row.characterId, professionId);
    const delta = professionSkillUp(skillBefore, skillUpTo);
    const skillAfter = skillBefore + delta;
    if (delta > 0) {
      await this.professionRepo.setSkill(row.characterId, professionId, skillAfter);
    }

    const reputation: ReputationGainView[] = [];
    for (const gainEntry of professionReputationGains(repSource)) {
      const standing = await this.reputationRepo.addStanding(
        row.characterId,
        gainEntry.factionId,
        gainEntry.amount,
      );
      const prog = reputationProgress(standing);
      reputation.push({
        factionId: gainEntry.factionId,
        name: FACTIONS[gainEntry.factionId].name,
        gained: gainEntry.amount,
        standing,
        tier: prog.tier,
        tierName: prog.tierName,
      });
    }

    return {
      profession: {
        id: professionId,
        name: PROFESSIONS[professionId].name,
        skillBefore,
        skillAfter,
      },
      reputation,
    };
  }

  private toActivityView(row: CharacterActivity, now: number): ActivityView {
    const state = toActivityState(row);
    const p = activityProgress(state, now);
    const progress = {
      elapsedSec: p.elapsedSec,
      remainingSec: p.remainingSec,
      progress: p.progress,
      completed: p.completed,
      finishesAt: new Date(p.finishesAt).toISOString(),
    };
    const base = {
      id: row.id,
      activityType: row.activityType,
      startAt: row.startAt.toISOString(),
      durationSec: row.durationSec,
      progress,
    };

    if (row.activityType === 'gather') {
      const node = GATHERING_NODES[(row.params as GatherActivityParams).nodeId];
      return { ...base, title: node ? `Gathering: ${node.name}` : 'Gathering' };
    }

    if (row.activityType === 'craft') {
      const recipe = RECIPES[(row.params as CraftActivityParams).recipeId];
      return { ...base, title: recipe ? `Crafting: ${recipe.name}` : 'Crafting' };
    }

    if (row.activityType === 'grind') {
      const zone = ZONES[(row.params as GrindActivityParams).zoneId];
      return { ...base, title: zone ? `Gone Questing: ${zone.name}` : 'Gone Questing' };
    }

    const questId = (row.params as QuestActivityParams).questId;
    const quest = QUESTS[questId]!;
    return {
      ...base,
      title: quest.name,
      questId,
      quest: { id: quest.id, name: quest.name, zoneId: quest.zoneId, kind: quest.kind },
    };
  }
}

function toActivityState(row: CharacterActivity): ActivityState {
  return {
    activityType: row.activityType,
    params: row.params,
    startAt: row.startAt.getTime(),
    durationSec: row.durationSec,
    seed: row.seed,
  };
}

function toCharacterStateView(c: Character): CharacterStateView {
  return {
    id: c.id,
    name: c.name,
    race: c.race,
    class: c.class,
    faction: c.faction,
    gold: c.gold,
    sheet: buildCharacterSheet(c.race, c.class, c.totalXp),
  };
}
