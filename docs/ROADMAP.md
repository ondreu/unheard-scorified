# AFK to 60 — kompletní roadmapa (idle RPG, WoW-inspired)

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
6. **Jazyk hry = angličtina.** Veškerý herní obsah a UI (texty, názvy ras/class/itemů/questů, hlášky, notifikace) je **anglicky**. Projektová dokumentace (`docs/`, `CLAUDE.md`, komentáře) zůstává česky. Žádné lokalizace zatím neřešíme, ale uživatelsky viditelné stringy drž oddělené od logiky, ať jde i18n případně doplnit později bez refaktoru.

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

### M2 — Leveling & jádro idle smyčky — ✅ hotovo

- [x] XP/level systém ve `@game/shared`: XP křivka (cap 60, pomalá), `xpForLevel`/`levelFromXp`,
      `applyXpGain` (level-up); per-level staty z M1 (`baseStatsFor`). Unit testy vzorců.
- [x] **Questing v1**: obecný activity model (`activity_type` + `params`), zatím jen `quest`.
      3 level brackety na frakci (Alliance: Northshire/Westfall/Duskwood, Horde: Durotar/Barrens/Thousand Needles),
      lineární questline + repeatable; frakce kosmetická (paralelní obsah, stejný balanc).
      Idle aktivita s `start_at` + **deterministický dopočet odměn** (XP/zlato přes `SeededRng`,
      server-authoritative, anti-cheat). NestJS moduly `quest/` + `activity/`.
- [x] DB: `gold` na characters, tabulky `character_activities` + `completed_quests`
      (Drizzle migrace `0001_right_reavers`, auto-migrace při startu).
- [x] **BullMQ** delayed job na dokončení aktivity (best-effort hook pro M3 push);
      **lazy dopočet** odměn při claimu (jediný zdroj pravdy, offline progres).
- [x] Web: seznam questů, poslat questovat, běžící aktivita + odpočet, claim + level-up.
      Herní texty anglicky, oddělené od logiky.
- [x] Testy: shared unit + API integrační flow přes **pglite** (bez Dockeru/Redisu). Vše zelené.
- Detail: `docs/systems/questing.md`, ADR `docs/adr/0006-activities-and-questing.md`.
- **Výstup:** pošlu postavu questovat, ona levluje na pozadí (i offline). ✅
- **Zbývá doladit:** balanc XP křivky a odměn (M9); push notifikace při dokončení (M3).

### M3 — PWA notifikace & offline progres — ✅ hotovo

- [x] Web Push (VAPID): `push_subscriptions` tabulka (Drizzle migrace `0002_medical_maverick`),
      `PushModule` (subscribe/unsubscribe/vapid-public-key endpointy), auto-mazání prošlých subscriptions (410).
- [x] Notifikace při dokončení aktivity: BullMQ worker injektuje `PushService` + `CharacterRepository`,
      odesílá push po dokončení questu (best-effort; lazy dopočet je zdroj pravdy).
- [x] Souhrn offline progresu: `ClaimResult.offlineDurationSec` (čas od dokončení do claimu);
      web zobrazí „🌙 Away for Xh Ym" při návratu.
- [x] Service worker: přechod z `generateSW` na `injectManifest`, vlastní `src/service-worker.ts`
      s handlery `push` (showNotification) + `notificationclick` (open/focus záložka s postavou).
- [x] Web: push toggle tlačítko na character page, `$lib/push.ts` klientská logika.
- [x] Testy: integrační testy push service (pglite + `vi.mock('web-push')`), 20 API testů zelených.
- Detail: `docs/adr/0007-push-notifications.md`, `docs/systems/push-notifications.md`.
- **Výstup:** zavřu appku → přijde push o dokončení → po návratu vidím souhrn. ✅
- **Zbývá doladit:** per-postavová granularita push (M-future); push ikona 192/512 (M0 TODO).

### M4 — Gear, inventář, talenty — ✅ hotovo

