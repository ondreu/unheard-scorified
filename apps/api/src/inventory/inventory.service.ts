import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ITEMS,
  isItemId,
  isEquipmentSlot,
  SLOT_TO_ITEM_SLOT,
  sumEquipmentStats,
  type ItemDef,
  type EquipmentSlot,
  type ItemStats,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryRepository } from './inventory.repository';

export interface InventoryItemView {
  itemId: string;
  quantity: number;
  item: ItemDef;
}

export interface EquipmentView {
  slot: string;
  itemId: string;
  item: ItemDef;
}

export interface EquipmentSlotsView {
  equipped: EquipmentView[];
  equipmentStats: ItemStats;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly inventory: InventoryRepository,
  ) {}

  /** Vrátí inventář postavy. */
  async listInventory(accountId: string, characterId: string): Promise<InventoryItemView[]> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const rows = await this.inventory.listInventory(characterId);
    return rows.flatMap((row) => {
      const item = ITEMS[row.itemId];
      if (!item) return [];
      return [{ itemId: row.itemId, quantity: row.quantity, item }];
    });
  }

  /** Vrátí equipment (equipnuté itemy) postavy. */
  async listEquipment(accountId: string, characterId: string): Promise<EquipmentSlotsView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const rows = await this.inventory.listEquipment(characterId);
    const equipped: EquipmentView[] = rows.flatMap((row) => {
      const item = ITEMS[row.itemId];
      if (!item) return [];
      return [{ slot: row.slot, itemId: row.itemId, item }];
    });

    const equipmentStats = sumEquipmentStats(equipped.map((e) => e.item));
    return { equipped, equipmentStats };
  }

  /** Equipne item z inventáře do slotu. */
  async equip(
    accountId: string,
    characterId: string,
    itemId: string,
    slot: string,
  ): Promise<EquipmentSlotsView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    if (!isItemId(itemId)) throw new BadRequestException('Unknown item');
    if (!isEquipmentSlot(slot)) throw new BadRequestException('Invalid equipment slot');

    const itemDef = ITEMS[itemId]!;
    const expectedSlotType = SLOT_TO_ITEM_SLOT[slot as EquipmentSlot];
    if (itemDef.slot !== expectedSlotType) {
      throw new BadRequestException(`Item cannot go in slot "${slot}" (expected ${itemDef.slot})`);
    }

    // Ověř, že postava item vlastní
    const invRows = await this.inventory.listInventory(characterId);
    const has = invRows.some((r) => r.itemId === itemId && r.quantity > 0);
    if (!has) throw new BadRequestException('Item not in inventory');

    await this.inventory.equip(characterId, slot, itemId);
    return this.listEquipment(accountId, characterId);
  }

  /** Odebere item ze slotu. */
  async unequip(
    accountId: string,
    characterId: string,
    slot: string,
  ): Promise<EquipmentSlotsView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    if (!isEquipmentSlot(slot)) throw new BadRequestException('Invalid equipment slot');

    await this.inventory.unequip(characterId, slot);
    return this.listEquipment(accountId, characterId);
  }

  /** Sestaví CharacterSheet s equipment staty (pro activity service). */
  async getEquipmentStats(characterId: string): Promise<ItemStats> {
    const rows = await this.inventory.listEquipment(characterId);
    const items = rows.flatMap((row) => {
      const item = ITEMS[row.itemId];
      return item ? [item] : [];
    });
    return sumEquipmentStats(items);
  }
}
