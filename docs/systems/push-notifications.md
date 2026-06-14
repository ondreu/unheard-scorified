# Push notifikace & offline progress summary (M3)

Detailní specifikace viz `docs/adr/0007-push-notifications.md`.

## Architektura

```
Browser                     API                          Redis/BullMQ
  │                           │                               │
  │  POST /push/subscribe      │                               │
  │─────────────────────────► │ push_subscriptions (DB)       │
  │                           │                               │
  │  POST /characters/*/activity (start quest)                │
  │─────────────────────────► │────── schedule(delay) ───────►│
  │                           │                               │
  │  (app closed)             │         job fires ────────────┤
  │                           │◄──────────────────────────────│
  │                           │  findById(charId)             │
  │◄── push notification ─────│  sendNotification (web-push)  │
  │                           │                               │
  │  (user opens app, clicks) │                               │
  │  POST .../activity/claim  │                               │
  │─────────────────────────► │ ClaimResult { offlineDurationSec }
  │◄──────────────────────────│                               │
  │  🌙 Away for 2h 15m       │                               │
```

## API endpointy

| Method | Path | Auth | Popis |
|--------|------|------|-------|
| `GET` | `/push/vapid-public-key` | Ne | VAPID public key pro `PushManager.subscribe()` |
| `POST` | `/push/subscribe` | Ano | Uloží/aktualizuje push subscription |
| `DELETE` | `/push/subscribe` | Ano | Odstraní push subscription |

### POST /push/subscribe — tělo
```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
```

## Notifikační payload (push message)
```json
{
  "title": "Quest Complete!",
  "body": "Feanor has finished \"Kobold Culling\". Return to claim your rewards.",
  "characterId": "uuid"
}
```

## ClaimResult rozšíření
```ts
interface ClaimResult {
  reward: { xp: number; gold: number };
  levelBefore: number;
  levelAfter: number;
  leveledUp: boolean;
  levelsGained: number;
  character: CharacterView;
  offlineDurationSec: number; // 0 = okamžitý claim, >0 = offline progres
}
```

## Konfigurace (env)

| Proměnná | Popis | Výchozí (dev) |
|----------|-------|---------------|
| `VAPID_PUBLIC_KEY` | VAPID public key (base64url) | Dev klíč |
| `VAPID_PRIVATE_KEY` | VAPID private key (base64url) | Dev klíč |
| `VAPID_EMAIL` | Mailto pro VAPID sub claim | `mailto:admin@afkto60.local` |

Generování nových klíčů pro produkci:
```bash
npx web-push generate-vapid-keys
```

## Bezpečnost

- Subscriptions jsou vázány na autentizovaný účet (Bearer token).
- Prošlé subscriptions (HTTP 410/404 od push serveru) jsou automaticky mazány.
- VAPID zaručuje, že notifikace může odesílat pouze server s privátním klíčem.
- HTTPS je povinné pro Web Push API (zajišťuje Caddy v produkci).
