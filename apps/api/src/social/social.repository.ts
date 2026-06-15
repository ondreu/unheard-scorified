import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { friendships, type Friendship } from '../db/schema';

/**
 * Přístup k tabulce `friendships` (M9 social). Vztah je jeden řádek (requester ↔
 * addressee), proto se „mezi A a B" hledá v obou směrech. Stateless — žádný
 * per-proces stav (viz ADR 0003).
 */
@Injectable()
export class SocialRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Vztah mezi dvěma postavami (v jakémkoli směru), pokud existuje. */
  async findBetween(a: string, b: string): Promise<Friendship | undefined> {
    const [row] = await this.db
      .select()
      .from(friendships)
      .where(
        or(
          and(
            eq(friendships.requesterCharacterId, a),
            eq(friendships.addresseeCharacterId, b),
          ),
          and(
            eq(friendships.requesterCharacterId, b),
            eq(friendships.addresseeCharacterId, a),
          ),
        ),
      )
      .limit(1);
    return row;
  }

  async findById(id: string): Promise<Friendship | undefined> {
    const [row] = await this.db.select().from(friendships).where(eq(friendships.id, id)).limit(1);
    return row;
  }

  /** Přijatá přátelství dané postavy (obě strany vztahu). */
  listAccepted(characterId: string): Promise<Friendship[]> {
    return this.db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.status, 'accepted'),
          or(
            eq(friendships.requesterCharacterId, characterId),
            eq(friendships.addresseeCharacterId, characterId),
          ),
        ),
      );
  }

  /** Příchozí žádosti (postava je addressee a stav je pending). */
  listIncoming(characterId: string): Promise<Friendship[]> {
    return this.db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.addresseeCharacterId, characterId),
          eq(friendships.status, 'pending'),
        ),
      );
  }

  /** Odeslané žádosti (postava je requester a stav je pending). */
  listOutgoing(characterId: string): Promise<Friendship[]> {
    return this.db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.requesterCharacterId, characterId),
          eq(friendships.status, 'pending'),
        ),
      );
  }

  /** Počet přijatých přátel (pro limit MAX_FRIENDS). */
  async countAccepted(characterId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(friendships)
      .where(
        and(
          eq(friendships.status, 'accepted'),
          or(
            eq(friendships.requesterCharacterId, characterId),
            eq(friendships.addresseeCharacterId, characterId),
          ),
        ),
      );
    return row?.count ?? 0;
  }

  async create(
    requesterCharacterId: string,
    addresseeCharacterId: string,
    status: 'pending' | 'accepted',
  ): Promise<Friendship> {
    const [row] = await this.db
      .insert(friendships)
      .values({
        requesterCharacterId,
        addresseeCharacterId,
        status,
        respondedAt: status === 'accepted' ? new Date() : null,
      })
      .returning();
    return row!;
  }

  /** Potvrdí žádost (pending → accepted). */
  async accept(id: string): Promise<void> {
    await this.db
      .update(friendships)
      .set({ status: 'accepted', respondedAt: new Date() })
      .where(eq(friendships.id, id));
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(friendships).where(eq(friendships.id, id));
  }

  /** Smaže vztah mezi dvěma postavami (v jakémkoli směru). */
  async deleteBetween(a: string, b: string): Promise<void> {
    await this.db
      .delete(friendships)
      .where(
        or(
          and(
            eq(friendships.requesterCharacterId, a),
            eq(friendships.addresseeCharacterId, b),
          ),
          and(
            eq(friendships.requesterCharacterId, b),
            eq(friendships.addresseeCharacterId, a),
          ),
        ),
      );
  }
}
