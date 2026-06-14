import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { loadConfig } from '../config/config';
import { PushRepository } from './push.repository';

export interface PushNotificationPayload {
  title: string;
  body: string;
  characterId?: string;
}

export interface PushSubscriptionInput {
  accountId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Odesílání Web Push notifikací přes VAPID (M3).
 * Viz docs/adr/0007 a docs/systems/push-notifications.md.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly enabled: boolean;

  constructor(private readonly repo: PushRepository) {
    const cfg = loadConfig();
    this.enabled = Boolean(cfg.vapidPublicKey && cfg.vapidPrivateKey);
    if (this.enabled) {
      webpush.setVapidDetails(cfg.vapidEmail, cfg.vapidPublicKey, cfg.vapidPrivateKey);
    } else {
      this.logger.warn('VAPID klíče nejsou nastaveny — push notifikace jsou vypnuté.');
    }
  }

  async subscribe(input: PushSubscriptionInput): Promise<void> {
    await this.repo.upsert({
      accountId: input.accountId,
      endpoint: input.endpoint,
      p256dhKey: input.p256dh,
      authKey: input.auth,
    });
  }

  async unsubscribe(endpoint: string): Promise<void> {
    await this.repo.deleteByEndpoint(endpoint);
  }

  getVapidPublicKey(): string {
    return loadConfig().vapidPublicKey;
  }

  /** Odešle notifikaci všem subscriptions daného účtu. Prošlé (410) automaticky smaže. */
  async sendToAccount(accountId: string, payload: PushNotificationPayload): Promise<void> {
    if (!this.enabled) return;

    const subs = await this.repo.listByAccount(accountId);
    if (subs.length === 0) return;

    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dhKey, auth: sub.authKey } },
            body,
          );
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 410 || status === 404) {
            // Subscription expirovala — odstraníme ji.
            await this.repo.deleteByEndpoint(sub.endpoint).catch(() => undefined);
          } else {
            this.logger.warn(`Push selhal pro ${sub.endpoint.slice(0, 40)}…: ${String(err)}`);
          }
        }
      }),
    );
  }
}
