# AFK to 60 — kompletní roadmapa (idle RPG, WoW-inspired)

> Living document. Po každém milníku se aktualizuje (odškrtnutí hotového, doplnění detailů další fáze).
> Toto je **single source of truth** roadmapy projektu.
>
> **Dev & Admin panel:** `/dev` (viz `docs/systems/dev-panel.md`). Každý nový systém přidává odpovídající dev/mod akce — viz konvence v tom dokumentu.

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

### M8 — Raidy (MP PVE) & Auction House — ✅ hotovo

- [x] **Raidy** (MP PVE): **flex velikosti 5 / 10 / 20** (modern-WoW styl,
      rozhodnutí PM) s **hráčem volenou kompozicí** tank/healer/dps (default 5:
      1/1/3 · 10: 2/2/6 · 20: 2/5/13; chybějící sloty doplní NPC). Boss se škáluje
      dle velikosti (`scaleBoss`, HP+dmg ×size/5). Combat engine z M5 rozšířen o
      **party-vs-boss** simulaci (`packages/shared/src/raid.ts::simulateRaidRun`,
      recykluje `computeHit`): tank drží aggro + mitigace, healer léčí (event
      `heal`), dps dmg; boss enrage, wipe = defeat. `deriveRaidActor` škáluje profil dle role.
- [x] **2 raidy × 3 bossy** (rozhodnutí PM): Molten Core (~lvl 40), Blackwing Lair
      (~lvl 55) — `data/raids.ts`. **Attunement = level + dokončený questline**
      (rozhodnutí PM; `isRaidUnlocked` recykluje `completed_quests` z M2; pro BWL
      přidán per-frakce attunement quest). Raid loot (`RAID_LOOT_TABLES` +
      epic/legendary raid gear).
- [x] **Idle-first matchmaking + NPC backfill**: `queue` (čekání v roli, Redis
      hash snapshot) + `enter` (vytáhne čekající reálné hráče pro chybějící role,
      zbytek doplní NPC → vyřeší se i sólo; vytažení hráči dostanou odměnu + push).
      Fronta za `RaidQueue` (Redis + in-memory). Raidy mají vlastní tabulky
      `raid_runs` + `raid_run_participants` (jako arena, ne `character_activities`).
- [x] **Realtime watch** přes WS gateway + Redis pub/sub (recykluje vrstvu z M7);
      REST autoritativní fallback. `RaidEventsRelay` rozplétá service↔gateway.
- [x] **Auction House** (rozhodnutí PM: **buyout + bidding s depositem a expirací**):
      `packages/shared/src/auction.ts` (deposit + 5 % cut = gold sinky, min-bid,
      durace, sjednocený item lookup napříč ITEMS/MATERIALS/CONSUMABLES). Item
      escrow z inventáře + gold escrow bidů; **vypořádání lazy při čtení** (zdroj
      pravdy) + best-effort **BullMQ** expiry job (`AuctionSettler`/`Scheduler`).
- [x] DB migrace `0006` (raid_runs + raid_run_participants) + `0007` (auctions),
      auto-migrace při startu. `CharacterRepository.spendGold/addGold` (atomické).
- [x] Web: `/characters/[id]/raids` + `/raid/[runId]` (watch); `/auctions`
      (browse/mine/sell). Herní texty anglicky, oddělené od logiky.
- [x] Testy: shared unit (`raid.test.ts` +16, `auction.test.ts` +7) + API
      integrační flow (`raid.flow.test.ts` +7, `auction.flow.test.ts` +7 přes
      pglite, in-memory fronta + Noop scheduler). Build/test/lint/typecheck zelené
      (177 testů: 107 shared + 70 API). DI graf (vč. obou WS gateway + Redis
      adaptér + BullMQ scheduler) ověřen reálným bootem.
- Detail: `docs/systems/raids.md`, `docs/systems/auction-house.md`, ADR
  `docs/adr/0011-raids-mp-pve.md`, `docs/adr/0012-auction-house.md`.
- **Výstup:** zařadím party do raidu, sleduji idle boss fight, dostanu raid loot;
  prodávám/kupuji na Auction House. ✅
- **Zbývá doladit:** balanc (boss HP/AP, role tuning, loot, AH poplatky → M9);
  větší party / weekly lockout; vendoři (NPC odkup); AH vyhledávání/filtry.

### M8.5 — Iterativní (wipe/retry) combat, skupinové módy & personal loot (návrh PM)

> Status: **rozpracováno** — **A (wipe/retry) ✅**, **B-idle (group PVE run +
> group dungeony) ✅**, **B-ruční-formace (raid lobby) ✅** (ADR 0018),
> **D-personal-loot ✅**, **D-trade (P2P) ✅** (ADR 0019), **C (týmové arény
> 3v3/5v5) ✅** (ADR 0020). **M8.5 kompletní.** Ekonomická pravidla (původní E)
> vyčleněna do samostatného milníku **M8.6**.
>
> ⚠️ **Superseded v M9 (ADR 0022):** níže popsané **NPC backfill**, **raid lobby**
> (B-ruční-formace) a **ruční team-aréna formace** (C `queueTeam`/výběr jmény) už
> v kódu **nejsou** — nahradila je **trvalá skupina (party)** + úplné odstranění
> NPC backfillu. Zachoval se sdílený combat/aréna engine (`finalizeRun`,
> `simulateTeamFight`, Elo, personal loot). Historické bullety níže nechávám jako
> záznam; pro aktuální stav viz M9 „Trvalá skupina" + `docs/systems/groups.md`.

#### A) Iterativní wipe/retry combat — ✅ hotovo

- [x] **Per-encounter (per-boss) pully** ve sdíleném enginu: `combat.ts` extrahoval
      `fightEncounter` + orchestrátor `simulateDungeonRun`; `raid.ts` `fightBoss` +
      orchestrátor `simulateRaidRun`. Žádná duplikace per-hit vzorců (`computeHit`).
- [x] **Determination** (sdílená křivka dungeon+raid, první wipe „zdarma"):
      obtížnost `1 → 1 → 0.95 → 0.9 → 0.85 → 0.8 → 0.75` (7 pullů), HP i dmg
      ×factor; poražené encountery zůstávají, po wipu reset HP na plnou.
- [x] **Odměny sledují obtížnost** (`wipeRewardMultiplier`): plná za 0–1 wipe,
      lineárně dolů až k 0.3 na obtížnosti 0.75. Klesá XP, zlato i šance na loot
      (`rollLoot` má `dropChanceMult`). Hodnoty: `1, 1, 0.86, 0.72, 0.58, 0.44, 0.3`.
- [x] **Hard fail** (vyčerpání pokusů bez clearu) = 0 odměny, žádná útěcha
      (ruší dosavadní 10% útěchu z M5/M8).
- [x] Idle auto-retry; live combat log zobrazí retry pully (`(pull N, weakened)`).
      `wipes` vystaveno v dungeon/raid run view; web zobrazí „reduced reward".
- [x] Testy: shared unit (combat/raid wipe/retry + `wipeRewardMultiplier`) + API
      flow aktualizovány. Build/test/lint/typecheck zelené.
- Detail: ADR `docs/adr/0013-iterative-wipe-retry-combat.md`,
  `docs/systems/combat-dungeons.md`, `docs/systems/raids.md`.

> Níže původní plán M8.5 (B/C/D/E zbývá implementovat).

**Dva režimy napříč obsahem (potvrzeno PM):**

- **Idle „set & forget"** pro casual hráče — zachován current quick-start (queue +
  NPC backfill, auto-resolve).
- **Ruční sestavení** pro min-max/social hráče — leader, lobby, výběr hráčů,
  pozvánky (v rámci guildy → **až po M9 social**).

#### A) Iterativní wipe/retry combat — VŠECHNY PVE módy

