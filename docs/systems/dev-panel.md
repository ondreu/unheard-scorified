# Dev & Admin Panel

Interní nástroj pro vývojáře a moderátory. **Nikdy není součástí produkčního UI** pro hráče.

## Přístup

| Prostředí | URL | Heslo |
|---|---|---|
| Lokální dev (`pnpm dev`) | `http://localhost:5173/dev` | Jakékoliv neprázdné heslo (server ignoruje, `NODE_ENV=development`) |
| Staging / produkce | `https://<host>/dev` | Hodnota env proměnné `DEV_SECRET` na serveru |

Na stránce `/dev` se zobrazí přihlašovací formulář. Po přihlášení se secret uloží do `sessionStorage` a automaticky se přikládá jako `X-Dev-Secret` header ke všem `/dev/*` API voláním.

Plovoucí tlačítko `[DEV]` na character stránkách (`/characters/:id`) je viditelné jen při `import.meta.env.DEV` (lokální dev server) a volá stejné endpointy.

## Architektura

```
apps/api/src/dev/
  dev.guard.ts        — blokuje přístup bez platného DEV_SECRET (nebo NODE_ENV=development)
  dev.service.ts      — logika dev tools + moderace
  dev.controller.ts   — HTTP vrstva:
    DevAuthController   POST /dev/auth            — ověření hesla
    DevController       /dev/characters/:id/*     — dev tools per postava
    DevModController    /dev/mod/*                — moderace
  dev.module.ts       — importován v AppModule jen pokud NODE_ENV=development NEBO DEV_SECRET je set
  dto/dev.dto.ts      — DTO s validací

apps/web/src/
  routes/dev/+page.svelte   — admin panel (login + Dev Tools tab + Moderation tab)
  lib/DevPanel.svelte        — plovoucí panel na character stránkách (jen DEV build)
  lib/api.ts                 — devRequest() + všechny dev/mod API funkce
```

## Bezpečnost

- Backend: `DevGuard` kontroluje `X-Dev-Secret` header vůči `process.env.DEV_SECRET`. Pokud `DEV_SECRET` není nastaveno, povolí přístup pouze při `NODE_ENV=development` (produkční build bez `DEV_SECRET` je tedy zablokovaný automaticky).
- Frontend: `/dev` stránka není odkazována z žádné části UI. Plovoucí panel se renderuje jen ve vývojovém buildu (`import.meta.env.DEV`).
- Ban: `accounts.banned_at` timestamp. Přihlášení zabanovaného účtu vrátí `403 Forbidden`. Vyžaduje spuštění migrace `0008_useful_stingray.sql`.

## Dev Tools (per-postava)

| Endpoint | Popis |
|---|---|
| `GET /dev/characters/:id/state` | Aktuální level, XP, gold |
| `POST /dev/characters/:id/set-level` | Nastaví level (přepočítá totalXp) |
| `POST /dev/characters/:id/add-gold` | Přidá gold |
| `POST /dev/characters/:id/add-item` | Přidá item do inventáře (dle katalogu z `@game/shared`) |
| `POST /dev/characters/:id/complete-activity` | Posune `startAt` aktivity do minulosti → aktivita je okamžitě claimable |
| `POST /dev/characters/:id/time-warp` | Posune `startAt` o N hodin zpět (simulace idle progresu) |
| `POST /dev/characters/:id/set-profession` | Nastaví skill profese |
| `POST /dev/characters/:id/reset` | Reset postavy (XP=0, gold=0, inventář, equipment, talenty smazány) |

## Moderace

| Endpoint | Popis |
|---|---|
| `GET /dev/mod/accounts` | Seznam všech účtů s počtem postav a ban statusem |
| `POST /dev/mod/accounts/:id/ban` | Zabanuje účet |
| `POST /dev/mod/accounts/:id/unban` | Odbanuje účet |
| `DELETE /dev/mod/accounts/:id` | Smaže účet (cascade: všechny postavy a data) |
| `GET /dev/mod/characters/search?name=X` | Hledá postavu podle jména (ILIKE) |
| `GET /dev/mod/characters/:id/inspect` | Plný stav postavy: inventář, equipment, aktivita, profese |
| `DELETE /dev/mod/characters/:id` | Smaže postavu (cascade) |

## Konvence pro nové systémy

**Každý nový herní systém by měl mít odpovídající dev/mod akci v dev panelu.** Pravidlo:

1. **Dev akce** — pokud systém má stav, který chceš při vývoji rychle nastavit (skill, rating, progress, currency, buff...), přidej endpoint do `DevController` a sekci do `DevPanel.svelte`.
2. **Mod akce** — pokud systém generuje data vázaná na hráče (záznamy, zápisníky, historii, penalizace...), přidej inspect/reset endpoint do `DevModController` a zobraz je v Character Inspectoru.
3. **Životní cyklus aktivity** — každá nová idle aktivita (nový `activityType`) je automaticky pokrytá endpointem `complete-activity` (posune `startAt`) a `time-warp`. Není třeba nic přidávat.

Příklady pro budoucí milníky:
- **M8.5 wipe/retry** → dev akce: nastavit počet pokusů na dungeon run
- **M9 guildy** → mod akce: zobrazit členy guildy, smazat guildu
- **Soulbound itemy** → dev akce: přidat soulbound item přímo (bez loot rollu)
- **Arena rating** → dev akce: nastavit Elo rating postavy
