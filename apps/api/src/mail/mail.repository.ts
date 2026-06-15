import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { mail, mailItems, type Mail, type MailItem, type NewMail } from '../db/schema';

/**
 * Perzistence pošty (M9). Stateless. Vyšší logika (escrow itemů/zlata, vyzvednutí)
 * žije v `MailService`.
 */
@Injectable()
export class MailRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async createMail(data: NewMail): Promise<Mail> {
    const [row] = await this.db.insert(mail).values(data).returning();
    return row!;
  }

  async addItem(mailId: string, itemId: string, quantity: number): Promise<void> {
    await this.db.insert(mailItems).values({ mailId, itemId, quantity });
  }

  listInbox(toCharacterId: string): Promise<Mail[]> {
    return this.db
      .select()
      .from(mail)
      .where(eq(mail.toCharacterId, toCharacterId))
      .orderBy(desc(mail.createdAt));
  }

  listItems(mailId: string): Promise<MailItem[]> {
    return this.db.select().from(mailItems).where(eq(mailItems.mailId, mailId));
  }

  async findMail(id: string): Promise<Mail | undefined> {
    const [row] = await this.db.select().from(mail).where(eq(mail.id, id)).limit(1);
    return row;
  }

  async markRead(id: string): Promise<void> {
    await this.db.update(mail).set({ readAt: new Date() }).where(eq(mail.id, id));
  }

  async markClaimed(id: string): Promise<void> {
    await this.db.update(mail).set({ claimed: true }).where(eq(mail.id, id));
  }

  async deleteMail(id: string): Promise<void> {
    await this.db.delete(mail).where(eq(mail.id, id));
  }

  async countUnread(toCharacterId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(mail)
      .where(and(eq(mail.toCharacterId, toCharacterId), sql`${mail.readAt} is null`));
    return row?.count ?? 0;
  }
}