Platí pro **SP dungeon i skupinový dungeon (3/5) i raid (5/10/20)** (potvrzeno PM).
Combat přejde z „jedna simulace, run uspěje/selže" na **per-boss pully**:

- Wipe na bossovi → **další pull** (retry téhož bosse, nový seed `seed ⊕ attempt`),
  progres už poražených bossů zůstává.
- **Boss se s každým wipem zlehčuje** (stacking „determination"/rally nerf — HP/dmg
  dolů) **až po dolní hranici** (potvrzeno PM) → odhodlaní hráči nakonec clear dají.
- **Odměna klesá s počtem wipů**: klesá **XP, zlato i šance na loot** (potvrzeno PM);
  **maximum za 0 wipů**.
- **Hard fail** = vyčerpání stropu pokusů bez clearu → **prostě fail, žádná útěcha**
  (jen vlídná slova, 0 XP/zlato/loot) (potvrzeno PM). Ruší se dnešní M8 „10 % útěcha".
- **Idle režim**: auto-retry do clearu nebo hard failu (hráč není u toho). **Ruční
  režim**: leader může re-pull / odejít.

#### B) Skupinové PVE módy + manuální formace (raid + dungeon) — ✅ idle část hotová

- [x] **Sjednocený „group PVE run" model**: `raid_runs` rozšířeno o `content_type`
      (raid|dungeon), sdílený `RaidRepository` + `RaidQueue` + `simulateRaidRun` +
      content-agnostické helpery `@game/shared/group.ts`. Migrace `0009`.
- [x] **Dungeon přesunut z `character_activities` na run model**: SP (party 1 dps)
      i **skupinový 3/5** (role + NPC backfill, idle matchmaking fronta `dungeon:<id>`).
      Combat = party-vs-sekvence (členové používají signature abilities). Encountery
      škálované velikostí party. Web: výběr velikosti + run watch `dungeon/[runId]`.
- [x] Testy: shared `group.test.ts` + přepsaný `dungeon.flow.test.ts` (SP + group +
      fronta). Build/test/lint/typecheck zelené. Detail: ADR 0014.
- [x] **Raid leader + lobby (ruční formace)** ✅ (M8.5-B): leader založí lobby
      (raid + velikost + kompozice), zve konkrétní postavy do rolí (friends/guild),
      vyhazuje, a spustí — zbylé sloty doplní NPC backfill (idle-first zachován).
      Sdílí `RaidService.finalizeRun` (žádná duplikace simulace/odměn). Tabulky
      `raid_lobbies` + `raid_lobby_members` (migrace `0014`), `RaidLobbyService`/
      controller v `RaidModule`. Web `/characters/[id]/raid-lobby`. Sdílené slot
      helpery `@game/shared/lobby.ts`. Testy: shared `lobby.test.ts` (+4) + API
      `raid-lobby.flow.test.ts` (+8). Detail: **ADR 0018**.
- ℹ️ Konvergence `RaidService` na společný `GroupRunService` je nepovinný úklid
  (data/sim/helpery už sdílené); legacy single-actor `simulateDungeonRun` → úklid M9.

#### C) Arény — rozšíření o 3v3 a 5v5 (ruční týmy) — ✅ hotovo (ADR 0020)

- [x] Brackety `3v3`/`5v5` (rozšířený `ArenaBracket`), team-vs-team engine
      `simulateTeamFight` (recykluje `computeHit`, focus-fire, rampage), Elo per
      postava proti průměru soupeřů (`eloDelta`). Ruční tým přes social graf
      (parťák = friend/guild), snapshot fronta bez NPC backfillu, párování bez
      překryvu členů. Persistence `arena_team_matches` (migrace `0016`) + watch
      (REST reveal). `TeamArenaService`/controller/queue v `ArenaModule`. Web
      `/characters/[id]/team-arena` + `/team-match/[matchId]`. Testy: shared
      `pvp.test.ts` (+), API `team-arena.flow.test.ts` (+7).

> Historický kontext rozhodnutí PM níže.

Upřesnění PM: v PVP **NEjde o wipe/retry**, ale o **nové brackety 3v3 a 5v5** vedle
1v1. **Rozhodnutí PM:** **idle (NPC backfill / auto-matchmaking) zůstává jen u 1v1**;
**týmové arény (3v3/5v5) se MUSÍ skládat ručně** (hráč si vybere parťáky). Ruční
sestavení týmu vyžaduje **friends/guild → celá C tedy spadá až za M9 social.**
Žádný idle team-matchmaking s NPC backfillem se nestaví (na rozdíl od raidů/group
dungeonů, kde idle NPC backfill zůstává).

