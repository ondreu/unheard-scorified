# Plán: Idle RPG (WoW-inspired) — kompletní roadmapa

> Living document. Po každém milníku se aktualizuje (odškrtnutí hotového, doplnění detailů další fáze).
> Toto je **single source of truth** roadmapy projektu.

## Context

Cílem je webová **idle RPG hra inspirovaná vanilla World of Warcraft**:

- Primárně **textová**, místy oživená **pixel art** grafikou.
- **Idle** design — hráč kontroluje jen párkrát denně, ale dá se hrát i ~10 min v kuse.
- Běží na **vlastním Dockeru**, instalovatelná na telefon jako **PWA** s **push notifikacemi**.
- **Singleplayer-first** s multiplayer prvky: Arény = MP PVP, Dungeony = SP PVE, Raidy = MP PVE. Vše idle, minimální nutná interakce.
- Systémy à la vanilla WoW: leveling, talenty, gear/equipment, postupné odemykání contentu (dungeony/raidy na úrovních), základní rasy a classy, filler aktivity (questing, profese) za XP a zlato.

Toto je **velmi velký, vícesezónní projekt**. Implementace probíhá inkrementálně po milnících (viz Roadmapa).

---

## Vize hry v kostce

| Aspekt          | Rozhodnutí                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Žánr            | Idle / incremental RPG s WoW-style progresí                                                                                                    |
| Smyčka          | Pošli postavu na aktivitu (quest/profese/dungeon) → běží na pozadí v reálném čase → vrať se, vyber odměny, přehoď gear/talenty, pošli na další |
| Interakce       | "Set & forget" aktivity (hodiny) + krátké "active" sezení (10 min): správa gearu, talentů, AH, výběr dalších aktivit                           |
| Offline progres | Server dopočítá co se stalo, když hráč nebyl ve hře (server-authoritative)                                                                     |
| Estetika        | Tmavé fantasy UI, převážně text + tabulky, pixel art portréty/itemy/zóny pro oživení                                                           |

---

## Klíčová rozhodnutí PM (potvrzeno) & průřezové principy

Tato rozhodnutí platí napříč všemi fázemi a jsou pro projekt závazná:

