import { Injectable, NotFoundException } from '@nestjs/common';
import {
  SIGNATURE_ABILITIES,
  aggregateTalentEffects,
  defaultRotation,
  sanitizeRotation,
  type AbilityKind,
  type CharacterRotation,
  type ClassId,
  type RotationRule,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { TalentRepository } from '../talent/talent.repository';
import { RotationRepository } from './rotation.repository';

/** Jedna ability dostupná postavě (pro UI editoru rotace). */
export interface RotationAbilityView {
  id: string;
  name: string;
  kind: AbilityKind;
  cooldownSec: number;
}

export interface RotationView {
  /** Ability odemčené talenty postavy (možné podmínit/vypnout). */
  abilities: RotationAbilityView[];
  /** Aktuální pravidla (uložená nebo default), seřazená dle priority. */
  rules: RotationRule[];
}

@Injectable()
export class RotationService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly talents: TalentRepository,
    private readonly rotations: RotationRepository,
  ) {}

  /** Vrátí dostupné ability postavy + aktuální (uložená/default) pravidla. */
  async getRotation(accountId: string, characterId: string): Promise<RotationView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const abilityIds = await this.abilityIdsFor(characterId, character.class as ClassId);
    const stored = await this.rotations.getRules(characterId);
    const rotation: CharacterRotation = stored
      ? sanitizeRotation({ rules: stored }, abilityIds)
      : defaultRotation(abilityIds);

    return { abilities: this.abilityViews(abilityIds), rules: rotation.rules };
  }

  /** Uloží očištěná pravidla rotace; vrací aktuální stav. */
  async setRotation(
    accountId: string,
    characterId: string,
    input: unknown,
  ): Promise<RotationView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const abilityIds = await this.abilityIdsFor(characterId, character.class as ClassId);
    const sanitized = sanitizeRotation(input, abilityIds);
    await this.rotations.setRules(characterId, sanitized.rules);
    return { abilities: this.abilityViews(abilityIds), rules: sanitized.rules };
  }

  /**
   * Načte rotaci pro combat snapshot (engine). Vrací `undefined`, pokud postava
   * nemá uloženou rotaci ani odemčené ability → engine použije default „always".
   */
  async rotationForCombat(
    characterId: string,
    classId: ClassId,
  ): Promise<CharacterRotation | undefined> {
    const stored = await this.rotations.getRules(characterId);
    if (!stored || stored.length === 0) return undefined;
    const abilityIds = await this.abilityIdsFor(characterId, classId);
    if (abilityIds.length === 0) return undefined;
    return sanitizeRotation({ rules: stored }, abilityIds);
  }

  /** Id signature abilit odemčených alokovanými talenty postavy. */
  private async abilityIdsFor(characterId: string, classId: ClassId): Promise<string[]> {
    const rows = await this.talents.listTalents(characterId);
    const allocations: Record<string, number> = {};
    for (const r of rows) allocations[r.talentId] = r.points;
    const effects = aggregateTalentEffects(classId, allocations);
    return effects.tags.filter((t) => SIGNATURE_ABILITIES[t.tag]).map((t) => t.tag);
  }

  private abilityViews(abilityIds: string[]): RotationAbilityView[] {
    return abilityIds.map((id) => {
      const spec = SIGNATURE_ABILITIES[id]!;
      return { id, name: spec.name, kind: spec.kind, cooldownSec: spec.cooldownSec };
    });
  }
}