- [x] Item systém (`packages/shared/src/data/items.ts`): 30 itemů ve 3 tier brackety (ilvl 4–42),
      typy slotů, rarity, stat systém. Jediný zdroj pravdy pro API i web.
- [x] Loot systém (`packages/shared/src/loot.ts`): deterministický roll přes `SeededRng`, loot tabulky
      per zone bracket, integrace do `computeQuestReward` → `ActivityReward.items`.
- [x] Inventář & equipment DB (`character_inventory`, `character_equipment`, Drizzle migrace `0003_petite_chimera`).
- [x] `InventoryModule` (NestJS): list inventáře, list equipment + staty, equip, unequip; validace slotu/vlastnictví.
- [x] Talent stromy: 9 class × 3 stromy × 5 nodů (`packages/shared/src/data/talents.ts`);
      tier requirements, direct stat efekty (M4), combat tagy pro M5.
- [x] `TalentModule` (NestJS): list talent stromů, alokace bodů, reset; validace tier req/max rank/dostupnost.
- [x] Loot přidán do inventáře při claimu aktivity (`ActivityService`).
- [x] `CharacterSheet.equipmentStats` — staty z equipnutých itemů.
- [x] Kosmetická vrstva: `character_skins` tabulka (accountId, skinId) — ownership skinů oddělený od statů.
- [x] Web stránky: `/characters/[id]/inventory` (inventář grid + equipment sloty), `/characters/[id]/talents`
      (3 talent stromy s alokací); navigation links na character page.
- [x] Integrační testy: `inventory.flow.test.ts` (7 testů), `talent.flow.test.ts` (8 testů). 81 testů celkem.
- [x] Typecheck, lint, testy zelené. Dokumentace: `docs/systems/items.md`, `docs/systems/talents.md`.
- Detail: `docs/systems/items.md`, `docs/systems/talents.md`.
- **Výstup:** sbírám gear z questů, oblékám ho, rozdávám talent body, vidím equipment staty. ✅
- **Zbývá na M5:** combat tagy z talentů použít v combat enginu; set bonusy; zbraňové typy.

### M5 — Combat engine & Dungeony (SP PVE) — ✅ hotovo

- [x] **Deterministický combat engine** (`packages/shared/src/combat.ts`):
      `deriveCombatProfile` (base staty M1 + gear M4 + **talent combat tagy M4**
      → crit/haste/damage/lifesteal + signature ability), `simulateDungeonRun`
      (událostmi řízená simulace přes `SeededRng`, enrage timer, klid mezi
      souboji) → kompletní `CombatEvent[]` timeline + výsledek. Unit testy.
- [x] **Dungeony** (`packages/shared/src/data/dungeons.ts`): 4 SP instance
      (Ragefire Chasm 8, Deadmines 15, Shadowfang Keep 20, Scarlet Monastery 30),
      content gating dle levelu, trash + boss encountery. PVE neutrální.
- [x] **Boss loot** (`DUNGEON_LOOT_TABLES` v `loot.ts`) + dungeon-only itemy
      (`items.ts`); roll při vítězství na deterministicky odvozeném seedu.
- [x] **Dungeon run = idle aktivita typu `dungeon`** — žádná nová tabulka/migrace;
      recykluje M2 activity infra (repository, BullMQ scheduler, push) a generický
      claim. Snapshot bojového profilu při vstupu (anti-cheat + determinismus).
- [x] `DungeonModule` (NestJS): list dungeonů, enter, **živý combat log**
      (odhalování předpočítaného timeline dle uplynulého času — stateless, žádný
      per-process stav). Integrační testy (pglite, 7 testů).
- [x] Web: `/characters/[id]/dungeons` (seznam + enter), `/characters/[id]/dungeon`
      (sledování boje — combat log polling, claim loot); character page link +
      běžící run „Watch fight →". Herní texty anglicky, oddělené od logiky.
