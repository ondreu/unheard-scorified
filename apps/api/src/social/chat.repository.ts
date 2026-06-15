import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { ChatChannel } from '@game/shared';
import { DB, type Database } from '../db/db.module';
import { chatMessages, type ChatMessage, type NewChatMessage } from '../db/schema';

/**
 * Přístup k `chat_messages` (M9 social). Durable historie chatu; realtime
 * fan-out řeší gateway/relay. Stateless.
 */
@Injectable()
export class ChatRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async insert(data: NewChatMessage): Promise<ChatMessage> {
    const [row] = await this.db.insert(chatMessages).values(data).returning();
    return row!;
  }

  /** Posledních `limit` zpráv kanálu, vrácené chronologicky (nejstarší první). */
  async listRecent(channel: ChatChannel, limit: number): Promise<ChatMessage[]> {
    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.channel, channel))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
    return rows.reverse();
  }
}
