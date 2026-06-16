import { Injectable, NotFoundException } from '@nestjs/common';
import {
  aggregateTalentEffects,
  defaultRotation,
  levelFromXp,
  resolveAbilities,
  sanitizeRotation,
  type AbilityKind,
  type CharacterRotation,
  type ClassId,
  type RotationRule,
  type SignatureAbility,
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

    const abilities = await this.abilitiesFor(
      characterId,
      character.class as ClassId,
      levelFromXp(character.totalXp),
    );
    const abilityIds = abilities.map((a) => a.id);
    const stored = await this.rotations.getRules(characterId);
    const rotation: CharacterRotation = stored
      ? sanitizeRotation({ rules: stored }, abilityIds)
      : defaultRotation(abilityIds);

    return { abilities: this.abilityViews(abilities), rules: rotation.rules };
  }

  /** Uloží očištěná pravidla rotace; vrací aktuální stav. */
  async setRotation(
    accountId: string,
    characterId: string,
    input: unknown,
  ): Promise<RotationView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const abilities = await this.abilitiesFor(
      characterId,
      character.class as ClassId,
      levelFromXp(character.totalXp),
    );
    const sanitized = sanitizeRotation(input, abilities.map((a) => a.id));
    await this.rotations.setRules(characterId, sanitized.rules);
    return { abilities: this.abilityViews(abilities), rules: sanitized.rules };
  }

  /**
   * Načte rotaci pro combat snapshot (engine). Vrací `undefined`, pokud postava
   * nemá uloženou rotaci ani odemčené ability → engine použije default „always".
   */
  async rotationForCombat(
    characterId: string,
    classId: ClassId,
    level: number,
  ): Promise<CharacterRotation | undefined> {
    const stored = await this.rotations.getRules(characterId);
    if (!stored || stored.length === 0) return undefined;
    const abilities = await this.abilitiesFor(characterId, classId, level);
    if (abilities.length === 0) return undefined;
    return sanitizeRotation({ rules: stored }, abilities.map((a) => a.id));
  }

  /** Kompletní ability kit postavy (baseline dle levelu + capstone dle talentů). */
  private async abilitiesFor(
    characterId: string,
    classId: ClassId,
    level: number,
  ): Promise<SignatureAbility[]> {
    const rows = await this.talents.listTalents(characterId);
    const allocations: Record<string, number> = {};
    for (const r of rows) allocations[r.talentId] = r.points;
    const effects = aggregateTalentEffects(classId, allocations);
    return resolveAbilities(classId, level, effects.tags);
  }

  private abilityViews(abilities: SignatureAbility[]): RotationAbilityView[] {
    return abilities.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      cooldownSec: a.cooldownSec,
    }));
  }
}
