import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CONSUMABLES,
  CONSUMABLE_BUFFS,
  consumableBuff,
  isConsumableId,
  type ConsumableId,
  type ItemStats,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { BuffRepository } from '../buff/buff.repository';

export interface ConsumableStackView {
  itemId: string;
  name: string;
  quantity: number;
  effect: string;
}

export interface ActiveBuffView {
  consumableId: string;
  name: string;
  stats: ItemStats;
  expiresAt: string;
}

export interface ConsumablesView {
  consumables: ConsumableStackView[];
  activeBuffs: ActiveBuffView[];
}

@Injectable()
export class ConsumableService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly inventory: InventoryRepository,
    private readonly buffs: BuffRepository,
  ) {}

  /** Spotřebáky v inventáři + aktivní buffy. */
  async getConsumables(accountId: string, characterId: string): Promise<ConsumablesView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const rows = await this.inventory.listInventory(characterId);
    const consumables: ConsumableStackView[] = rows
      .filter((r) => isConsumableId(r.itemId))
      .map((r) => {
        const def = CONSUMABLES[r.itemId as ConsumableId];
        return { itemId: r.itemId, name: def.name, quantity: r.quantity, effect: def.effect };
      });

    return { consumables, activeBuffs: await this.activeBuffs(characterId) };
  }

  /** Použije spotřebák: spotřebuje 1 kus z inventáře, aplikuje (refresh) buff. */
  async use(accountId: string, characterId: string, itemId: string): Promise<ConsumablesView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    if (!isConsumableId(itemId)) throw new BadRequestException('Not a usable consumable');

    const buff = consumableBuff(itemId);
    if (!buff) throw new BadRequestException('Consumable has no effect');

    const consumed = await this.inventory.consume(characterId, itemId, 1);
    if (!consumed) throw new BadRequestException('You do not have that consumable');

    await this.buffs.apply(characterId, itemId, buff.durationSec);
    return this.getConsumables(accountId, characterId);
  }

  private async activeBuffs(characterId: string): Promise<ActiveBuffView[]> {
    const rows = await this.buffs.listActive(characterId);
    return rows.flatMap((row) => {
      const def = CONSUMABLES[row.consumableId as ConsumableId];
      const buff = CONSUMABLE_BUFFS[row.consumableId as ConsumableId];
      if (!def || !buff) return [];
      return [
        {
          consumableId: row.consumableId,
          name: def.name,
          stats: buff.stats,
          expiresAt: row.expiresAt.toISOString(),
        },
      ];
    });
  }
}
