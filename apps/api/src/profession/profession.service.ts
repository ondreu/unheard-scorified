import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  applyMountSpeed,
  CONSUMABLES,
  FACTIONS,
  GATHERING_NODES,
  mountSpeedBonus,
  MATERIALS,
  MAX_PROFESSION_SKILL,
  PROFESSIONS,
  RECIPES,
  isGatheringNodeId,
  isRecipeId,
  REP_TIERS,
  reputationProgress,
  reputationTier,
  repTierIndex,
  seedFromString,
  type CraftActivityParams,
  type FactionId,
  type GatherActivityParams,
  type ProfessionId,
  type ProfessionKind,
  type RecipeDef,
  type RepTier,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { MountRepository } from '../mount/mount.repository';
import { ActivityRepository } from '../activity/activity.repository';
import { ACTIVITY_SCHEDULER, type ActivityScheduler } from '../activity/activity.scheduler';
import { ProfessionRepository, ReputationRepository } from './profession.repository';

export interface ProfessionSkillView {
  id: ProfessionId;
  name: string;
  kind: ProfessionKind;
  skill: number;
  maxSkill: number;
  factionId: FactionId;
}

export interface ReputationView {
  factionId: FactionId;
  name: string;
  standing: number;
  tier: RepTier;
  tierName: string;
  currentMin: number;
  nextMin: number | null;
}

export interface MaterialStackView {
  itemId: string;
  name: string;
  kind: 'material' | 'consumable';
  rarity: string;
  quantity: number;
}

export interface GatheringNodeView {
  id: string;
  professionId: ProfessionId;
  name: string;
  description: string;
  requiredSkill: number;
  durationSec: number;
  baseXp: number;
  repReward: number;
  skill: number;
  unlocked: boolean;
}

export interface RecipeInputView {
  materialId: string;
  name: string;
  quantity: number;
  have: number;
}

export interface RecipeView {
  id: string;
  professionId: ProfessionId;
  name: string;
  description: string;
  requiredSkill: number;
  durationSec: number;
  baseXp: number;
  repReward: number;
  skill: number;
  inputs: RecipeInputView[];
  output: { itemId: string; name: string; quantity: number };
  requiredReputation?: { factionId: FactionId; factionName: string; tier: RepTier; tierName: string; met: boolean };
  /** Skill i případný rep gate splněn. */
  unlocked: boolean;
  /** Unlocked a postava má všechny materiály. */
  craftable: boolean;
}

export interface ProfessionPanel {
  skills: ProfessionSkillView[];
  reputation: ReputationView[];
  materials: MaterialStackView[];
  gathering: GatheringNodeView[];
  recipes: RecipeView[];
}

/** Lidský název itemu (equipment / material / consumable). */
function outputName(itemId: string): string {
  return MATERIALS[itemId as keyof typeof MATERIALS]?.name
    ?? CONSUMABLES[itemId as keyof typeof CONSUMABLES]?.name
    ?? itemId;
}