1. **Vývoj řízený AI — agent-first kódová báze.** Celý projekt staví AI agenti; PM (uživatel) zadává směr a schvaluje. Kódová báze proto MUSÍ být optimalizovaná pro to, aby na ní mohli **různí agenti pohodlně a nezávisle pracovat** (viz sekce „Vývoj řízený AI" níže). To je tvrdý požadavek, ne nice-to-have.
2. **Škálovatelnost od základu.** Stateless API (horizontální škálování za load balancerem), stav výhradně v Postgres/Redis, žádný in-memory stav vázaný na jeden proces. Herní simulace, fronty (BullMQ) a WebSocket vrstva navržené tak, aby šly škálovat na víc instancí (Redis pub/sub adaptér, sticky sessions / shared adapter). Datový model a moduly připravené na růst contentu i hráčů.
3. **Level cap 60, ale velmi pomalý.** XP křivka záměrně „long-haul" — dosažení 60 má trvat dlouho a být hlavní dlouhodobou metou. Křivka jako laditelný parametr v `packages/shared`.
4. **Frakce zatím jen kosmetické.** Aliance/Horda = vizuál + lore, žádné herní/MP dělení. Architektura ale nesmí znemožnit pozdější herní rozdělení (frakce jako data atribut, ne natvrdo zadrátovaná logika).
5. **Monetizace later, ale připravená teď.** Zatím čistě osobní projekt bez plateb. Návrh ale musí umožnit pozdější **prodej kosmetiky (skiny)**: od začátku oddělit **kosmetickou vrstvu** (skiny, vizuální varianty) od herních statů → cosmetic je samostatná entita/ownership, nikdy nedává power. Tím půjde monetizaci doplnit bez refaktoru jádra.

---

## Technologický stack

Zvolen **full-stack TypeScript monorepo** — jeden jazyk pro backend, frontend i sdílené herní typy/vzorce, což je u hry s mnoha provázanými systémy klíčové (combat vzorce, item staty a balanc musí být identické na FE i BE).

| Vrstva                    | Volba                                                                                                               | Proč                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo                  | **pnpm workspaces + Turborepo**                                                                                     | Sdílení `packages/shared` (typy, herní vzorce, konstanty) mezi BE a FE                                                                                      |
| Backend                   | **NestJS** (Fastify adapter), TypeScript                                                                            | Modulární architektura DI — každý herní systém = vlastní modul. Škáluje na velký projekt.                                                                   |
| Databáze                  | **PostgreSQL** + **Drizzle ORM**                                                                                    | Relační data (postavy, gear, inventář, leaderboardy). Drizzle = SQL-first, type-safe, lehké migrace                                                         |
| Cache / realtime / fronty | **Redis**                                                                                                           | Game state cache, pub/sub pro WebSocket fan-out, **BullMQ** fronty pro plánované dokončení aktivit a odeslání push notifikací, sorted-sets pro leaderboardy |
| Realtime                  | **WebSocket** (NestJS Gateway / `ws`)                                                                               | Live update probíhajícího dungeonu/raidu/arény, chat                                                                                                        |
| Frontend                  | **SvelteKit** + **TailwindCSS**                                                                                     | Lehký, ideální pro převážně textové UI; výborná PWA podpora                                                                                                 |
| Pixel grafika             | **PixiJS** (canvas) v izolovaných komponentách                                                                      | Pro zóny/combat scénky/sprite animace; zbytek UI zůstává HTML/text                                                                                          |
| PWA + notifikace          | `vite-plugin-pwa` (service worker) + **Web Push API** (VAPID)                                                       | Instalace na telefon, push i když je app zavřená                                                                                                            |
| Auth                      | JWT (access + refresh)                                                                                              | Jednoduché účty (username/email + heslo); MP funkce vyžadují identitu                                                                                       |
| Deploy                    | **docker-compose**: `api` + `web` + `postgres` + `redis` + reverzní proxy (Caddy s HTTPS — Web Push HTTPS vyžaduje) | Běží na uživatelově Dockeru                                                                                                                                 |
| Grafické assety           | **Free CC0 / itch.io pixel art packy** jako placeholdery; vlastní grafika později                                   |                                                                                                                                                             |

---

## Idle & real-time model (jádro hry)

**Server-authoritative s lazy + tick hybridem:**

1. **Aktivita má začátek a deterministický průběh.** Postava dostane aktivitu (např. "Quest X na 2h"). Uloží se `start_at`, `activity_type`, parametry. Není potřeba neustále počítat.
2. **Lazy dopočet při čtení / přihlášení.** Když hráč otevře app, server podle uplynulého času deterministicky spočítá výsledek (získané XP, loot, postup) — řeší offline progres bez stálé zátěže.
3. **BullMQ scheduled jobs** pro okamžiky, které musí "nastat" i bez hráče: dokončení aktivity → vygeneruje odměny → pošle **push notifikaci**.
4. **Server tick loop** jen pro _živé_ události vyžadující průběžný update (probíhající dungeon/raid/arena boj, regenerace, world eventy) — tick každých N s, výsledky přes WebSocket pub/sub. Boj je idle/auto-resolve (auto-attack + cooldowny dle talentů/gearu).
5. **Multiplayer matchmaking** (Areny/Raidy): fronta v Redisu, server spáruje hráče, spustí deterministicky simulovaný boj, výsledek + odměny + rating.

Determinismus (seedovaný RNG) umožní reprodukovat výsledek a validovat na serveru → anti-cheat a konzistence FE/BE.

---

## Herní systémy (WoW-inspirované) — přehled

Detailní specifikace (vzorce, kompletní seznamy) vzniknou v příslušné fázi a žijí v `docs/systems/`.

- **Rasy** (vanilla-style): Aliance — Human, Dwarf, Night Elf, Gnome; Horda — Orc, Tauren, Troll, Undead. Každá rasa = pasivní bonusy + omezení dostupných class.
- **Classy** (vanilla 9): Warrior, Paladin, Hunter, Rogue, Priest, Shaman, Mage, Warlock, Druid. Každá: resource (rage/energy/mana), základní schopnosti, role (tank/heal/dps).
- **Leveling**: lvl 1–60 (vanilla cap, pomalá křivka), XP křivka, odemykání schopností a contentu na úrovních.
- **Talent systém**: 3 stromy na classu, body za level, definuje idle combat chování (rotace/priority).
- **Gear & equipment**: sloty (head, chest, weapon...), rarita (common→legendary), item level, staty, set bonusy, enchanty.
- **Kosmetika (transmog/skiny)**: vizuální vrstva **oddělená od statů** — vlastní entita + ownership na účtu/postavě, nikdy nedává power. Připraveno na pozdější monetizaci.
- **Inventář & měny**: zlato, bagy, banka.
- **Content gating**: dungeony a raidy se odemykají na úrovních a podle questline; raid attunements.
- **PVE**: Dungeony (SP, idle auto-resolve), Raidy (MP, párty, idle s rolemi).
- **PVP**: Areny (MP, rated, idle auto-resolve souboj buildů), žebříčky.
- **Filler / time-sink aktivity**: Questing (questlines, daily/repeatable), **Profese** (gathering: mining/herbalism/skinning; crafting: blacksmithing/alchemy/tailoring/... — dlouhé idle běhy za materiály, XP, zlato), reputace s frakcemi.
- **Ekonomika**: Auction House (MP obchod mezi hráči), vendoři.
- **Sociální**: friends, jednoduchý chat/guild (později).

---

## Repo struktura (cíl)

```
/ (monorepo, pnpm + turbo)
├─ apps/
│  ├─ api/        # NestJS backend (moduly = herní systémy)
│  └─ web/        # SvelteKit frontend (PWA)
├─ packages/
│  ├─ shared/     # sdílené TS typy, herní konstanty, combat/leveling vzorce, balanc data
│  └─ game-data/  # seed data: rasy, classy, talenty, itemy, zóny, recepty (JSON/TS)
├─ docs/          # ROADMAP.md (tento dok), ADR, docs/systems/*
├─ docker-compose.yml
├─ Caddyfile      # reverzní proxy + HTTPS
└─ ...
```

---

## Vývoj řízený AI (agent-first) — průřezový požadavek

Protože veškerou implementaci dělají AI agenti a PM jen řídí, kódová báze i proces musí být navržené tak, aby do projektu mohl kdykoli „vskočit" nový agent s minimem kontextu a bezpečně pracovat. Pravidla zaváděná od M0:

- **Dokumentace pro agenty:** kořenový `CLAUDE.md` (přehled architektury, konvence, jak spustit/testovat, kde co leží) + `CLAUDE.md` v každém větším modulu. `docs/adr/` s ADR (Architecture Decision Records).
- **Tento plán = single source of truth roadmapy.** Po každém milníku se aktualizuje. Detail-specy systémů žijí v `docs/systems/`.
- **Silná, vynucená konzistence:** přísný TypeScript (`strict`), ESLint + Prettier, konvence pojmenování, jednotná struktura modulu (`controller / service / repository / dto / events`).
- **Modularita & izolace:** každý herní systém = samostatný NestJS modul s jasným rozhraním a eventy → agenti pracují na různých systémech paralelně bez kolizí. Sdílená pravda (typy, vzorce, konstanty) jen v `packages/shared`.
- **Testy jako kontrakt:** unit testy herních vzorců + integrační testy API modulů. CI brání mergi při červených testech/lintu.
- **Determinismus & seedovatelnost:** combat/loot/RNG deterministické a testovatelné.
- **Malé, vertikální přírůstky:** každý milník/PR je samostatně spustitelný a recenzovatelný PM.
- **Seed & dev data + skripty:** `pnpm dev`, seed databáze, jeden příkaz na rozjetí celého prostředí.

---

## Roadmapa / milníky

Fáze jdou inkrementálně; každá končí spustitelným, hratelným přírůstkem. Detaily systémů se rozpracují na začátku své fáze.

### M0 — Skeleton & infra (základ) — ✅ z větší části hotovo

- [x] Monorepo (pnpm + turbo), TypeScript config (strict), lint/format (ESLint + Prettier).
- [x] docker-compose: api + web + postgres + redis + Caddy (HTTPS) + Dockerfiles + Caddyfile.
- [x] NestJS skeleton + healthcheck (`GET /health` se stavem DB/Redis); SvelteKit skeleton + PWA manifest + service worker.
- [x] Drizzle setup (schéma `health_log`, `drizzle.config.ts`); připojení k Redisu (ioredis).
- [x] CI základ (build/test/lint/typecheck) — `.github/workflows/ci.yml`.
- [x] Agent-first základ: kořenový `CLAUDE.md` + šablona API modulu, `docs/adr/` (0001–0003), striktní TS/ESLint/Prettier.
- [x] Stateless API (stav v Postgres/Redis), připravené na horizontální škálování.
- [x] `packages/shared`: XP křivka (cap 60, pomalá), `SeededRng`, unit testy (vitest).
- **Lokálně ověřeno:** `pnpm build` / `test` (8) / `lint` / `typecheck` zelené; API naběhne, `/health` vrací `MAX_LEVEL` ze `@game/shared`.
- **Zbývá doladit (drobnosti):**
  - [ ] `docker compose up` ověřit s běžícím Docker daemonem (v tomto prostředí daemon neběžel).
  - [ ] PWA ikony 192/512 do `static/` pro plnou instalovatelnost.
  - [ ] První Drizzle migrace (`pnpm db:generate`) proti běžícímu Postgresu.
  - [ ] (Volitelně) SessionStart hook pro web sezení — vyžaduje souhlas PM se zápisem do `.claude/settings.json`.

### Deployment pipeline (průřezově, mimo herní milníky) — ✅ zavedeno

- CI → **GHCR** → **Watchtower** (server si sám stahuje, žádný příchozí přístup). Viz `docs/adr/0004-deployment.md`.
- `.github/workflows/release.yml` (build & push image api+web), `docker-compose.prod.yml` (registry image + Watchtower).
- [x] Ověřeno: CI i Release workflow zelené, image `api`+`web` nahrány do GHCR.
- [x] NAS-friendly deploy návod (UGREEN GUI + SSH, bez gitu): `docs/DEPLOY.md`.

### M1 — Účty & postava — ✅ hotovo

- [x] Auth: registrace/login/refresh (JWT access+refresh, bcryptjs), `JwtAuthGuard`, `GET /auth/me`. Viz `docs/adr/0005-auth.md`.
- [x] 8 ras + 9 class + vanilla race-class matice + 5 primárních statů ve `@game/shared` (`src/data/`, `src/character.ts`).
- [x] DB model `accounts` + `characters` (Drizzle), **auto-migrace při startu** API (NAS-friendly, bez ručního zásahu).
- [x] API: `POST/GET /characters` (chráněné, vázané na účet), staty se dopočítávají ze `shared`.
- [x] Web (SvelteKit): `/register`, `/login`, `/characters`, `/characters/new` (rasa→classa→jméno), `/characters/[id]` (character sheet).
- [x] Testy: shared unit + API integrační flow přes **pglite** (bez Dockeru). Build/test/lint/typecheck zelené.
- Detail: `docs/systems/character.md`.
- **Výstup:** vytvořím si účet i postavu a vidím její staty. ✅
- **Zbývá doladit:** balanc statů (M9), httpOnly cookie místo localStorage, refresh rotace/revokace (ADR 0005 follow-up).

### M2 — Leveling & jádro idle smyčky

- XP/level systém, statový výpočet ze základů + per-level.
- **Questing v1**: idle aktivita s `start_at` + deterministický dopočet odměn (XP/zlato).
- BullMQ dokončení aktivity, lazy dopočet při návratu.
- **Výstup:** pošlu postavu questovat, ona levluje na pozadí.

### M3 — PWA notifikace & offline progres

- Web Push (VAPID), notifikace při dokončení aktivity.
- Offline progress shrnutí, fronta aktivit.
- **Výstup:** zavřu appku, přijde notifikace, po návratu vidím souhrn.

### M4 — Gear, inventář, talenty

- Item systém, inventář, equip, vliv na staty; loot z aktivit.
- Talent stromy (3/classu), alokace bodů, vliv na combat chování.
- Kosmetická vrstva (základ): ownership skinů oddělený od statů (transmog).
- **Výstup:** sbírám a oblékám gear, rozdávám talenty; vizuál nezávislý na statech.

### M5 — Combat engine & Dungeony (SP PVE)

- Deterministický idle combat engine; server tick + WebSocket live combat log.
- Dungeony: SP instance, odemykání dle levelu, boss loot, content gating.
- **Výstup:** pošlu se do dungeonu, sleduji idle boj, dostanu loot.

### M6 — Profese & reputace (deep time-sinks)

- Gathering + crafting profese; reputace s frakcemi.
- **Výstup:** dlouhodobé filler aktivity vedle questování.

### M7 — Multiplayer infra & Areny (MP PVP)

- Matchmaking (Redis fronta), rating/ladder, deterministický PVP auto-resolve.
- Škálovatelná realtime vrstva: WebSocket s Redis pub/sub adaptérem (multi-instance).
- Leaderboardy, sezónní odměny.
- **Výstup:** zařadím se do arény, soupeřím, stoupám v žebříčku.

### M8 — Raidy (MP PVE) & Auction House

- Raidy: MP skupiny, role, idle boss fighty, attunement gating, raid loot.
- Auction House: hráčský obchod, aukce, vendoři.
- **Výstup:** organizovaný MP PVE content + ekonomika.

### M9 — Polish, balanc, pixel grafika, sociální

- PixiJS pixel scénky, nahrazení placeholderů; balanc pass; tutoriál/onboarding.
- Friends, chat/guild základ; achievementy, denní/týdenní cíle.
- **Výstup:** vyladěná, vizuálně oživená hra.

---

## Rozhodnutí (potvrzeno PM)

- ✅ **Level cap 60**, velmi pomalá XP křivka (long-haul meta).
- ✅ **Frakce kosmetické** (architektura připravená na pozdější herní rozdělení).
- ✅ **Monetizace later**: kosmetická vrstva oddělená od statů od začátku → pozdější prodej skinů bez refaktoru.
- ✅ **Vývoj řízený AI** + **škálovatelnost** jako tvrdé průřezové požadavky.

### Menší rozhodnutí do dalších fází

- Hloubka profesí v MVP. → M6
- Síla PVP vs PVE balancu. → M5/M7
- Konkrétní rozsah questline a počet zón v MVP. → M2
- Sezónní model (reset ladderu) pro PVP. → M7

---

## Verifikace

Pro implementační fáze platí obecný postup aplikovaný na konci každého milníku:

- **M0+**: `docker compose up` → appka naběhne, healthcheck zelený, PWA instalovatelná v prohlížeči.
- **Per-fáze**: ruční end-to-end průchod hlavní novou smyčkou + unit testy herních vzorců v `packages/shared` + integrační testy API modulu dané fáze.
- Po dokončení každého milníku: commit + push na `claude/great-albattani-kclq98`, aktualizace tohoto plánu.