> Důsledek: C **není pre-M9** (původní „C-matchmaking" v Pořadí padá). Bojový engine
> tým-vs-tým + brackety se přidají až s M9 manuálním sestavením (žádné předčasné
> half-feature v `ArenaBracket`).

**Rating model — rozhodnutí (PM přenechal na mně): per hráč per bracket, ad-hoc týmy.**
Žádná perzistentní „arena team" entita (jako vanilla 2v2 týmy), ale **ad-hoc tým per
zápas** s ratingem **per postava per bracket per sezóna** (rozšiřuje M7 `arena_ratings`
o brackety `3v3`/`5v5`). Důvody: (a) drží idle-first snapshot model z M7 beze změny,
(b) žádná těžká týmová entita/správa členů, (c) snadno škáluje na malou základnu a
NPC backfill. Po výhře/prohře se Elo aplikuje každému členu (průměr ratingu soupeřů).
Perzistentní týmy lze přidat později bez refaktoru (bracket je datový atribut).

#### D) Personal loot + trade mezi hráči (modern-WoW styl)

- [x] **Personal loot per účastník i pro dungeony** (`computeGroupReward`, seed per
      postava; raid měl per-participant už od M8). Šance na loot klesá s wipy (viz A). ✅
- [x] **P2P trade** ✅ (M8.5-D): přímá výměna itemů + zlata mezi dvěma postavami
      (oddělený systém od AH), oboustranné potvrzení + atomický převod bez escrow;
      jakákoli změna nabídky resetuje potvrzení; BoP nelze běžně obchodovat
      (`canTradeItem`). Tabulky `trades` + `trade_items` (migrace `0015`),
      `TradeModule`. Web `/characters/[id]/trade` (+ „Trade" u přátel). Testy:
      shared `trade.test.ts` (+3) + API `trade.flow.test.ts` (+6). Detail:
      **ADR 0019**. Trade-window pro soulbound (BoP) loot = follow-up.

#### E) Ekonomická pravidla → **vyčleněno do samostatného milníku M8.6** (viz níže)

> Po reviewu vyčleněno: soulbound/BoP (`bindType`) + weekly lockout + trade-window
> jsou soudržný ekonomický balíček ortogonální k bojovým/mode změnám → vlastní
> milník **M8.6** (viz níže). Trade-window samotné závisí na P2P trade (D, M9).

#### Pořadí (doporučení) & zbývající rozhodnutí

Doporučené pořadí kvůli závislosti na social (aktualizováno — týmové arény jsou
ruční, tedy až po M9):
`M8 → M8.5-A (wipe/retry) ✅ + M8.5-B-group-PVE (idle) + M8.5-D-personal-loot + M8.6
→ M9 (social) → M8.5-B (guild ruční formace) + M8.5-C (3v3/5v5 ruční týmy) + M8.5-D-trade`.

Vyřešeno PM: rozsah módů (SP+3/5+raid, vše iterativní), boss-easing per wipe + hard
fail bez útěchy, klesá XP/zlato/loot-šance, arena 3v3/5v5 + ad-hoc rating per hráč,
personal loot + trade, soulbound/BoP + weekly lockout.

Zbývá doladit (balanc, M9-ish, na začátek M8.5):
- Konkrétní křivky: boss-easing per wipe, klesání odměn/loot-šance, strop pokusů.
- Trade-window délka + omezení (anti-griefing/escrow).
- Group dungeon scaling 3 vs 5 (analog `scaleBoss`).
- Architektura: sjednotit dungeon+raid pod „group PVE run" (refaktor SP dungeonu
  z `character_activities` na run model).

**Posouzení (na žádost PM):** model je **soudržný a realizovatelný**, konzistentní
s idle-first i determinismem (seed per pokus). Hlavní práce: (1) refaktor combat na
per-boss iterace + boss-easing + reward/loot curve + hard fail ✅, (2) sjednocení
dungeon/raid run modelu (+ SP/3/5 módy), (3) arena 3v3/5v5, (4) ekonomika (M8.6).
Guild-vázané části čekají na M9 social.

### M8.6 — Ekonomika: soulbound/BoP & weekly lockout — ✅ hotovo

> Vyčleněno z M8.5-E. Soudržný ekonomický balíček, který chrání AH a progresi
> před zaplavením idle farmením. Ortogonální k bojovým módům.

- [x] **Soulbound / Bind-on-Pickup (`bindType` na itemu).** `ItemDef.bindType`
      (`none` | `bop` | `boe`) ve `@game/shared`, naplněný z katalogových seznamů
      `BIND_ON_PICKUP` / `BIND_ON_EQUIP` (jediný zdroj pravdy). Raid/dungeon
      **personal loot je BoP**; high-end craft/world gear BoE; zbytek none.
      Helpery `itemBindType` / `isSoulbound` / `isAuctionable`.
- [x] **AH: BoP neprodejný.** `isAuctionable` = známý & ne-BoP; `createListing`
      odmítne soulbound („Soulbound items cannot be auctioned"), sell UI je
      filtruje. (Trade-window soulbound itemů závisí na P2P trade → **M9**.)
- [x] **Weekly lockout / raid ID.** Deterministicky dle **UTC týdne**
      (`@game/shared/lockout.ts`: `weeklyLockoutId` = pondělí `YYYY-MM-DD`,
      `lockoutIdForContent`). Všechny raidy + vyšší dungeon (Scarlet Monastery);
      první vítězný run v týdnu zamkne, další clear týž týden = 0 odměny. DB
      `character_lockouts` (migrace `0010`) + `LockoutModule`/`LockoutRepository`,
      kontrola při grantu odměn (raid i dungeon). Run view vystaví `myLockedOut`.
- [x] **Testy:** shared unit (`economy.test.ts`, +13: bindType/isAuctionable/
      weekly lockout/lockoutIdForContent) + API flow (raid lockout + reset, dungeon
      scarlet lockout vs ragefire farm, AH BoP odmítnut). Build/test/lint/typecheck
      zelené (142 shared + 77 API). Migrace přes `db:generate`.
- Detail: **ADR 0015**, `docs/systems/items.md`, `auction-house.md`, `raids.md`,
  `combat-dungeons.md`.
- **Výstup:** epic/raid loot je vázaný (BoP) a omezený weekly lockoutem; AH zobrazí
  jen obchodovatelné itemy. ✅
- **Zbývá doladit (M9):** délka + escrow trade-window (P2P trade), které další
  dungeony pod lockout, BoE equip-bind tracking.

### M9 — Polish, balanc, pixel grafika, sociální 🚧

Sociální základ je gatekeeper pro odložené M8.5-C (týmové arény), M8.5-B (raid
lobby) a M8.5-D (P2P trade) — staví se první.

- [x] **Friends** (per-postava, vanilla-WoW styl): žádost dle jména, accept/
      decline, mutual auto-accept, removeFriend; tabulka `friendships` (migrace
      `0011`), `SocialModule` (controller/service/repository), sdílené helpery +
      realtime relay (recykluje WS vrstvu z M7). Web `/characters/[id]/social`.
      Testy: shared `social.test.ts` (+7) + API `social.flow.test.ts` (+9).
      Detail: **ADR 0016**, `docs/systems/social.md`.
- [x] **Chat**: jednoduchý globální kanál — persistence (`chat_messages`, migrace
      `0012`) + realtime přes WS gateway (`SocialGateway`) recyklující Redis pub/sub
      adaptér z M7; REST (`/chat`) autoritativní fallback. Sdílená normalizace
      (`sanitizeChatMessage`). Web chat panel na `/characters/[id]/social` + live
      friend notifikace (`social:subscribe`). Testy: API `chat.flow.test.ts` (+4).
- [x] **Whisper (online-only 1:1)** ✅: realtime přes WS (`whisper:send` →
      doručení jen když je příjemce online, `fetchSockets` napříč instancemi přes
      Redis adaptér; bez perzistence). Chat bublina má whisper režim (z karty
      hráče), příchozí/odchozí whispery + notifikace. Offline → fallback na Mail.
- [x] **Mail (offline zprávy + přílohy)** ✅: perzistentní pošta mezi postavami
      (alternativa k online whisperu). Přílohy itemů (jen obchodovatelné,
      `canTradeItem`) + zlato s **escrow** při odeslání a vyzvednutím příjemcem.
      Tabulky `mail` + `mail_items` (migrace `0024`), `MailModule`, web
      `/characters/[id]/mail` (compose s přílohami + inbox read/claim/delete),
      akce „Send mail" na kartě hráče, unread notifikace. Test `mail.flow.test.ts`.
- [x] **Guild základ**: per-postava členství (nejvýše jedna guilda), ranky
      member/officer/leader, pozvánky (accept/decline), kick/promote/demote,
      leave s auto-předáním vedení (nebo disband posledního). Tabulky `guilds` +
      `guild_members` + `guild_invites` (migrace `0013`), `GuildModule` v rámci
      `SocialModule`. Web `/characters/[id]/guild` + realtime `guild:invite`.
      Testy: shared `guild.test.ts` (+5) + API `guild.flow.test.ts` (+9). Detail:
      **ADR 0017**, `docs/systems/social.md`. Odemyká M8.5-B/C (ruční formace).
- [x] **Guild charter (vanilla-WoW založení)** ✅: místo okamžitého vytvoření se
      guilda zakládá přes charter — **zlatý poplatek** (`GUILD_CHARTER_COST`) +
      **5 podpisů** od jiných hráčů (`GUILD_CHARTER_SIGNATURES_REQUIRED`). Tabulky
      `guild_charters` + `guild_charter_signatures` (migrace `0022`), endpointy
      `guild/charter*` (start/invite/sign/found/cancel), realtime
      `guild:charter_invite`. Web flow na `/characters/[id]/guild`. Test:
      `guild.flow.test.ts` (+1). Poplatek = gold sink (bez refundu při zrušení).
- [x] **Achievementy** ✅: odvozené z herního stavu (level/gold/questy/dungeony/
      raidy/arény/přátelé — žádné invazivní countery), katalog ve `@game/shared`,
      jednorázové odměny (`character_achievements`, migrace `0017`),
      `ProgressionModule`. Web `/characters/[id]/achievements`. Testy: shared
      `achievements.test.ts` (+3) + API `progression.flow.test.ts` (+5). ADR 0021.
- [x] **Denní/týdenní cíle** ✅: časově omezené (UTC den / pondělí, deterministický
      reset), recyklují metriky (questy/dungeony/raidy v období), jednorázová
      odměna za období (`character_goal_claims`, migrace `0018`). Sdílené
      `@game/shared/goals.ts`. Web: sekce na `/characters/[id]/achievements`.
      Testy: shared `goals.test.ts` (+5) + API (+2). ADR 0021.
- [x] **Trvalá skupina (party)** ✅: jeden formační systém pro **dungeon/raid/arénu**
      (`groups` + `group_members`, migrace 0020). Leader zve friends/guild do rolí,
      skupina přežívá mezi aktivitami; launch → `DungeonService.runForGroup` /
      `RaidService.runForGroup` / aréna (velikost → bracket 1v1/3v3/5v5). **Nahradilo
      raid lobby (M8.5-B) i ruční team arénu (M8.5-C)** — bez NPC backfillu, recykluje
      run/aréna enginy. `GroupModule`, web `/characters/[id]/group`. Testy: shared
      `party.test.ts` (+3) + API `group.flow.test.ts` (+7). **ADR 0022**,
      `docs/systems/groups.md`.
- [x] **UI refresh (modern fantasy) — jádro** ✅: design system (tokeny +
      komponentní třídy v `app.css`), sdílené komponenty (Avatar, Badge, HubCard,
      PlayerProfile/inspect, NotificationBell, Toasts, ChatBubble), perzistentní
      shell (`characters/[id]/+layout.svelte`) s top barem, **group stripem**
      (členové/role/level/class viditelní odkudkoli), kompaktní nav, notifikacemi
      a chat bublinou. Login/register/landing/výběr postav + všechny podstránky
      převedeny na design system. Nový backend `GET /characters/:id/inspect`
      (gear/ilvl/staty); klik na jméno hráče (chat/party/friends) → profil-modal
      s inspectem a akcemi (whisper/group/trade/guild). Trade tlačítko odebráno
      (obchod z profilu hráče). Asset spec pro malířku: `docs/systems/ui-art-assets.md`.
- [x] **Quest narrative + combat overhaul** ✅: questy už nejsou „nudný timer" —
      jsou **vícekrokový příběh** (narativní beaty prokládané auto-resolved combaty),
      generovaný deterministicky při claimu (`questLog` v `ClaimResult`). Idle
      zachováno (jeden běh, žádná migrace, žádná nová interakce); **combat nelze
      prohrát** (silnější postava = čistší boj, slabší = víc utržených ran, ale
      quest se vždy dokončí) → odměny netknuté. `QuestDef.steps` (story) +
      `events`/`eventCount` (repeatable = deterministicky generovaná podmnožina →
      pokaždé jiný průběh). Engine `@game/shared/quest-run.ts` recykluje
      `computeHit`/`applyAbsorb` + `RotationService.buildCombatProfile`. **Dungeon
      attunement** (`DungeonDef.attunement.questAnyOf`, vzorově Ragefire Chasm).
      Rozsah: engine + bohaté startovní zóny **Northshire** (Alliance) + **Durotar**
      (Horde) + lore; ostatní zóny fallback (doplní se v content passu). Testy:
      shared `quest-run.test.ts` (+8) + API questLog/attunement. **ADR 0024**,
      `docs/systems/questing.md`.
- [x] **PixiJS pixel scénky** ✅ — první PixiJS rendering vrstva v projektu:
      izolovaná, **deterministická** (seedovaná přes `SeededRng`/`seedFromString`)
      procedurální pixel-art scenérie pro zóny/dungeony/raidy místo plochých CSS
      placeholderů. Data-driven katalog témat (`apps/web/src/lib/scenes.ts`:
      paleta + hřebeny siluet + midground propy + částice per id) → renderer
      `PixiScene.svelte` (Pixi 8, SSR-safe dynamický import, CSS-gradient fallback,
      respektuje `prefers-reduced-motion`) + prezentační `SceneBanner.svelte`.
      Zapojeno do hlaviček: quests / dungeons / raids list + dungeon/raid **watch**.
      Čistě kosmetické (žádná herní logika). _Reálné PNG bannery/portréty zůstávají
      na malířce (viz `ui-art-assets.md`) — tohle je „mezikrok" zmíněný v asset specu._
- [ ] Balanc pass, legacy úklid a další refinementy → viz **M10+ backlog** níže.
- **Výstup:** vyladěná, vizuálně oživená hra.

> ℹ️ **Onboarding/tutoriál odložen do M11** (rozhodnutí PM) — viz níže.

### M11 — Onboarding & tutoriál (odloženo)

- [ ] Tutoriál/onboarding nového hráče: provedení základní idle smyčkou
      (vytvoř postavu → pošli questovat → claim odměn → equip gearu → talenty),
      kontextové nápovědy, bez nové herní mechaniky (čistě UX vrstva).

### M12 — Content expansion: questy, lore, dungeony, raidy 🧑‍💼

> Navazuje na M9 quest narrative + combat overhaul (ADR 0024): engine je hotový,
> tohle je **velká dávka obsahu**. Vše staví na existujících systémech (quest
> steps/events, `DungeonDef.attunement`, `RaidAttunement`) — žádná nová mechanika,
> jen data + balanc. Realizovat inkrementálně (po zónách / instancích), ne najednou.
>
> **Status: rozpracováno** — 1. inkrement: **nové zóny 40–60 ✅** (Eastern
> Plaguelands / Felwood, plný narativní questline + frontier loot bracket);
> 2. inkrement: **+2 raidy + attunement ✅** (Zul'Gurub lvl 50 + Temple of
> Ahn'Qiraj lvl 58); 3. inkrement: **+4 dungeony 40–60 ✅** (Zul'Farrak / Maraudon /
> Blackrock Depths / Stratholme); 4. inkrement: **attunement questlines pro všechny
> 40–60 instance ✅**; 5. inkrement: **+2 nízké dungeony (Wailing Caverns 17,
> Blackfathom Deeps 24) + attunement pro VŠECHNY dungeony ✅** (každý dungeon i raid
> má teď vlastní questline); 6. inkrement: **fallback zóny dopsány ✅** (Westfall/
> Duskwood/Barrens/Thousand Needles — viz níže).

- [x] **Velké množství story questů napříč úrovněmi** ✅ (M12.7): vícekrokové
      (narativní beaty + auto-resolved combaty), ve stylu Northshire/Durotar z M9.
      Cíl: aby grind 1–60 nebyl pár questů dokola, ať je vždy „co dělat dál".
      **72 → 108 story questů** (+36, paralelně Alliance/Horde): Northshire/Durotar
      +4 (vsunuto mezi `_brotherhood_intel`/`_burning_blade` a raid-attunement
      gate), Westfall/Barrens +4 (vsunuto do existujícího 7-dílného řetězce),
      Duskwood/Thousand Needles +4 (vsunuto do 6-dílného řetězce), Eastern
      Plaguelands/Felwood +6 (rozšíření 3-dílné frontier story na 9 dílů, capstone
      na lvl 60). Odměny dál kalibrované (`600·√L·h` XP / `40·√L·h` gold), žádná
      kotevní quest ID (referencovaná z attunementů/testů) nezměněna — nové questy
      vsunuty jako mezičlánky přes `requiresQuest` redirect.
  - [x] **Nové 40–60 zóny** (M12.1): Eastern Plaguelands (Alliance) + Felwood
        (Horde), paralelní 3-dílná story questline (lvl 40/48/55, plné narativní
        `steps` + combat). Odměny kalibrované (`600·√L·h` XP / `40·√L·h` gold).
        Nový loot bracket `bracket_4` (ilvl ~45–56, 14 nových itemů napříč armor
        typy + zbraň/štít/plášť/šperky, 1 epic). Při tom opraven loot bug: Barrens
        mapovaný špatným klíčem (`the_barrens`) → questy v Barrens nedropovaly loot.
        (Pozn.: per-zone repeatable questy později nahrazeny „Gone Questing", ADR 0025.)
- [ ] **Lore rozdělený po zónách** — každá zóna má soudržný příběh/téma (frakce
      kosmetická → Alliance/Horde paralelně). Lokace, NPC, nepřátelé, motiv questline.
      - [x] Nové 40–60 zóny (Eastern Plaguelands / Felwood) — viz výše.
      - [x] Dopsat narativní `steps`/lore zbylých fallback zón
            (Westfall/Duskwood/Barrens/Thousand Needles) — engine hotový, jen obsah.
            Westfall/Barrens (lvl 10–24, paralelní 7-dílné questline) a Duskwood/
            Thousand Needles (lvl 25–38, paralelní 6-dílné questline) plně přepsané
            na vícekrokový narativ (steps + auto-resolved combaty), zónové gate-questy
            (`epl_argent_dawn`/`fw_cenarion_aid`) přesměrované na nové konce řetězců.
- [x] **Attunement questlinky** ✅ (M12.4 + M12.5): **každý dungeon i raid má vlastní
      plně narativní per-frakce attunement questline** (ne jen level gate). Raidy:
      `paragons_of_power` (ZG), `scepter_of_the_sands` (AQ), `drakefire_attunement`
      (BWL, doplněn o narativ), MC tier-3 capstone. Dungeony 40–60: 1-questový gate
      (`zf`/`mar`/`brd`/`culling_stratholme`). Nízkoúrovňové dungeony (Deadmines/Wailing
      Caverns/Shadowfang Keep/Blackfathom Deeps/Scarlet Monastery): **2-questový řetězec**
      (`_1 → _2` přes `requiresQuest`). Celkem +20 attunement questů v M12.5. Testy:
      shared `group.test.ts` + API `dungeon.flow.test.ts`. Detail: `docs/systems/combat-dungeons.md`.
- [x] **+4 dungeony** ✅ (M12.3): **Zul'Farrak** (42), **Maraudon** (46), **Blackrock
      Depths** (52), **Stratholme** (58) — vyplňují dříve prázdné pásmo 40–60 (obsah
      předtím končil na Scarlet Monastery lvl 30). Trash + boss encountery škálované
      velikostí party (recyklují group-run model + combat engine), boss loot tabulky
      (`DUNGEON_LOOT_TABLES`) + 12 nových BoP dungeon itemů (`items.ts`). BRD i Stratholme
      pod weekly lockout. Čistě data (web/API iterují přes `DUNGEONS`). Detail:
      `docs/systems/combat-dungeons.md`.
  - [x] **+2 nízké dungeony** ✅ (M12.5): **Wailing Caverns** (17) + **Blackfathom
        Deeps** (24) vyplňují pásmo 15–30 (+4 nové BoP itemy, loot tabulky). Spolu
        s attunementy (viz níže) má teď **každý** dungeon vlastní questline.
- [x] **+2 raidy + attunement** ✅ (M12.2): **Zul'Gurub** (lvl 50, 10/20, Venoxis /
      Mandokir / Hakkar) + **Temple of Ahn'Qiraj** (lvl 58, 10/20, Skeram / Sartura /
      C'Thun) — vyplňují progresní pásmo MC (40) → ZG (50) → BWL (55) → AQ (58).
      Bossové se škálují velikostí (`scaleBoss`), raid loot je BoP + weekly lockout
      (recykluje M8/M8.6 mechaniku), attunement = level + plně narativní per-frakce
      questline (`al_/ho_paragons_of_power`, `al_/ho_scepter_of_the_sands`) navázaná
      na frontier zóny (EPL / Felwood). AQ shazuje legendu `aq_scepter_shifting_sands`
      (C'Thun). **Čistě data** — combat/run model i web/API beze změny (vše iteruje
      přes `RAIDS`). Testy: shared `raid.test.ts` (+4). Detail: `docs/systems/raids.md`.
- **Výstup:** hráč má napříč celým 1–60 dost příběhového obsahu, dungeonů i raidů;
  každá instance je odemykaná vlastní questline s lore.
- **Zbývá rozhodnout (PM):** kolik zón/questů na bracket; témata nových zón 40–60;
  konkrétní dungeony/raidy (vanilla-inspirace) a jejich úrovně; rozsah loot tabulek.

### M13 — Aktivní hráč: minihra / time-killer 🧑‍💼

> **Nesouvisí** s idle jádrem — samostatná aktivita pro chvíle, kdy hráč CHCE
> aktivně hrát (čekárna u doktora, MHD, fronta). Idle hra zůstává „set & forget";
> tohle je volitelná vrstva navrch, která zabaví a ideálně se napojí na progresi
> (drobné odměny: gold/XP/materiály), ale nesmí být povinná ani pay-to-win.

- [ ] **Navrhnout koncept minihry** (vybere PM z návrhů): krátká sezení (1–5 min),
      ovladatelná jednou rukou na telefonu, offline-friendly (PWA). Kandidáti k rozpracování:
  - aktivní **combat režim** (ruční řízení rotace/abilit v reálném čase proti vlně
    nepřátel — „arcade" verze jinak idle combatu);
  - **karetní / deck** minihra postavená na talentech/abilitách postavy;
  - **dungeon-crawl / roguelite** běh (krátký, náhodný, seedovaný);
  - **puzzle / match** s herním motivem (crafting/gathering reskin).
- [ ] **Napojení na ekonomiku** — drobné, „nice-to-have" odměny (denní strop, aby
      to nebyl povinný grind); čistě kosmetické odměny jako alternativa (monetizace later).
- [ ] **Determinismus & anti-cheat** — pokud dává herní odměny, výsledek validovat
      serverem (seed/score), ne slepě věřit klientu. Sezení nezávislé na idle stavu.
- **Výstup:** hráč má „co dělat rukama" pár minut, aniž by to narušilo idle balanc.
- **Zbývá rozhodnout (PM):** který koncept; jestli vůbec dává herní odměny (vs čistě
  zábava/kosmetika); rozsah MVP.

---

## M10+ — Backlog & refinements (živý seznam)

> Sběrný, **priorizovatelný** seznam dalšího směřování (PM zadání + návrhy agenta).
> Položky se časem přesouvají do vlastních milníků/ADR, jakmile se rozpracují.
> Legenda: 🧑‍💼 = zadáno PM, 🤖 = návrh agenta.

### FEAT — obsah & systémy

- [ ] 🧑‍💼 **Overhaul chatovací karty (Friends & chat).** Stávající chat bublina +
      `/social` panel přepracovat do použitelnější komunikační vrstvy: přehlednější
      UI (kanály global/whisper/guild, historie, nepřečtené, online stav přátel),
      lepší práce s whispery a notifikacemi, plynulejší realtime (recyklovat WS
      Redis pub/sub z M7). Funkčně staví na hotovém social/chat/whisper/guild (M9);
      jde primárně o UX/redesign, případně guild chat kanál (viz follow-up níže).
- [ ] 🧑‍💼 **Late-game obsah 40–60 (priorita po M9 balanc passu).** Progresní
      křivka klade **64 % cesty** do pásma 40–60 (viz `docs/systems/progression.md`),
      kde je dnes tenký obsah (dungeony končí Scarlet Monastery lvl 30–38, pak jen
      repeatable questy + 2 raidy). Doplnit zóny/questlinky a **dungeony pro 40–60**,
      ať dlouhý grind není na jednom questu. Závisí na cílové křivce jako kotvě tempa.
  - [x] **Zóny + questy 40–60** (M12.1): Eastern Plaguelands / Felwood (story
        questline 40/48/55 + `bracket_4` loot). Idle filler napříč levely teď nese
        „Gone Questing" (ADR 0025).
  - [x] **Dungeony a raidy 40–60** (M12.2/M12.3): +2 raidy (Zul'Gurub 50, Temple
        of Ahn'Qiraj 58) + 4 dungeony (Zul'Farrak 42 / Maraudon 46 / Blackrock
        Depths 52 / Stratholme 58). Content gap 40–60 zaplněn.
- [ ] 🧑‍💼 **Více a kvalitnějších questů napříč úrovněmi.**
  - [x] **Repeatable questy nahrazeny „Gone Questing"** (ADR 0025): generická idle
        aktivita s hráčem volenou délkou (5 min–12 h), level flexuje s hráčem,
        odměny/loot podle času. Fixuje „na nízkých levelech jen krátké questy" a
        odpadá nutnost psát hromady filler questů (count neovlivňuje tempo, to drží
        XP křivka). Story questy zůstávají kurátorovaná páteř.
  - [x] **Narrative engine + vícekrokové story questy s combatem** (M9, ADR 0024):
        startovní zóny Northshire + Durotar přepsané jako příběh (beaty + auto-resolved
        combaty + lore); repeatable = deterministicky generované náhodné události.
  - [x] **Dopsat steps/lore pro zbylé zóny** (Westfall/Duskwood/Barrens/Thousand
        Needles) — engine hotový, jde o obsah. Raid-attunement questy řešeny
        samostatně (viz M12.4/M12.5 výše).
  - [ ] Questy s **reálným combat cílem** (kill/clear řešený enginem s rizikem, ne
        jen flavor uvnitř idle questu).
  - [x] **Dungeon attunement questline** (M9 + M12.4 + M12.5): **každý dungeon** má
        teď vlastní attunement questline. 40–60 dungeony 1-questový gate; nízkoúrovňové
        (Deadmines/Wailing Caverns/SFK/Blackfathom Deeps/Scarlet Monastery) 2-questový
        řetězec. Raidy dtto (viz „Attunement questlinky" v M12).
- [x] 🧑‍💼 **Mounty** ✅ — velmi drahé, od vyššího levelu (vanilla styl). Zrychlují
      questy a gathering (snižují `durationSec` aktivit). Kosmeticky oddělené
      (skin) od bonusu (speed) → kompatibilní s monetizací. 2 tiery (basic
      lvl 30/+30 %, epic lvl 50/+50 %), víc kosmetických variant per tier se
      stejným bonusem; **speed odvozený z vlastněného mountu, ne z aktivního
      vizuálu** → monetizace bez refaktoru. `@game/shared/data/mounts.ts`,
      `MountModule`, tabulka `character_mounts` + `characters.active_mount_id`
      (migrace `0021`), web `/characters/[id]/mounts`. Testy: shared (+10) +
      API flow (+8). Detail: `docs/systems/mounts.md`, **ADR 0023**.
- [ ] 🧑‍💼 **Admin panel**: u seznamu účtů rozkliknout jejich postavy (drill-down
      account → characters → inspect). Rozšiřuje stávající `/dev/mod`.
- [x] 🧑‍💼 **Armor typy** (cloth / leather / mail / plate) ✅: `ItemDef.armorClass`
      (naplněné z `ARMOR_CLASS_BY_ITEM`, jen armor sloty `ARMOR_SLOT_TYPES`) +
      `CLASS_ARMOR_PROFICIENCY` (vanilla-style: warrior/paladin=plate↓,
      hunter/shaman=mail↓, rogue/druid=leather↓, priest/mage/warlock=cloth).
      Gate `canEquipArmor` vynucen v `InventoryService.equip`. Itemizace přes stat
      afinitu (str/agi/int/stam/spirit). Doplněn základní cloth set pro cloth-only
      classy. Testy: shared `data/armor.test.ts` (+6) + API inventory flow (+2).
      Detail: `docs/systems/items.md`.
  - [ ] **Více gearu** (zbývá): víc kusů napříč tiery/typy pro plnou itemizaci
        (tank/melee-dps/caster-dps/heal). Mechanika hotová, jde o obsah/balanc.
- [x] 🧑‍💼 **Omezený inventář + batohy** (WoW styl) ✅: konečný počet slotů
      (`BASE_BACKPACK_SLOTS` 16) + `BAG_SLOT_COUNT` (4) bag slotů, do nichž se
      vkládají batohy o N slotech (`bagSlots`). Stackování přes `itemMaxStack`
      (gear/batoh 1, materiál/spotřebák `STACKABLE_MAX` 20); využité sloty se
      dopočítávají (`usedSlots`/`planGrant`, `@game/shared/inventory.ts`). Tabulka
      `character_bags` (migrace `0026`), `BagService`/`BagController`. **„Bag full"
      → overflow do pošty** (rozhodnutí PM, vanilla): centrální `InventoryGrantService`
      protáhne všechny reward/transfer cesty (quest/dungeon/raid loot, aukce,
      trade); player-akce (vendor nákup, claim pošty) se při plném blokují.
      `MailRepository` vyčleněn do leaf `MailDataModule` (bez DI cyklu). Web:
      kapacita + bag sloty na `/inventory`. Testy: shared `inventory.test.ts` (+10)
      + API `bag.flow.test.ts` (+5). Detail: `docs/systems/inventory-bags.md`.
  - [ ] **Craftovatelné batohy** (zbývá): tailoring/leatherworking + cloth/leather
        materiály (vzácnější = větší batoh) — vyžaduje novou profesi. Batohy zatím
        u vendora.
  - [ ] **Banka** (úložiště mimo batoh) — follow-up.
- [ ] 🧑‍💼 **„Živá" aukce — seedované nabídky od ne-hráčů.** Aukční dům doplnit
      o NPC/bot listingy, aby působil obydleně (zvlášť při malém počtu hráčů).
      Generovat **deterministicky přes `SeededRng`** (ne `Math.random()`) — rotace
      nabídek dle UTC dne/hodiny, ceny v rozumném rozpětí kolem referenční hodnoty
      itemu, omezené množství. Hráč může od NPC listingu koupit (gold sink); NPC
      „nakupují" jen virtuálně (nezasahují do reálných hráčských aukcí). Vyžaduje
      **aukční dům** jako systém (zatím není — kandidát na vlastní ADR; sdílí
      ekonomiku s vendory/goldem).
- [x] 🤖 **Vendoři (NPC odkup/prodej) + „use" consumables/buffů** ✅ (zbytek z M6):
      `VendorModule` (pevné ceny `vendorBuyPrice`=value×5 sink / `vendorSellPrice`
      source; sortiment `VENDOR_STOCK` se startovním gearem napříč armor typy; BoP
      lze prodat, na AH ne) + `ConsumableModule` (use → dočasný stat buff
      `CONSUMABLE_BUFFS`, tabulka `character_buffs` migrace `0025`, přičítá se do
      bojového profilu přes `getEquipmentStats`). Web `/vendor` + `/consumables`.
      Testy: shared `vendor.test.ts` (+7) + API `vendor.flow` (+5) / `consumable.flow`
      (+4). Detail: `docs/systems/vendor-consumables.md`.
- [ ] 🤖 Reputace i z questů/dungeonů (retrofit), 40-player raid.
- [x] 🤖 **2v2 aréna bracket** ✅: skupina o 2 → 2v2 (`arenaBracketForSize`,
      `TEAM_BRACKETS`); engine/Elo/watch generické. Testy: shared + team-arena flow.

### MIL — combat overhaul (WoW-like log + rotace/priority)

> 🧑‍💼 Gigantický zásah do všech faktorů hry. Cíl: divácky zajímavý combat
> (arény/dungeony/raidy) + hloubka pro min-max. **Mana zatím ne — jen cooldowny.**

- [x] **WoW-like combat log** ✅ — `CombatEvent` rozšířen o typy `drain`/`dot`/
      `absorb` + strukturovaný anglický text. Nové mechaniky v enginu: lifesteal
      úder = `drain` („🩸 *X* drains *Y* for N, healed for M"), capstone DoT
      ability (Pyroblast, Unstable Affliction) = úder + krvácení/hoření tiky
      (`dot`, fixní → bez RNG perturbace = determinismus zachován), absorpční štít
      (Ice Barrier, Holy Shield přes `SHIELD_TAGS`) pohlcuje příchozí poškození
      (`absorb`). Kurátorovaný **ability katalog** s druhy (`data/abilities.ts`:
      `AbilityKind` strike/drain/dot/heal/shield). Sdílené napříč raid/dungeon
      (`fightBoss`) i PVP (`simulatePvpDuel`/`simulateTeamFight`) přes
      `applyAbsorb` — žádná duplikace. Web log barevně rozlišuje nové typy ve
      všech watch view (raid/dungeon/arena/team). Testy: `combat-overhaul.test.ts`
      (+8). _Follow-up: DoT tiky i v PVP (zatím jen base úder); heal/shield
      ability pro healery (zatím léčí passivně `healPower)._
- [x] **Deklarativní rotace / spell priority** ✅ (idle-friendly, deterministické).
      Rotace = seřazený seznam pravidel `{ ability → podmínka }` na postavě
      (`@game/shared/rotation.ts`): podmínky nad levným deterministickým stavem
      (HP% cíle / HP% sebe), priorita = pořadí, ability lze vypnout. Engine
      (`fightBoss` v raid/dungeon + `simulatePvpDuel`/`simulateTeamFight`) při
      „ready" ability vyhodnotí pravidlo (`shouldCastAbility`); **default = always
      → chování beze změny** (zpětně kompatibilní, determinismus zachován).
      Persistence per postava: `character_rotations` (migrace `0027`),
      `RotationModule` (GET/PUT `/characters/:id/rotation`, sanitizace proti
      odemčeným ability), zapojeno do snapshotu profilu ve všech 4 combat
      službách (dungeon/raid/arena/team). Web editor `/characters/[id]/rotation`
      (priorita, podmínky, prahy, enable/disable). Testy: shared `rotation.test.ts`
      (+11) + API `rotation.flow.test.ts` (+5).
- [x] **Ability kit per class (MIL)** ✅ — aby rotace nebyla prázdná: každá class má
      **baseline kit ~3-4 abilit** odemčených **levelem** (`CLASS_BASELINE_ABILITIES`
      v `data/abilities.ts`: Heroic Strike/Rend/Execute, Fireball/Scorch, Shadow
      Bolt/Corruption/Drain Life, …) navrch capstone (talent). Sjednocený resolver
      `resolveAbilities(klass, level, tags)` = jediný zdroj pravdy pro engine i
      editor rotace. **Healerské heal-spelly** (Holy Light, Greater Heal/Renew,
      Healing Wave/Chain Heal, Healing Touch/Rejuvenation) zapojené do enginu:
      `fightBoss` routuje `member_ability` dle druhu — heal-kind jen healer (léčí
      nejzraněnějšího), offensive na bosse; PVP heal/shield ability přeskakuje.
      Testy: shared `combat-overhaul.test.ts` (+4: resolveAbilities + healer heal
      ability). _Follow-up: víc podmínek rotace (ability ready/enemy count)._
- [x] **Healer offensive/defensive režimy** ✅ — healer si přes rotaci (enable/
      disable spellů) volí: **pure HPS** (vypne útočné → jen léčí), **hybrid**
      (default, léčí + přihazuje slabý DPS), **pure DPS** (vypne heal spelly →
      jen slabě útočí). Engine: basic swing healera respektuje rotaci přes
      `isAbilityEnabled`. Netýká se tanků. Testy: `combat-overhaul.test.ts` (+3).
- [x] **DPS/HPS metr** ✅ — web `CombatMeters.svelte` (defaultně sbalený
      `<details>`) ve všech watch view (raid/dungeon/aréna/team-match): per-aktér
      damage/healing z událostí logu (`attack`/`ability`/`dot`/`drain` → DPS,
      `heal` → HPS), bary + řazení. Čistě klientské (okno = poslední odhalená událost).
- [x] **Popisy abilit + execute mechanika** ✅ — každá hráčská ability (baseline +
      capstone) má `description` (EN tooltip, viditelný v editoru rotace). Reálná
      **execute** mechanika: `executeBelowPct` + `executeDamageMult` na ability →
      vyšší poškození proti cíli pod prahem HP (Warrior Execute 220 % → **330 %**
      pod 30 %, Rogue Eviscerate 190 % → 280 %). Sdílený `abilityDamageMult(ability,
      targetHpPct)` aplikován v PVE (`fightBoss`, log „(execute!)") i PVP
      (duel + team). Testy: shared `combat-overhaul.test.ts` (+3)._
  - **Návrh řešení agenta (🤖):** rotace = **seřazený seznam pravidel** uložený na
    postavě (per role/kontext): `{ podmínka → ability }`. Podmínky jen nad
    levným, deterministickým stavem actora (self HP%, target HP%, ability ready
    (cooldown), počet nepřátel, role). Combat tick (už event-driven + seeded)
    místo fixních signature abilit **vyhodnotí první splněné pravidlo** → zvolí
    ability/úder. Tím zůstává **plně deterministické a server-authoritative**
    (lze přehrát ze snapshotu+seedu jako dnes) a zároveň konfigurovatelné.
  - [x] **Kontextové rotace** ✅ — `isAbilityEnabled` (engine): healer s vypnutými
        heal-spelly neléčí ani basic swingem (čistě dmg rotace), s vypnutými
        útočnými spelly jen léčí; tank mitigation cooldowny (Shield Wall/Ardent
        Defender) řízené stejnou deklarativní rotací.
  - [x] **Rebalance talentů** ✅ — overhaul `data/talents.ts`: 9 class × 3 stromy ×
        **9 nodů**, **kapacita ~34 bodů/strom** (3 stromy = 102). Na cap 60 = 59
        bodů → **nelze naplnit vše**, vyjde **1 a 3/4 stromu** (rozhodnutí PM).
        Mix: filler (staty/HP) + „zábavné" pasivní procy (crit/dmg/haste/lifesteal/
        štít) + **capstone = nový spell** (tier 28). Doplněno **13 nových capstone
        spellů** (Shield Slam, Holy Shock, Avenger's Shield, Explosive Shot,
        Shadowstrike, Penance, Guardian Spirit, Mind Blast, Riptide, Arcane Power,
        Frostfire Bolt, Demonbolt, Tranquility) — všechny stromy teď odemykají
        reálnou ability. Žádné dead talenty (každý tag → reálný efekt). Testy:
        shared `data/talents.test.ts` (+7: kapacita/1.75-strom/no-dead-tag).
        _Follow-up: plný prerekvizitní graf (šipky) místo tier-gate — UX nice-to-have._
  - [x] **Balanc síly specců + tank role** ✅ — deterministicky změřeno (sim přes
        engine, DPS/HPS proti dummy) a vyladěno: spread DPS specců stažen z ~1,9×
        na ~1,5× (hybridi ↑: feral/ret/balance/ele; čistí casteři/melee ↓: mage/
        warrior). Healeři mezi sebou ~1,26×. **Tank** = méně DMG (`TANK_DAMAGE_MULT`
        0.6→0.5, defenzivní prot stromy bez dmg nodů) + **mitigation cooldowny**:
        nová `AbilityKind 'mitigation'` (Shield Wall −50 %/8s, Ardent Defender
        −40 %/10s) jako prot capstony; engine aplikuje dočasné okno redukce
        příchozího poškození na tanka. Testy: `combat-overhaul.test.ts` (+2:
        mitigation snižuje utržené poškození). _Pozn.: spec≠role — prot talenty
        dělají málo DMG i kdyby šly do dps role (posiluje identitu)._
  - [x] **Balanc pass 2 — DPS rozptyl ~1,3×** ✅ (žádost PM): změřeno přes engine,
        DPS specy staženy na **1,30×** (1020–1328, band 88–115 % průměru). Lift
        hybridů přes offensive baseline (Lightning Bolt, Wrath, Smite, Crusader
        Strike, Arcane Shot), trim špičky (Pyroblast/Frostfire/Mortal Strike/
        Unstable Affliction). **Tanky v tank roli ~0,34–0,44×** DPS průměru,
        **healeři při DPS rotaci ~0,5–0,65×** (heal-heavy kit přirozeně půlí
        ofenzivu). Rozmanitost zachována (mage/warrior nahoře, hybridi níž).
  - [x] **Drobná náhoda** ✅ do combatu — `computeHit` variance rozšířena z
        0,85–1,15 na 0,8–1,2 (pořád seedovaně reprodukovatelné, symetrické
        okolo 1,0 → balanc DPS pásem zůstává neporušen).
  - [x] **Testovací target / sandbox dummy** ✅ — `simulateDummyFight` (shared,
        recykluje `fightBoss` přes nový `maxClockSec` cutoff) + `RotationService.
        testDummy` + `POST /characters/:id/rotation/test-dummy`. Stateless,
        deterministické (seed), bez party/soupeře. UI: panel na stránce rotace
        (role + délka → spustí test, zobrazí meters + log). Testy: shared
        `raid.test.ts` (+5), API `rotation.flow.test.ts` (+3).
- [ ] 🧑‍💼 **Email login** (potvrzení e-mailu).
- [ ] 🧑‍💼 **Monetizace** (návrh připraven od M0 — kosmetika oddělená od statů):
      skiny, profilové obrázky, zrychlení, gold, volitelné reklamy.

### CHORE

- [ ] 🧑‍💼 Agresivní upozornění na nový update (verze klienta vs server → výzva
      k reloadu; service worker už máme z M3).

### BALANCE

- [x] 🧑‍💼 **Délka všech aktivit + rychlost progrese** ✅ (M9 balanc pass): XP křivka
      přeladěna (`XP_CURVE` exponent 2.0 / scale 120.8) na **cap ≈ 2200 h
      perfect-chain** s tvarem `čas-na-level ∝ L^1.5` (early rychlé, late pomalé;
      lvl 10 ≈ 22 h, cap ≈ 3–5 měsíců kalendářně). Idle cadence: všechny questy
      přeškálovány do **[5 min, 3 h]** (`ACTIVITY_DURATION_BOUNDS`) +
      `activityEfficiency` (1.0 @ 5 min → 0.8 @ 3 h, mírný punish za dlouhý běh,
      na XP i zlato). Quest odměny kalibrované na `referenceXpPerHour`; web ukazuje
      efektivní (post-eff) odměnu. Testy: shared `progression.test.ts` (+12).
      Detail + cílová křivka (podklad pro content): `docs/systems/progression.md`.
  - [ ] 🧑‍💼 **Revize drop rate** (loot tabulky napříč zónami/dungeony/raidy) —
        vědomě odloženo na samostatný pass (rozhodnutí PM).
  - ⚠️ **Content gap 40–60** (64 % cesty) — late-game obsah doplnit samostatně (FEAT).
- [ ] 🤖 PVP vs PVE balanc (společný `deriveCombatProfile` → samostatné ladění),
      role tuning (tank/healer/dps), boss HP/AP, Elo K/rampage.

### FIX

- [x] 🧑‍💼 Otočit combat log — **nejnovější události nahoře**. (dungeon/raid/arena/team-match)
- [x] 🧑‍💼 **Equip bug**: jeden prsten lze nasadit do dvou slotů zároveň.
  - [x] Item je vidět **buď** v inventáři **nebo** nasazený (ne oboje). Equip teď
        kus z inventáře spotřebuje (consume→equip), unequip/swap ho vrátí; tentýž
        kus nelze nasadit do dvou slotů. Testy v `inventory.flow.test.ts`.
  - [ ] Equip přes **drag & drop**. (samostatné UX, zbývá)
- [x] 🧑‍💼 Značení lockout instancí v UI (které jsou tento týden „saved").
      Seznam dungeonů i raidů vystavuje `hasLockout`/`lockedOut`; web zobrazí
      „🔒 Saved this week" badge u instancí vyčištěných tento UTC týden.
- [x] 🧑‍💼 **Odstranit legacy** — single-actor `simulateDungeonRun`/`computeDungeonReward`/
      `simulateDungeonFromParams`/`DungeonActivityParams`/`DungeonCombatResult` + privátní
      `fightEncounter`/`easeActor` + jen-jimi-používané konstanty; větev `'dungeon'`
      odstraněna z `ActivityType` i activity modelu (api scheduler/service, web). **Korekce
      poznámky:** `easeActor` se NEsdílel (raid používá vlastní `easeBoss`) → odstraněn
      spolu se `simulateDungeonRun`. **Zachováno** sdílené: `determinationFactor`,
      `wipeRewardMultiplier`, `computeHit`, `round1`, `buildEnemyActor`. Ověřeno
      typecheck/lint/testy (167 shared + 131 API zelené).
- [x] 🧑‍💼 **Odstranit NPC backfill** — **finální rozhodnutí PM: úplně** (dungeony 3/5,
      raidy 5/10/20 i raid lobby). Party se skládá jen z reálných hráčů z fronty/lobby;
      chybí-li hráči, run se spustí s menší partou a boss/encountery se škálují její
      velikostí (`scaleBoss`/`groupEncounters` dle `party.length`). Odstraněny i mrtvé
      shared buildery (`COMPANION_NAMES`, `buildCompanionBase`, `buildDungeonCompanion`,
      `RaidDef.companion`) a `isNpc` z run view. _Pozn.: mění idle-first rozhodnutí pro
      group obsah — potvrzeno PM. Follow-up: doladit matchmaking (rating-window/čekání
      na partu) pro plynulejší skládání bez NPC._

### Známé follow-upy (konsolidace „zbývá doladit", 🤖)

- [ ] Auth: httpOnly cookie místo localStorage + refresh rotace/revokace (ADR 0005).
- [ ] WS realtime tam, kde je teď REST polling: watch týmových arén, trade okno,
      lobby pozvánky (recyklovat Redis pub/sub vrstvu z M7).
- [ ] **Trade-window pro BoP loot** (výměna mezi účastníky téhož runu v okně) +
      **BoE equip-bind tracking** (M8.6 follow-up).
- [ ] Guild chat kanál + MOTD + (později) banka/perky.
- [ ] PWA ikony 192/512, per-postavová push granularita, `docker compose up`
      ověřit s běžícím daemonem.
- [ ] (Nepovinné) konvergence `RaidService`/`DungeonService` → `GroupRunService`.

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
- ~~Velikost raid party a počet rolí v MVP. → M8~~ ✅ vyřešeno v M8: flex velikosti 5/10/20 (modern-WoW) + hráčem volená kompozice T/H/DPS, boss scaling dle velikosti, idle-first matchmaking s NPC backfillem.
- ~~Kolik raidů/bossů + attunement model. → M8~~ ✅ vyřešeno v M8: 2 raidy × 3 bossy, attunement = level + dokončený questline.
- ~~AH model (aukce vs buyout, poplatky/expirace). → M8~~ ✅ vyřešeno v M8: buyout + bidding s depositem a 5 % cut (gold sinky) + expirace; vypořádání lazy + BullMQ.

---

## Verifikace

Pro implementační fáze platí obecný postup aplikovaný na konci každého milníku:

- **M0+**: `docker compose up` → appka naběhne, healthcheck zelený, PWA instalovatelná v prohlížeči.
- **Per-fáze**: ruční end-to-end průchod hlavní novou smyčkou + unit testy herních vzorců v `packages/shared` + integrační testy API modulu dané fáze.
- Po dokončení každého milníku: commit + push na **vývojovou větev `main`** a aktualizace tohoto plánu.
  - ℹ️ **Jediné místo, kde je vývojová větev uvedena** — pro změnu cíle pushů (např. zpět na feature větev) uprav jen tento řádek.
