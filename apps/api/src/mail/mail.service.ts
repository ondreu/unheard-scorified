import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { canTradeItem, itemDisplayName } from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { MailRepository } from './mail.repository';

/** Příloha pošty ve view. */
export interface MailItemView {
  itemId: string;
  name: string;
  quantity: number;
}

export interface MailView {
  id: string;
  fromName: string;
  fromCharacterId: string | null;
  subject: string;
  body: string;
  gold: number;
  items: MailItemView[];
  read: boolean;
  claimed: boolean;
  /** Má nevyzvednuté přílohy (zlato/itemy)? */
  hasAttachments: boolean;
  sentAt: string;
}

export interface Mailbox {
  mail: MailView[];
  unread: number;
}

/** Max počet item-příloh na jednu zprávu. */
export const MAX_MAIL_ATTACHMENTS = 6;

/**
 * Pošta (M9). Offline-doručitelné zprávy + přílohy (itemy/zlato) jako alternativa
 * k online-only whisperu. Itemy/zlato se při odeslání eskrují ze sendera a příjemce
 * si je vyzvedne. Stateless, server-authoritative.
 */
@Injectable()
export class MailService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly inventory: InventoryRepository,
    private readonly mail: MailRepository,
  ) {}

  private async own(accountId: string, characterId: string): Promise<void> {
    const char = await this.characters.findOwned(accountId, characterId);
    if (!char) throw new NotFoundException('Character not found');
  }

  async getMailbox(accountId: string, characterId: string): Promise<Mailbox> {
    await this.own(accountId, characterId);
    const rows = await this.mail.listInbox(characterId);
    const views: MailView[] = [];
    for (const m of rows) {
      const items = await this.mail.listItems(m.id);
      const itemViews = items.map((i) => ({
        itemId: i.itemId,
        name: itemDisplayName(i.itemId),
        quantity: i.quantity,
      }));
      const hasAttachments = !m.claimed && (m.gold > 0 || itemViews.length > 0);
      views.push({
        id: m.id,
        fromName: m.fromName,
        fromCharacterId: m.fromCharacterId,
        subject: m.subject,
        body: m.body,
        gold: m.gold,
        items: itemViews,
        read: m.readAt !== null,
        claimed: m.claimed,
        hasAttachments,
        sentAt: m.createdAt.toISOString(),
      });
    }
    const unread = views.filter((v) => !v.read).length;
    return { mail: views, unread };
  }

  async unreadCount(accountId: string, characterId: string): Promise<number> {
    await this.own(accountId, characterId);
    return this.mail.countUnread(characterId);
  }

  async send(
    accountId: string,
    fromCharacterId: string,
    toName: string,
    subject: string,
    body: string,
    attachments: { itemId: string; quantity: number }[],
    gold: number,
  ): Promise<{ sent: true }> {
    const sender = await this.characters.findOwned(accountId, fromCharacterId);
    if (!sender) throw new NotFoundException('Character not found');

    const cleanSubject = subject.trim().slice(0, 64);
    if (!cleanSubject) throw new BadRequestException('Subject is required');
    const cleanBody = body.trim().slice(0, 512);

    const target = await this.characters.findByName(toName.trim());
    if (!target) throw new NotFoundException('No character with that name');
    if (target.id === fromCharacterId) throw new BadRequestException('You cannot mail yourself');

    if (gold < 0) throw new BadRequestException('Invalid gold amount');
    if (attachments.length > MAX_MAIL_ATTACHMENTS) {
      throw new BadRequestException(`Up to ${MAX_MAIL_ATTACHMENTS} item stacks per mail`);
    }

    // Validace všech příloh před jakoukoli mutací (itemy musí jít obchodovat a být skladem).
    for (const a of attachments) {
      if (a.quantity <= 0) throw new BadRequestException('Invalid attachment quantity');
      if (!canTradeItem(a.itemId)) {
        throw new BadRequestException(`${itemDisplayName(a.itemId)} cannot be mailed`);
      }
      const have = await this.inventory.getQuantity(fromCharacterId, a.itemId);
      if (have < a.quantity) {
        throw new BadRequestException(`Not enough ${itemDisplayName(a.itemId)} to attach`);
      }
    }

    // Escrow: nejdřív itemy (s rollbackem), pak zlato.
    const consumed: { itemId: string; quantity: number }[] = [];
    for (const a of attachments) {
      const ok = await this.inventory.consume(fromCharacterId, a.itemId, a.quantity);
      if (!ok) {
        for (const c of consumed) await this.inventory.addItemQty(fromCharacterId, c.itemId, c.quantity);
        throw new BadRequestException(`Not enough ${itemDisplayName(a.itemId)} to attach`);
      }
      consumed.push(a);
    }
    if (gold > 0) {
      const paid = await this.characters.spendGold(fromCharacterId, gold);
      if (!paid) {
        for (const c of consumed) await this.inventory.addItemQty(fromCharacterId, c.itemId, c.quantity);
        throw new BadRequestException('Not enough gold to attach');
      }
    }

    const created = await this.mail.createMail({
      toCharacterId: target.id,
      fromCharacterId: sender.id,
      fromName: sender.name,
      subject: cleanSubject,
      body: cleanBody,
      gold,
    });
    for (const a of attachments) await this.mail.addItem(created.id, a.itemId, a.quantity);

    return { sent: true };
  }

  async read(accountId: string, characterId: string, mailId: string): Promise<Mailbox> {
    await this.own(accountId, characterId);
    const m = await this.requireOwnMail(characterId, mailId);
    if (m.readAt === null) await this.mail.markRead(m.id);
    return this.getMailbox(accountId, characterId);
  }

  /** Vyzvedne přílohy (zlato + itemy) do inventáře. */
  async claim(accountId: string, characterId: string, mailId: string): Promise<Mailbox> {
    await this.own(accountId, characterId);
    const m = await this.requireOwnMail(characterId, mailId);
    if (m.claimed) throw new BadRequestException('Already claimed');

    const items = await this.mail.listItems(m.id);
    for (const it of items) await this.inventory.addItemQty(characterId, it.itemId, it.quantity);
    if (m.gold > 0) await this.characters.addGold(characterId, m.gold);
    await this.mail.markClaimed(m.id);
    if (m.readAt === null) await this.mail.markRead(m.id);
    return this.getMailbox(accountId, characterId);
  }

  async remove(accountId: string, characterId: string, mailId: string): Promise<Mailbox> {
    await this.own(accountId, characterId);
    const m = await this.requireOwnMail(characterId, mailId);
    if (!m.claimed && (m.gold > 0 || (await this.mail.listItems(m.id)).length > 0)) {
      throw new BadRequestException('Claim the attachments before deleting');
    }
    await this.mail.deleteMail(m.id);
    return this.getMailbox(accountId, characterId);
  }

  private async requireOwnMail(characterId: string, mailId: string) {
    const m = await this.mail.findMail(mailId);
    if (!m || m.toCharacterId !== characterId) throw new NotFoundException('Mail not found');
    return m;
  }
}
