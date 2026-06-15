import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ITEMS,
  isItemId,
  isEquipmentSlot,
  canEquipArmor,
  itemArmorClass,
  SLOT_TO_ITEM_SLOT,
  sumEquipmentStats,
  type ItemDef,
  type EquipmentSlot,
  type ItemStats,
  type ClassId,
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

    // Armor proficiency (M10): classa smí nosit jen povolené typy brnění.
    if (!canEquipArmor(character.class as ClassId, itemId)) {
      throw new BadRequestException(
        `Your class cannot wear ${itemArmorClass(itemId)} armor`,
      );
    }

    // Ověř, že postava item vlastní (a má volný kus k nasazení)
    const available = await this.inventory.getQuantity(characterId, itemId);
    if (available <= 0) throw new BadRequestException('Item not in inventory');

    // Pokud je cílový slot obsazený, vrať dosavadní item zpět do inventáře (swap).
    const current = await this.inventory.getEquippedInSlot(characterId, slot);
    if (current) {
      await this.inventory.addItem(characterId, current.itemId);
    }

    // Item se z inventáře přesune do slotu (consume → equip), takže není
    // vidět na dvou místech a tentýž kus nelze nasadit do dvou slotů.
    await this.inventory.consume(characterId, itemId, 1);
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

    // Item ze slotu se vrátí do inventáře (opak equipu).
    const current = await this.inventory.getEquippedInSlot(characterId, slot);
    if (current) {
      await this.inventory.addItem(characterId, current.itemId);
    }

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
