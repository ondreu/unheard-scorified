import { Injectable } from '@nestjs/common';
import { bagCapacity, planGrant, type InvStack } from '@game/shared';
import { InventoryRepository } from './inventory.repository';
import { BagRepository } from './bag.repository';
import { MailRepository } from '../mail/mail.repository';

/** Max počet item-příloh na jednu zprávu (sjednoceno s MailService). */
const MAX_MAIL_ATTACHMENTS = 6;

export interface GrantResult {
  /** Co se reálně přidalo do inventáře. */
  added: InvStack[];
  /** Co se nevešlo a šlo poštou (vanilla overflow). */
  overflow: InvStack[];
}

/**
 * Centrální choke-point pro **přidávání itemů** do inventáře (M10 limited
 * inventory). Respektuje kapacitu (základní batoh + vložené batohy); co se
 * nevejde, pošle **systémovou poštou** (rozhodnutí PM: vanilla overflow). Všechny
 * idle reward/transfer cesty (quest/dungeon/raid loot, aukce, trade) jdou skrz
 * `grant`, aby chování bylo jednotné a na jednom místě.
 */
@Injectable()
export class InventoryGrantService {
  constructor(
    private readonly inventory: InventoryRepository,
    private readonly bags: BagRepository,
    private readonly mail: MailRepository,
  ) {}

  private async capacity(characterId: string): Promise<number> {
    return bagCapacity(await this.bags.equippedBagIds(characterId));
  }

  private async currentStacks(characterId: string): Promise<InvStack[]> {
    const rows = await this.inventory.listInventory(characterId);
    return rows.map((r) => ({ itemId: r.itemId, quantity: r.quantity }));
  }

  /** Přidá itemy; přebytek nad kapacitu doručí poštou. */
  async grant(characterId: string, items: InvStack[]): Promise<GrantResult> {
    const incoming = items.filter((i) => i.quantity > 0);
    if (incoming.length === 0) return { added: [], overflow: [] };

    const current = await this.currentStacks(characterId);
    const plan = planGrant(current, await this.capacity(characterId), incoming);

    for (const a of plan.add) await this.inventory.addItemQty(characterId, a.itemId, a.quantity);
    if (plan.overflow.length > 0) await this.overflowToMail(characterId, plan.overflow);

    return { added: plan.add, overflow: plan.overflow };
  }

  /** Jednorázová pomůcka pro jeden item. */
  grantOne(characterId: string, itemId: string, quantity = 1): Promise<GrantResult> {
    return this.grant(characterId, [{ itemId, quantity }]);
  }

  /** Vejde se `items` celé do inventáře (bez overflow)? Pro player-akce. */
  async fits(characterId: string, items: InvStack[]): Promise<boolean> {
    const current = await this.currentStacks(characterId);
    const plan = planGrant(current, await this.capacity(characterId), items);
    return plan.overflow.length === 0;
  }

  private async overflowToMail(characterId: string, overflow: InvStack[]): Promise<void> {
    for (let i = 0; i < overflow.length; i += MAX_MAIL_ATTACHMENTS) {
      const chunk = overflow.slice(i, i + MAX_MAIL_ATTACHMENTS);
      const created = await this.mail.createMail({
        toCharacterId: characterId,
        fromCharacterId: null,
        fromName: 'Courier',
        subject: 'Items from your travels',
        body: 'Your bags were full, so these were sent by courier. Free up space and claim them.',
        gold: 0,
      });
      for (const it of chunk) await this.mail.addItem(created.id, it.itemId, it.quantity);
    }
  }
}
