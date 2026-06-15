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
  sumEquipmentStats,
  ITEMS,
  type CharacterSheet,
  type ItemStats,
} from '@game/shared';
import { CharacterRepository } from './character.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { GroupRepository } from '../group/group.repository';
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

/** Veřejný „inspect" pohled na cizí postavu — jen public combat info (žádné zlato/účet). */
export interface InspectItemView {
  slot: string;
  itemId: string;
  name: string;
  rarity: string;
  itemLevel: number;
  stats: ItemStats;
}

export interface InspectView {
  id: string;
  name: string;
  race: string;
  class: string;
  faction: string;
  /** Průměrný item level equipnutého gearu (0 = nic nemá oblečeno). */
  itemLevel: number;
  /** Je postava aktuálně v nějaké skupině (pro „request to join group" v UI)? */
  inGroup: boolean;
  sheet: CharacterSheet;
  equipment: InspectItemView[];
}

@Injectable()
export class CharacterService {
  constructor(
    private readonly repo: CharacterRepository,
    // Volitelné kvůli jednoduchému instancování v unit/flow testech (1 arg).
    // V produkci Nest vždy injektne (provider v CharacterModule).
    private readonly inventory?: InventoryRepository,
    private readonly groups?: GroupRepository,
  ) {}

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

  /**
   * Veřejný inspect cizí postavy (chat → klik na jméno). Vrací jen public combat
   * info: rasu/classu/level, equipnutý gear, ilvl a staty (vč. statů z gearu).
   * Žádné zlato, inventář ani účet — to zůstává soukromé.
   */
  async inspect(id: string): Promise<InspectView> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException('Character not found');

    const equipRows = this.inventory ? await this.inventory.listEquipment(id) : [];
    const equipment: InspectItemView[] = [];
    const equippedDefs = [];
    for (const e of equipRows) {
      const def = ITEMS[e.itemId];
      if (!def) continue;
      equippedDefs.push(def);
      equipment.push({
        slot: e.slot,
        itemId: def.id,
        name: def.name,
        rarity: def.rarity,
        itemLevel: def.itemLevel,
        stats: def.stats,
      });
    }

    const equipmentStats = sumEquipmentStats(equippedDefs);
    const itemLevel =
      equippedDefs.length > 0
        ? Math.round(equippedDefs.reduce((sum, d) => sum + d.itemLevel, 0) / equippedDefs.length)
        : 0;

    const inGroup = this.groups ? !!(await this.groups.activeMembership(id)) : false;

    return {
      id: row.id,
      name: row.name,
      race: row.race,
      class: row.class,
      faction: row.faction,
      itemLevel,
      inGroup,
      sheet: buildCharacterSheet(row.race, row.class, row.totalXp, equipmentStats),
      equipment,
    };
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
