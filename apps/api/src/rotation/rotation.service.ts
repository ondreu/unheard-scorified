import { Injectable, NotFoundException } from '@nestjs/common';
import {
  aggregateTalentEffects,
  baseStatsFor,
  defaultRotation,
  deriveCombatProfile,
  isRaidRole,
  levelFromXp,
  resolveAbilities,
  sanitizeRotation,
  seedFromString,
  simulateDummyFight,
  type AbilityKind,
  type CharacterRotation,
  type ClassId,
  type CombatActor,
  type CombatEvent,
  type RaceId,
  type RaidRole,
  type RotationRule,
  type SignatureAbility,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryService } from '../inventory/inventory.service';
import { TalentRepository } from '../talent/talent.repository';
import type { Character } from '../db/schema';
import { RotationRepository } from './rotation.repository';

/** Minimální/maximální délka sandbox testu na trénovacím terči (MIL), v sekundách. */
const DUMMY_TEST_MIN_SEC = 10;
const DUMMY_TEST_MAX_SEC = 180;

/** Jedna ability dostupná postavě (pro UI editoru rotace). */
export interface RotationAbilityView {
  id: string;
  name: string;
  description: string;
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
    private readonly inventory: InventoryService,
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

  /**
   * Sandbox sim (MIL): otestuje uloženou rotaci postavy proti trénovacímu terči
   * na pevně dané délce, bez party/soupeře. Stateless — nic se neukládá, jen
   * spočítá a vrátí timeline (deterministicky, ale s čerstvým seedem na
   * vyžádání, ať jde test zopakovat s jiným průběhem náhody).
   */
  async testDummy(
    accountId: string,
    characterId: string,
    role: string,
    durationSec: number,
  ): Promise<{ events: CombatEvent[]; durationSec: number }> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    const safeRole: RaidRole = isRaidRole(role) ? role : 'dps';
    const safeDuration = Math.min(
      DUMMY_TEST_MAX_SEC,
      Math.max(DUMMY_TEST_MIN_SEC, Math.round(durationSec)),
    );

    const level = levelFromXp(character.totalXp);
    const profile = await this.buildCombatProfile(character, level);
    const seed = seedFromString(`dummy:${characterId}:${Date.now()}`);
    return simulateDummyFight(profile, safeRole, safeDuration, seed);
  }

  /**
   * Bojový profil postavy (staty + gear + talenty + uložená rotace), jako
   * raid/dungeon/arena. Veřejné — recykluje ho i quest narrative engine
   * (`ActivityService` při claimu) bez duplikace profil-buildingu.
   */
  async buildCombatProfile(character: Character, level: number): Promise<CombatActor> {
    const primary = baseStatsFor(character.race as RaceId, character.class as ClassId, level);
    const equipment = await this.inventory.getEquipmentStats(character.id);
    const rotation = await this.rotationForCombat(character.id, character.class as ClassId, level);
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
    return rotation ? { ...profile, rotation } : profile;
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
      description: a.description ?? '',
      kind: a.kind,
      cooldownSec: a.cooldownSec,
    }));
  }
}
