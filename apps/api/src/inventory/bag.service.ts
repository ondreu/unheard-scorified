import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BAG_SLOT_COUNT,
  BASE_BACKPACK_SLOTS,
  bagCapacity,
  bagSlots,
  isBagId,
  itemDisplayName,
  usedSlots,
  type InvStack,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryRepository } from './inventory.repository';
import { BagRepository } from './bag.repository';

export interface BagSlotView {
  slotIndex: number;
  bagId: string | null;
  name: string | null;
  slots: number;
}

export interface BagsView {
  slotCount: number;
  capacity: number;
  usedSlots: number;
  freeSlots: number;
  bags: BagSlotView[];
}

/**
 * Bag sloty (M10 limited inventory). Vkládání/vyjímání batohů do `BAG_SLOT_COUNT`
 * slotů; kapacita inventáře = základní batoh + sloty vložených batohů.
 */
@Injectable()
export class BagService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly inventory: InventoryRepository,
    private readonly bags: BagRepository,
  ) {}

  private async stacks(characterId: string): Promise<InvStack[]> {
    const rows = await this.inventory.listInventory(characterId);
    return rows.map((r) => ({ itemId: r.itemId, quantity: r.quantity }));
  }

  async getBags(accountId: string, characterId: string): Promise<BagsView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    return this.view(characterId);
  }

  /** Vloží batoh z inventáře do bag slotu. */
  async equipBag(
    accountId: string,
    characterId: string,
    slotIndex: number,
    itemId: string,
  ): Promise<BagsView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= BAG_SLOT_COUNT) {
      throw new BadRequestException('Invalid bag slot');
    }
    if (!isBagId(itemId)) throw new BadRequestException('That item is not a bag');
    if ((await this.inventory.getQuantity(characterId, itemId)) <= 0) {
      throw new BadRequestException('Bag not in inventory');
    }

    const old = await this.bags.getAt(characterId, slotIndex);
    // Kapacita po výměně (jiné bag sloty + nový batoh).
    const equipped = await this.bags.list(characterId);
    const otherSlots = equipped
      .filter((b) => b.slotIndex !== slotIndex)
      .reduce((s, b) => s + bagSlots(b.bagId), 0);
    const capacityAfter = BASE_BACKPACK_SLOTS + otherSlots + bagSlots(itemId);

    // Inventář po výměně: nový batoh odejde, starý se vrátí.
    const after = new Map<string, number>();
    for (const s of await this.stacks(characterId)) after.set(s.itemId, (after.get(s.itemId) ?? 0) + s.quantity);
    after.set(itemId, (after.get(itemId) ?? 0) - 1);
    if (old) after.set(old.bagId, (after.get(old.bagId) ?? 0) + 1);
    const usedAfter = usedSlots([...after].map(([id, quantity]) => ({ itemId: id, quantity })));
    if (usedAfter > capacityAfter) {
      throw new BadRequestException('Not enough space — free up your bags first');
    }

    await this.inventory.consume(characterId, itemId, 1);
    if (old) await this.inventory.addItem(characterId, old.bagId);
    await this.bags.set(characterId, slotIndex, itemId);
    return this.view(characterId);
  }

  /** Vyjme batoh z bag slotu zpět do inventáře (pokud se vejde). */
  async unequipBag(accountId: string, characterId: string, slotIndex: number): Promise<BagsView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    const old = await this.bags.getAt(characterId, slotIndex);
    if (!old) throw new BadRequestException('No bag in that slot');

    const equipped = await this.bags.list(characterId);
    const otherSlots = equipped
      .filter((b) => b.slotIndex !== slotIndex)
      .reduce((s, b) => s + bagSlots(b.bagId), 0);
    const capacityAfter = BASE_BACKPACK_SLOTS + otherSlots;

    const after = new Map<string, number>();
    for (const s of await this.stacks(characterId)) after.set(s.itemId, (after.get(s.itemId) ?? 0) + s.quantity);
    after.set(old.bagId, (after.get(old.bagId) ?? 0) + 1);
    const usedAfter = usedSlots([...after].map(([id, quantity]) => ({ itemId: id, quantity })));
    if (usedAfter > capacityAfter) {
      throw new BadRequestException('Not enough space to unpack the bag — empty it first');
    }

    await this.bags.clear(characterId, slotIndex);
    await this.inventory.addItem(characterId, old.bagId);
    return this.view(characterId);
  }

  private async view(characterId: string): Promise<BagsView> {
    const equipped = await this.bags.list(characterId);
    const byIndex = new Map(equipped.map((b) => [b.slotIndex, b]));
    const bags: BagSlotView[] = [];
    for (let i = 0; i < BAG_SLOT_COUNT; i++) {
      const b = byIndex.get(i);
      bags.push(
        b
          ? { slotIndex: i, bagId: b.bagId, name: itemDisplayName(b.bagId), slots: bagSlots(b.bagId) }
          : { slotIndex: i, bagId: null, name: null, slots: 0 },
      );
    }
    const capacity = bagCapacity(equipped.map((b) => b.bagId));
    const used = usedSlots(await this.stacks(characterId));
    return { slotCount: BAG_SLOT_COUNT, capacity, usedSlots: used, freeSlots: Math.max(0, capacity - used), bags };
  }
}
