import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { PushRepository } from './push.repository';
import { PushService } from './push.service';

// Mockujeme web-push, ať testy neposílají skutečné HTTP požadavky.
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('PushService', () => {
  let db: Database;
  let repo: PushRepository;
  let service: PushService;
  let accountId: string;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    // Vytvoříme testovací účet (FK constraint na push_subscriptions.account_id).
    const auth = new AuthService(db, new JwtService());
    const tokens = await auth.register('pushtest', 'password123');
    // Načteme account_id z tokenu (sub claim)
    const me = auth.verifyAccessToken(tokens.accessToken);
    accountId = me.sub;

    repo = new PushRepository(db);
  });

  beforeEach(() => {
    service = new PushService(repo);
  });

  it('subscribe uloží subscription do DB', async () => {
    await service.subscribe({
      accountId,
      endpoint: 'https://push.example.com/sub/abc',
      p256dh: 'p256dh-key',
      auth: 'auth-key',
    });

    const subs = await repo.listByAccount(accountId);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.endpoint).toBe('https://push.example.com/sub/abc');
    expect(subs[0]!.accountId).toBe(accountId);
  });

  it('subscribe stejného endpointu je idempotentní (upsert)', async () => {
    await service.subscribe({
      accountId,
      endpoint: 'https://push.example.com/sub/abc',
      p256dh: 'p256dh-key-v2',
      auth: 'auth-key-v2',
    });

    const subs = await repo.listByAccount(accountId);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.p256dhKey).toBe('p256dh-key-v2');
  });

  it('unsubscribe odstraní subscription', async () => {
    await service.unsubscribe('https://push.example.com/sub/abc');

    const subs = await repo.listByAccount(accountId);
    expect(subs).toHaveLength(0);
  });

  it('sendToAccount nevolá webpush bez subscriptions', async () => {
    const webpush = await import('web-push');
    const sendSpy = vi.spyOn(webpush.default, 'sendNotification');

    await service.sendToAccount(accountId, { title: 'Test', body: 'Hello' });

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('sendToAccount zavolá webpush pro každou subscription', async () => {
    await service.subscribe({
      accountId,
      endpoint: 'https://push.example.com/sub/x1',
      p256dh: 'key1',
      auth: 'auth1',
    });
    await service.subscribe({
      accountId,
      endpoint: 'https://push.example.com/sub/x2',
      p256dh: 'key2',
      auth: 'auth2',
    });

    const webpush = await import('web-push');
    const sendSpy = vi
      .spyOn(webpush.default, 'sendNotification')
      .mockResolvedValue(undefined as never);

    await service.sendToAccount(accountId, {
      title: 'Quest Complete!',
      body: 'You finished a quest.',
      characterId: 'char-123',
    });

    expect(sendSpy).toHaveBeenCalledTimes(2);
  });

  it('sendToAccount smaže prošlé subscriptions (410)', async () => {
    const webpush = await import('web-push');
    vi.spyOn(webpush.default, 'sendNotification').mockRejectedValue(
      Object.assign(new Error('Gone'), { statusCode: 410 }),
    );

    await service.sendToAccount(accountId, { title: 'Test', body: 'x' });

    const subs = await repo.listByAccount(accountId);
    expect(subs).toHaveLength(0);
  });
});