- [x] Build/test/lint/typecheck zelené (98 testů: 56 shared + 42 API).
- Detail: `docs/systems/combat-dungeons.md`, ADR `docs/adr/0008-combat-and-dungeons.md`.
- **Výstup:** pošlu se do dungeonu, sleduji idle boj (log událostí), dostanu loot. ✅
- **Zbývá doladit:** balanc (HP/AP/loot/XP, M9); **WebSocket** realtime transport
  (Redis pub/sub, multi-instance) → M7; plné využití všech combat tagů (DoTy/štíty/CC).

### M6 — Profese & reputace (deep time-sinks) — ✅ hotovo

- [x] **2 gathering + 2 crafting profese** (rozhodnutí PM): Mining→Blacksmithing
      (gear), Herbalism→Alchemy (consumables). Profession skill 1–150 (3 tiery),
      deterministický skill-up („zelený" node/recept dává +1, pak zešedne).
- [x] **Gathering/crafting běh = idle aktivita** typu `gather`/`craft`
      (`@game/shared`: `data/professions.ts`, `data/materials.ts`, `professions.ts`
      vzorce). Žádná nová activity tabulka — recykluje M2 activity infra (repository,
      BullMQ scheduler, push, generický claim). Crafting spotřebuje materiály při startu.
- [x] **Materiály/spotřebáky** = ne-equip položky v existující `character_inventory`;
      crafted gear žije v `ITEMS` (equipovatelné). Deterministický gather yield přes `SeededRng`.
- [x] **Reputace** se 3 frakcemi (Miners' League, Herbalist Circle, Explorers' Guild),
      tiers Neutral→Exalted (odvozené z `standing`), rep gain z profesí, **rep-gated
      recepty** (Masterwork Blade, Elixir of Strength @ Honored). DB: `character_professions`
      + `character_reputation` (migrace `0004_overrated_lady_ursula`).
- [x] `ProfessionModule` (NestJS): `GET /professions` panel, `POST .../gather/:nodeId`,
      `POST .../craft/:recipeId`; skill + reputace se připisují v generickém claimu.
      `ProfessionDataModule` (leaf) → bez modulového cyklu.
- [x] Web: `/characters/[id]/professions` (skilly, reputace, materiály, gather/craft);
      character page link + claim banner se skill-up/rep zisky. Texty anglicky, oddělené od logiky.
- [x] Testy: shared unit (`professions.test.ts`, +13) + API integrační flow
      (`profession.flow.test.ts` přes pglite, +7). Build/test/lint/typecheck zelené
      (118 testů: 69 shared + 49 API). DI graf ověřen reálným bootem (tsc).
- Detail: `docs/systems/professions-reputation.md`, ADR `docs/adr/0009-professions-and-reputation.md`.
- **Výstup:** sbírám materiály, craftím z nich itemy/spotřebáky, stoupám v profession
  skillu i reputaci (vč. rep-gated receptur). ✅
- **Zbývá doladit:** „use" consumables/buffy (M9); prodej materiálů (vendor/AH, M8);
  reputace i z questů/dungeonů (retrofit); balanc (M9).

### M7 — Multiplayer infra & Areny (MP PVP) — ✅ hotovo

- [x] **Matchmaking** (Redis fronta, abstrahováno za `MatchmakingQueue` →
      Redis impl + in-memory pro testy). Idle-first: fronta drží **snapshot**
      bojového profilu → spárování i s offline soupeřem; atomické „nárokování"
      přes `HDEL` (žádné dvojité párování mezi instancemi).
- [x] **Deterministický 1v1 PVP auto-resolve** (`packages/shared/src/pvp.ts::
      simulatePvpDuel`) — recykluje combat engine z M5 (`computeHit`, `CombatActor`),
      symetrický duel + rampage proti stalemate. Rozhodnutí PM: MVP jen bracket `1v1`.
- [x] **Elo rating + sezónní ladder** (start 1500, K=32). Sezóny = data v shared;
      rating per `(postava, bracket, sezóna)` → **reset** novou sezónou. **Lazy
      idempotentní rollover**: archiv finálního standingu + **sezónní odměna**
      dle tieru (`arena_season_rewards`).
- [x] **Leaderboardy** přes Redis **sorted set** (`ArenaLeaderboard` rozhraní;
      durable zdroj pravdy = `arena_ratings`, DB fallback).
- [x] **Škálovatelná realtime vrstva**: WebSocket (Socket.IO) s **Redis pub/sub
      adaptérem** (`RedisIoAdapter`, multi-instance, stateless API — žádné sticky
      sessions). `arena:match_found` (cross-instance notifikace fronty) +
      `arena:watch` (živé streamování předpočítaného combat logu); REST je
      autoritativní fallback. **První reálný realtime transport v projektu.**
- [x] DB: `arena_ratings` + `arena_matches` + `arena_season_rewards`
      (migrace `0005_normal_donald_blake`, auto-migrace při startu).
- [x] `ArenaModule` (NestJS): controller + service + gateway + repository;
      `ArenaEventsRelay` rozplétá service↔gateway (žádný DI cyklus).
- [x] Web: `/characters/[id]/arena` (rating, žebříček, fronta s live „match
      found", historie, banner sezónní odměny), `/arena/match/[matchId]`
      (živé sledování přes WS). `$lib/arena-socket.ts`. Texty anglicky, oddělené.
- [x] Testy: shared unit (`pvp.test.ts`, +15) + API integrační flow
      (`arena.flow.test.ts` přes pglite, in-memory fronta/žebříček, +7).
      Build/test/lint/typecheck zelené (140 testů: 84 shared + 56 API).
      DI graf (vč. WS gateway + Redis adaptér) ověřen reálným bootem.
- Detail: `docs/systems/arenas-pvp.md`, ADR `docs/adr/0010-arena-pvp-and-realtime.md`.
- **Výstup:** zařadím se do arény, soupeřím, stoupám v žebříčku. ✅
- **Zbývá doladit:** PVP-specifický balanc vs PVE (M9); rating-window matchmaking,
  2v2/3v3 brackety, sezónní cosmetic odměny (M8/M9).

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

- ~~Hloubka profesí v MVP. → M6~~ ✅ vyřešeno v M6: 2 gathering + 2 crafting (Mining→Blacksmithing, Herbalism→Alchemy) + 3 frakce s rep-gated recepty.
- Síla PVP vs PVE balancu. → M5/**M9** (M7 používá společný `deriveCombatProfile`; samostatný PVP balanc + rampage tuning je v M9 balanc passu).
- ~~Konkrétní rozsah questline a počet zón v MVP. → M2~~ ✅ vyřešeno v M2: 3 level brackety na frakci (Alliance + Horde paralelně, 1–10/10–25/25–40), lineární questline + repeatable.
- ~~Sezónní model (reset ladderu) pro PVP. → M7~~ ✅ vyřešeno v M7: sezóny = data v shared, rating per sezóna (reset), lazy idempotentní rollover + sezónní odměny dle tieru.
- ~~Rozsah Aren MVP (kolik bracketů, realtime watch). → M7~~ ✅ vyřešeno v M7: jen `1v1`, live watch přes WebSocket (Redis pub/sub).

---

## Verifikace

Pro implementační fáze platí obecný postup aplikovaný na konci každého milníku:

- **M0+**: `docker compose up` → appka naběhne, healthcheck zelený, PWA instalovatelná v prohlížeči.
- **Per-fáze**: ruční end-to-end průchod hlavní novou smyčkou + unit testy herních vzorců v `packages/shared` + integrační testy API modulu dané fáze.
- Po dokončení každého milníku: commit + push na **vývojovou větev `main`** a aktualizace tohoto plánu.
  - ℹ️ **Jediné místo, kde je vývojová větev uvedena** — pro změnu cíle pushů (např. zpět na feature větev) uprav jen tento řádek.
