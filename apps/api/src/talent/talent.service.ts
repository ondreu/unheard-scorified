import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CLASS_TALENTS,
  getTalentNode,
  pointsInTree,
  talentPointsForLevel,
  levelFromXp,
  type ClassId,
  type TalentTree,
  type TalentNode,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { TalentRepository } from './talent.repository';

export interface TalentNodeView extends TalentNode {
  allocatedPoints: number;
}

export interface TalentTreeView {
  name: string;
  nodes: TalentNodeView[];
  pointsSpent: number;
}

export interface TalentsView {
  trees: TalentTreeView[];
  totalPoints: number;
  spentPoints: number;
  availablePoints: number;
}

@Injectable()
export class TalentService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly talents: TalentRepository,
  ) {}

  /** Vrátí aktuální stav talent stromů postavy. */
  async listTalents(accountId: string, characterId: string): Promise<TalentsView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const level = levelFromXp(character.totalXp);
    const totalPoints = talentPointsForLevel(level);

    const rows = await this.talents.listTalents(characterId);
    const allocations: Record<string, number> = {};
    for (const row of rows) {
      allocations[row.talentId] = row.points;
    }

    const spentPoints = Object.values(allocations).reduce((s, p) => s + p, 0);
    const classId = character.class as ClassId;
    const trees = CLASS_TALENTS[classId];

    const treeViews: TalentTreeView[] = trees.map((tree: TalentTree, idx: number) => {
      const pointsSpent = pointsInTree(allocations, classId, idx);
      const nodes: TalentNodeView[] = tree.nodes.map((node: TalentNode) => ({
        ...node,
        allocatedPoints: allocations[node.id] ?? 0,
      }));
      return { name: tree.name, nodes, pointsSpent };
    });

    return {
      trees: treeViews,
      totalPoints,
      spentPoints,
      availablePoints: totalPoints - spentPoints,
    };
  }

  /** Alokuje bod do talentu. */
  async allocate(accountId: string, characterId: string, talentId: string): Promise<TalentsView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const classId = character.class as ClassId;
    const node = getTalentNode(classId, talentId);
    if (!node) throw new BadRequestException('Unknown talent for this class');

    const level = levelFromXp(character.totalXp);
    const totalPoints = talentPointsForLevel(level);

    const rows = await this.talents.listTalents(characterId);
    const allocations: Record<string, number> = {};
    for (const row of rows) {
      allocations[row.talentId] = row.points;
    }

    const spentPoints = Object.values(allocations).reduce((s, p) => s + p, 0);
    if (spentPoints >= totalPoints) {
      throw new BadRequestException('No talent points available');
    }

    const currentRank = allocations[talentId] ?? 0;
    if (currentRank >= node.maxRanks) {
      throw new BadRequestException('Talent is already at max rank');
    }

    // Ověř tierRequirement: kolik bodů je v daném stromě
    const trees = CLASS_TALENTS[classId];
    const treeIndex = trees.findIndex((t: TalentTree) => t.nodes.some((n: TalentNode) => n.id === talentId));
    const spentInTree = pointsInTree(allocations, classId, treeIndex);
    if (spentInTree < node.tierRequirement) {
      throw new BadRequestException(
        `Need ${node.tierRequirement} points in this tree before unlocking this talent`,
      );
    }

    await this.talents.allocate(characterId, talentId);
    return this.listTalents(accountId, characterId);
  }

  /** Resetuje všechny talenty postavy. */
  async resetAll(accountId: string, characterId: string): Promise<TalentsView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    await this.talents.resetAll(characterId);
    return this.listTalents(accountId, characterId);
  }
}
