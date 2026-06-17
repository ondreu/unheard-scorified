import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { ChatChannel } from '@game/shared';
import { DB, type Database } from '../db/db.module';
import { chatMessages, type ChatMessage, type NewChatMessage } from '../db/schema';

/**
 * Přístup k `chat_messages` (M9 social). Durable historie chatu; realtime
 * fan-out řeší gateway/relay. Stateless.
 *
 * Scope (M9 chat overhaul): `scopeId` odděluje historii scoped kanálů (guild =
 * guildId). Pro `global` je `scopeId = null`.
 */
@Injectable()
export class ChatRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async insert(data: NewChatMessage): Promise<ChatMessage> {
    const [row] = await this.db.insert(chatMessages).values(data).returning();
    return row!;
  }

  /**
   * Posledních `limit` zpráv kanálu (a daného scope), vrácené chronologicky
   * (nejstarší první). `scopeId = null` → globální historie (přesný match na NULL).
   */
  async listRecent(
    channel: ChatChannel,
    scopeId: string | null,
    limit: number,
  ): Promise<ChatMessage[]> {
    const scopeFilter =
      scopeId === null ? isNull(chatMessages.scopeId) : eq(chatMessages.scopeId, scopeId);
    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.channel, channel), scopeFilter))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
    return rows.reverse();
  }
}
