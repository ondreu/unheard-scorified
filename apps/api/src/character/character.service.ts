import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ABILITY_SCORES,
  BACKSTORY_MAX_LENGTH,
  buildCharacterSheet,
  isBackgroundId,
  isClassId,
  isRaceId,
  isValidCharacterName,
  isValidRaceClass,
  isValidStandardArray,
  sumEquipmentStats,
  ITEMS,
  type AbilityScores,
  type BackgroundId,
  type CharacterSheet,
  type ItemStats,
} from '@game/shared';
import { CharacterRepository } from './character.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { GroupRepository } from '../group/group.repository';
import { GuildRepository } from '../social/guild.repository';
import type { Character } from '../db/schema';

export interface CharacterView {
  id: string;
  name: string;
  race: string;
  class: string;
  /** D&D Background (MR-3) — null pro starší/neúplné postavy. */
  background: string | null;
  /** Veřejná backstory (MR-3). */
  backstory: string | null;
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
  /** Průměrný item level equipnutého gearu (0 = nic nemá oblečeno). */
  itemLevel: number;
  /** Je postava aktuálně v nějaké skupině (pro „request to join group" v UI)? */
  inGroup: boolean;
  /** Guilda postavy (jméno + rank), nebo null když není v žádné. */
  guild: { name: string; rank: string } | null;
  /** D&D Background (MR-3) — veřejně viditelný. */
  background: string | null;
  /** Veřejná backstory (MR-3). */
  backstory: string | null;
  sheet: CharacterSheet;
  equipment: InspectItemView[];
}

@Injectable()
export class CharacterService {
  private readonly logger = new Logger(CharacterService.name);

  constructor(
    private readonly repo: CharacterRepository,
    // Volitelné kvůli jednoduchému instancování v unit/flow testech (1 arg).
    // V produkci Nest vždy injektne (provider v CharacterModule).
    private readonly inventory?: InventoryRepository,
    private readonly groups?: GroupRepository,
    private readonly guilds?: GuildRepository,
  ) {}

  async create(
    accountId: string,
    input: {
      name: string;
      race: string;
      class: string;
      background?: string;
      abilityScores?: Record<string, number>;
      backstory?: string;
    },
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

    // MR-3: Background (volitelné, ale když dané, musí být validní).
    let background: BackgroundId | null = null;
    if (input.background !== undefined) {
      if (!isBackgroundId(input.background)) throw new BadRequestException('Unknown background');
      background = input.background;
    }

    // MR-3: přiřazený standard array (volitelné). Musí obsahovat všech 6 atributů
    // a být přesně permutací standard array.
    let baseScores: AbilityScores | null = null;
    if (input.abilityScores !== undefined) {
      const raw = input.abilityScores;
      const scores = {} as AbilityScores;
      for (const k of ABILITY_SCORES) {
        const v = raw[k];
        if (typeof v !== 'number' || !Number.isInteger(v)) {
          throw new BadRequestException('Ability scores must assign all six abilities');
        }
        scores[k] = v;
      }
      if (!isValidStandardArray(scores)) {
        throw new BadRequestException('Ability scores must use the standard array (15,14,13,12,10,8)');
      }
      baseScores = scores;
    }

    const backstory = input.backstory?.trim().slice(0, BACKSTORY_MAX_LENGTH) || null;

    try {
      const created = await this.repo.create({
        accountId,
        name,
        race,
        class: klass,
        background,
        baseScores,
        backstory,
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
    // Odolnost: jediný řádek se starým/neznámým race/class id (např. prostředí,
    // kde ještě neproběhly remap migrace) nesmí shodit celý seznam účtu. Takovou
    // postavu zalogujeme a přeskočíme místo 500 na celém endpointu.
    const views: CharacterView[] = [];
    for (const r of rows) {
      try {
        views.push(this.toView(r));
      } catch (err) {
        this.logger.error(
          `Skipping character ${r.id} (${r.race}/${r.class}) in list: ${(err as Error).message}`,
        );
      }
    }
    return views;
  }

  async getOwned(accountId: string, id: string): Promise<CharacterView> {
    const row = await this.repo.findOwned(accountId, id);
    if (!row) throw new NotFoundException('Character not found');
    return this.toView(row);
  }

  /** Smaže vlastní postavu (ownership check, permanentní). */
  async deleteOwned(accountId: string, id: string): Promise<{ deleted: true }> {
    const row = await this.repo.findOwned(accountId, id);
    if (!row) throw new NotFoundException('Character not found');
    await this.repo.delete(id);
    return { deleted: true };
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

    let guild: InspectView['guild'] = null;
    if (this.guilds) {
      const membership = await this.guilds.membershipOf(id);
      if (membership) {
        const g = await this.guilds.findById(membership.guildId);
        if (g) guild = { name: g.name, rank: membership.rank };
      }
    }

    return {
      id: row.id,
      name: row.name,
      race: row.race,
      class: row.class,
      itemLevel,
      inGroup,
      guild,
      background: row.background ?? null,
      backstory: row.backstory ?? null,
      sheet: buildCharacterSheet(row.race, row.class, row.totalXp, equipmentStats, row.baseScores),
      equipment,
    };
  }

  private toView(c: Character): CharacterView {
    return {
      id: c.id,
      name: c.name,
      race: c.race,
      class: c.class,
      background: c.background ?? null,
      backstory: c.backstory ?? null,
      gold: c.gold,
      sheet: buildCharacterSheet(c.race, c.class, c.totalXp, undefined, c.baseScores),
    };
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';
}
