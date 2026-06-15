import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  VENDOR_STOCK,
  vendorBuyPrice,
  vendorSellPrice,
  isVendorSellable,
  isVendorStock,
  itemDisplayName,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryGrantService } from '../inventory/inventory-grant.service';

/** Položka v sortimentu vendora (k nákupu). */
export interface VendorStockView {
  itemId: string;
  name: string;
  price: number;
}

/** Položka inventáře, kterou lze prodat. */
export interface VendorSellView {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface VendorView {
  gold: number;
  stock: VendorStockView[];
  sellable: VendorSellView[];
}

@Injectable()
export class VendorService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly inventory: InventoryRepository,
    private readonly grant: InventoryGrantService,
  ) {}

  /** Panel vendora: gold + sortiment k nákupu + prodejné věci z inventáře. */
  async getVendor(accountId: string, characterId: string): Promise<VendorView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const stock: VendorStockView[] = VENDOR_STOCK.map((itemId) => ({
      itemId,
      name: itemDisplayName(itemId),
      price: vendorBuyPrice(itemId),
    }));

    const rows = await this.inventory.listInventory(characterId);
    const sellable: VendorSellView[] = rows
      .filter((r) => isVendorSellable(r.itemId))
      .map((r) => ({
        itemId: r.itemId,
        name: itemDisplayName(r.itemId),
        quantity: r.quantity,
        unitPrice: vendorSellPrice(r.itemId),
      }));

    return { gold: character.gold, stock, sellable };
  }

  /** Koupí `quantity` kusů itemu od vendora (gold sink). */
  async buy(
    accountId: string,
    characterId: string,
    itemId: string,
    quantity = 1,
  ): Promise<VendorView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('Invalid quantity');
    }
    if (!isVendorStock(itemId)) throw new BadRequestException('Vendor does not sell this item');

    // Nákup je player-akce → blokuje se při plném inventáři (žádný overflow).
    if (!(await this.grant.fits(characterId, [{ itemId, quantity }]))) {
      throw new BadRequestException('Not enough bag space');
    }

    const total = vendorBuyPrice(itemId) * quantity;
    const paid = await this.characters.spendGold(characterId, total);
    if (!paid) throw new BadRequestException('Not enough gold');

    await this.grant.grant(characterId, [{ itemId, quantity }]);
    return this.getVendor(accountId, characterId);
  }

  /** Prodá `quantity` kusů itemu vendorovi (gold source). */
  async sell(
    accountId: string,
    characterId: string,
    itemId: string,
    quantity = 1,
  ): Promise<VendorView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('Invalid quantity');
    }
    if (!isVendorSellable(itemId)) throw new BadRequestException('This item cannot be sold');

    const consumed = await this.inventory.consume(characterId, itemId, quantity);
    if (!consumed) throw new BadRequestException('Not enough of that item to sell');

    await this.characters.addGold(characterId, vendorSellPrice(itemId) * quantity);
    return this.getVendor(accountId, characterId);
  }
}
