import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildCharacterSheet,
  factionOf,
  isClassId,
  isRaceId,
  isValidCharacterName,
  isValidRaceClass,
  type CharacterSheet,
} from '@game/shared';
import { CharacterRepository } from './character.repository';
import type { Character } from '../db/schema';

export interface CharacterView {
  id: string;
  name: string;
  race: string;
  class: string;
  faction: string;
  gold: number;
  sheet: CharacterSheet;
}

@Injectable()
export class CharacterService {
  constructor(private readonly repo: CharacterRepository) {}

  async create(
    accountId: string,
    input: { name: string; race: string; class: string },
  ): Promise<CharacterView> {
    const { name, race, class: klass } = input;

    if (!isValidCharacterName(name)) {
      throw new BadRequestException('Invalid character name');
    }
    if (!isRaceId(race) || !isClassId(klass)) {
      throw new BadRequestException('Unknown race or class');
    }
    if (!isValidRaceClass(race, klass)) {
      throw new BadRequestException(`The ${race}/${klass} combination is not allowed`);
    }

    try {
      const created = await this.repo.create({
        accountId,
        name,
        race,
        class: klass,
        faction: factionOf(race),
      });
      return this.toView(created);
    } catch (err) {
      // Unikátní index na jméno → 23505 (Postgres unique_violation).
      if (isUniqueViolation(err)) {
        throw new ConflictException('Character name is already taken');
      }
      throw err;
    }
  }

  async list(accountId: string): Promise<CharacterView[]> {
    const rows = await this.repo.listByAccount(accountId);
    return rows.map((r) => this.toView(r));
  }

  async getOwned(accountId: string, id: string): Promise<CharacterView> {
    const row = await this.repo.findOwned(accountId, id);
    if (!row) throw new NotFoundException('Character not found');
    return this.toView(row);
  }

  private toView(c: Character): CharacterView {
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
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';
}
