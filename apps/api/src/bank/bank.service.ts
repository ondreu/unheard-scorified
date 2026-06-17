import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  bankCapacity,
  itemDisplayName,
  planGrant,
  usedSlots,
  type InvStack,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryGrantService } from '../inventory/inventory-grant.service';
import { BankRepository } from './bank.repository';

export interface BankItemView {
  itemId: string;
  name: string;
  quantity: number;
}

export interface BankView {
  items: BankItemView[];
  usedSlots: number;
  capacity: number;
}

/**
 * Banka (M10+ FEAT) — úložiště mimo batoh. Deposit přesune item z inventáře do
 * banky (uvolní bag sloty), withdraw zpět (blokuje se při plném batohu, stejně
 * jako ostatní player-akce). Kapacita banky je vlastní (`BASE_BANK_SLOTS`).
 */
@Injectable()
export class BankService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly inventory: InventoryRepository,
    private readonly grant: InventoryGrantService,
    private readonly bank: BankRepository,
  ) {}

  /** Stav banky (itemy + obsazenost). */
  async getBank(accountId: string, characterId: string): Promise<BankView> {
    await this.ownedOrThrow(accountId, characterId);
    return this.viewFor(characterId);
  }

  /** Uloží `quantity` kusů itemu z inventáře do banky. */
  async deposit(
    accountId: string,
    characterId: string,
    itemId: string,
    quantity: number,
  ): Promise<BankView> {
    await this.ownedOrThrow(accountId, characterId);
    const qty = this.validQty(quantity);

    if ((await this.inventory.getQuantity(characterId, itemId)) < qty) {
      throw new BadRequestException('Not enough of that item in your inventory');
    }
    // Vejde se do banky? (stack-aware kapacita)
    const current = await this.bankStacks(characterId);
    const plan = planGrant(current, bankCapacity(), [{ itemId, quantity: qty }]);
    if (plan.overflow.length > 0) throw new BadRequestException('Your bank is full');

    if (!(await this.inventory.consume(characterId, itemId, qty))) {
      throw new BadRequestException('Not enough of that item in your inventory');
    }
    await this.bank.addItemQty(characterId, itemId, qty);
    return this.viewFor(characterId);
  }

  /** Vybere `quantity` kusů itemu z banky zpět do inventáře. */
  async withdraw(
    accountId: string,
    characterId: string,
    itemId: string,
    quantity: number,
  ): Promise<BankView> {
    await this.ownedOrThrow(accountId, characterId);
    const qty = this.validQty(quantity);

    if ((await this.bank.getQuantity(characterId, itemId)) < qty) {
      throw new BadRequestException('Not enough of that item in your bank');
    }
    // Vejde se do batohu? (player-akce → blok při plném, žádný overflow do pošty)
    if (!(await this.grant.fits(characterId, [{ itemId, quantity: qty }]))) {
      throw new BadRequestException('Not enough bag space — free up your bags first');
    }

    if (!(await this.bank.consume(characterId, itemId, qty))) {
      throw new BadRequestException('Not enough of that item in your bank');
    }
    await this.inventory.addItemQty(characterId, itemId, qty);
    return this.viewFor(characterId);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async ownedOrThrow(accountId: string, characterId: string): Promise<void> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
  }

  private validQty(quantity: number): number {
    const qty = Math.floor(quantity);
    if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException('Quantity must be positive');
    return qty;
  }

  private async bankStacks(characterId: string): Promise<InvStack[]> {
    const rows = await this.bank.list(characterId);
    return rows.map((r) => ({ itemId: r.itemId, quantity: r.quantity }));
  }

  private async viewFor(characterId: string): Promise<BankView> {
    const stacks = await this.bankStacks(characterId);
    const items: BankItemView[] = stacks
      .map((s) => ({ itemId: s.itemId, name: itemDisplayName(s.itemId), quantity: s.quantity }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { items, usedSlots: usedSlots(stacks), capacity: bankCapacity() };
  }
}
