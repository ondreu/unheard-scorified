# ADR 0007 — PWA push notifikace & offline progress summary (M3)

**Status:** Accepted · **Datum:** 2026-06-14

## Kontext

M3 přidává Web Push notifikace (VAPID) a souhrn offline progresu při návratu hráče.
Rozhodnutí navazují na ADR 0002 (idle model) a ADR 0006 (aktivity a questing).

## Rozhodnutí

### 1. Push subscription per účet (ne per postava)

Jedno VAPID subscription je vázané na `account_id`. Notifikace obsahuje `characterId`,
aby klik navigoval na správnou postavu. Přidání per-postavové granularity (vypnout alts)
je follow-up úkol, architektura to umožňuje.

### 2. Tabulka `push_subscriptions`

Nová tabulka s FK na `accounts.id` (cascade delete). Klíče: `endpoint` (unikátní),
`p256dh_key`, `auth_key`. Jeden účet může mít více subscriptions (různé prohlížeče/zařízení) —
upsert podle `endpoint` je idempotentní.

### 3. `PushModule` jako samostatný NestJS modul

Push je infrastrukturní cross-cut záležitost (ne herní systém per se), ale drží se konvence
modularita → vlastní složka `src/push/`. `PushService` je exportován a importován do
`ActivityModule` (scheduler) i `AppModule`.

### 4. BullMQ worker rozšíření (best-effort)

`BullMqActivityScheduler` injektuje `PushService`, `CharacterRepository` a
`ActivityRepository`. Při spuštění jobu:

1. Najde postavu (`findById`) → `accountId`.
2. Zkontroluje, že aktivita stále existuje (nebyla mezidoby claimnutá).
3. Odešle push přes `PushService.sendToAccount`.

Push je best-effort: selhání neovlivní herní loop (odměny se počítají lazy při claimu).

### 5. Offline progress summary v `ClaimResult`

`claim()` vrací nové pole `offlineDurationSec` = počet sekund mezi dokončením aktivity
a claimem. Frontend zobrazí „🌙 Away for Xh Ym" pokud `offlineDurationSec > 60`.
Toto je „souhrn offline progresu" — hráč vidí kontext i bez push notifikace.

### 6. Service worker — `injectManifest` strategie

Přechod z `generateSW` na `injectManifest` v `@vite-pwa/sveltekit`. Vlastní service
worker `src/service-worker.ts` volá `workbox-precaching` a přidává handlery `push`
a `notificationclick`. Klik na notifikaci otevře/focusne záložku s postavou.

### 7. VAPID klíče

Dev klíče committed do konfigurace (jasně označené, bez bezpečnostního dopadu v dev).
Produkce: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` přes env.
Generování: `npx web-push generate-vapid-keys`.

## Důsledky

- `PushService.sendToAccount` automaticky smaže prošlé (410/404) subscriptions.
- HTTPS je podmínka Web Push API → pro produkci Caddy (HTTPS) povinný (zavedeno M0).
- `NoopActivityScheduler` (testy) nevyžaduje PushService — testy zůstávají bez Redisu.
- Integrační testy push service využívají pglite (in-memory Postgres) + `vi.mock('web-push')`.
