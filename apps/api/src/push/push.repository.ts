import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { pushSubscriptions, type NewPushSubscription, type PushSubscription } from '../db/schema';

@Injectable()
export class PushRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async upsert(data: NewPushSubscription): Promise<PushSubscription> {
    const [row] = await this.db
      .insert(pushSubscriptions)
      .values(data)
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { accountId: data.accountId, p256dhKey: data.p256dhKey, authKey: data.authKey },
      })
      .returning();
    return row!;
  }

  deleteByEndpoint(endpoint: string): Promise<void> {
    return this.db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .then(() => undefined);
  }

  listByAccount(accountId: string): Promise<PushSubscription[]> {
    return this.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.accountId, accountId));
  }
}