@Injectable()
export class ProfessionService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly inventory: InventoryRepository,
    private readonly professions: ProfessionRepository,
    private readonly reputation: ReputationRepository,
    private readonly activities: ActivityRepository,
    private readonly mounts: MountRepository,
    @Inject(ACTIVITY_SCHEDULER) private readonly scheduler: ActivityScheduler,
  ) {}

  /** Kompletní profession panel (skilly, reputace, materiály, nody, recepty). */
  async getPanel(accountId: string, characterId: string): Promise<ProfessionPanel> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const skillRows = await this.professions.listSkills(characterId);
    const skillByProf = new Map(skillRows.map((r) => [r.professionId, r.skill]));
    const skillOf = (id: ProfessionId): number => skillByProf.get(id) ?? 1;

    const standingRows = await this.reputation.listStandings(characterId);
    const standingByFaction = new Map(standingRows.map((r) => [r.factionId, r.standing]));
    const standingOf = (id: FactionId): number => standingByFaction.get(id) ?? 0;

    const invRows = await this.inventory.listInventory(characterId);
    const haveOf = (itemId: string): number =>
      invRows.find((r) => r.itemId === itemId)?.quantity ?? 0;

    const skills: ProfessionSkillView[] = Object.values(PROFESSIONS).map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      skill: skillOf(p.id),
      maxSkill: MAX_PROFESSION_SKILL,
      factionId: p.factionId,
    }));

    const reputation: ReputationView[] = Object.values(FACTIONS).map((f) => {
      const standing = standingOf(f.id);
      const prog = reputationProgress(standing);
      return {
        factionId: f.id,
        name: f.name,
        standing,
        tier: prog.tier,
        tierName: prog.tierName,
        currentMin: prog.currentMin,
        nextMin: prog.nextMin,
      };
    });

    const materials: MaterialStackView[] = invRows.flatMap((row): MaterialStackView[] => {
      const mat = MATERIALS[row.itemId as keyof typeof MATERIALS];
      if (mat) {
        return [{ itemId: row.itemId, name: mat.name, kind: 'material' as const, rarity: mat.rarity, quantity: row.quantity }];
      }
      const con = CONSUMABLES[row.itemId as keyof typeof CONSUMABLES];
      if (con) {
        return [{ itemId: row.itemId, name: con.name, kind: 'consumable' as const, rarity: con.rarity, quantity: row.quantity }];
      }
      return [];
    });

    const gathering: GatheringNodeView[] = Object.values(GATHERING_NODES)
      .sort((a, b) => a.requiredSkill - b.requiredSkill)
      .map((n) => {
        const skill = skillOf(n.professionId);
        return {
          id: n.id,
          professionId: n.professionId,
          name: n.name,
          description: n.description,
          requiredSkill: n.requiredSkill,
          durationSec: n.durationSec,
          baseXp: n.baseXp,
          repReward: n.repReward,
          skill,
          unlocked: skill >= n.requiredSkill,
        };
      });

    const recipes: RecipeView[] = Object.values(RECIPES)
      .sort((a, b) => a.requiredSkill - b.requiredSkill)
      .map((r) => {
        const skill = skillOf(r.professionId);
        const inputs: RecipeInputView[] = r.inputs.map((i) => ({
          materialId: i.materialId,
          name: MATERIALS[i.materialId]?.name ?? i.materialId,
          quantity: i.quantity,
          have: haveOf(i.materialId),
        }));
        const repGate = this.evaluateRepGate(r, standingOf);
        const skillOk = skill >= r.requiredSkill;
        const unlocked = skillOk && (repGate?.met ?? true);
        const hasMaterials = inputs.every((i) => i.have >= i.quantity);
        return {
          id: r.id,
          professionId: r.professionId,
          name: r.name,
          description: r.description,
          requiredSkill: r.requiredSkill,
          durationSec: r.durationSec,
          baseXp: r.baseXp,
          repReward: r.repReward,
          skill,
          inputs,
          output: { itemId: r.outputItemId, name: outputName(r.outputItemId), quantity: r.outputQuantity },
          ...(repGate ? { requiredReputation: repGate } : {}),
          unlocked,
          craftable: unlocked && hasMaterials,
        };
      });

    return { skills, reputation, materials, gathering, recipes };
  }

  /** Pošle postavu sbírat materiály (gathering aktivita). */
  async startGather(accountId: string, characterId: string, nodeId: string): Promise<void> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    if (!isGatheringNodeId(nodeId)) throw new BadRequestException('Unknown gathering node');

    const node = GATHERING_NODES[nodeId]!;
    const skill = await this.professions.getSkill(characterId, node.professionId);
    if (skill < node.requiredSkill) {
      throw new BadRequestException(`Requires ${PROFESSIONS[node.professionId].name} skill ${node.requiredSkill}`);
    }

    await this.assertNoActivity(characterId);

    const startAt = new Date();
    const seed = seedFromString(`${characterId}:${nodeId}:${startAt.getTime()}`);
    const params: GatherActivityParams = { nodeId };
    // Mount speed (M10+): gathering je pohybová aktivita → zkracuje se durationSec.
    const ownedMounts = await this.mounts.ownedIds(characterId);
    const durationSec = applyMountSpeed(node.durationSec, mountSpeedBonus(ownedMounts));
    const row = await this.activities.create({
      characterId,
      activityType: 'gather',
      params,
      startAt,
      durationSec,
      seed,
    });
    await this.scheduler.schedule(row.id, characterId, durationSec * 1000);
  }

  /**
   * Pošle postavu craftit (crafting aktivita). Vstupní materiály se spotřebují
   * IHNED (anti-double-spend); output se vyrobí při claimu.
   */
  async startCraft(accountId: string, characterId: string, recipeId: string): Promise<void> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    if (!isRecipeId(recipeId)) throw new BadRequestException('Unknown recipe');

    const recipe = RECIPES[recipeId]!;
    const skill = await this.professions.getSkill(characterId, recipe.professionId);
    if (skill < recipe.requiredSkill) {
      throw new BadRequestException(`Requires ${PROFESSIONS[recipe.professionId].name} skill ${recipe.requiredSkill}`);
    }

    if (recipe.requiredReputation) {
      const standing = await this.reputation.getStanding(characterId, recipe.requiredReputation.factionId);
      if (repTierIndex(reputationTier(standing)) < repTierIndex(recipe.requiredReputation.tier)) {
        const f = FACTIONS[recipe.requiredReputation.factionId];
        throw new BadRequestException(`Requires ${recipe.requiredReputation.tier} reputation with ${f.name}`);
      }
    }

    // Ověř materiály PŘED spotřebou (vše nebo nic).
    for (const input of recipe.inputs) {
      const have = await this.inventory.getQuantity(characterId, input.materialId);
      if (have < input.quantity) {
        throw new BadRequestException(`Not enough ${MATERIALS[input.materialId]?.name ?? input.materialId}`);
      }
    }

    await this.assertNoActivity(characterId);

    // Spotřebuj materiály.
    for (const input of recipe.inputs) {
      await this.inventory.consume(characterId, input.materialId, input.quantity);
    }

    const startAt = new Date();
    const seed = seedFromString(`${characterId}:${recipeId}:${startAt.getTime()}`);
    const params: CraftActivityParams = { recipeId };
    const row = await this.activities.create({
      characterId,
      activityType: 'craft',
      params,
      startAt,
      durationSec: recipe.durationSec,
      seed,
    });
    await this.scheduler.schedule(row.id, characterId, recipe.durationSec * 1000);
  }

  private async assertNoActivity(characterId: string): Promise<void> {
    const existing = await this.activities.findByCharacter(characterId);
    if (existing) throw new ConflictException('Character already has an active activity');
  }

  private evaluateRepGate(
    recipe: RecipeDef,
    standingOf: (id: FactionId) => number,
  ): RecipeView['requiredReputation'] | undefined {
    if (!recipe.requiredReputation) return undefined;
    const { factionId, tier } = recipe.requiredReputation;
    const met = repTierIndex(reputationTier(standingOf(factionId))) >= repTierIndex(tier);
    return {
      factionId,
      factionName: FACTIONS[factionId].name,
      tier,
      tierName: REP_TIERS.find((t) => t.tier === tier)?.name ?? tier,
      met,
    };
  }
}
