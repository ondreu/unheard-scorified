# AFK to 60 — kompletní roadmapa (idle RPG, D&D-inspired)

> Living document. Po každém milníku se aktualizuje (odškrtnutí hotového, doplnění detailů další fáze).
> Toto je **single source of truth** roadmapy projektu.
>
> **Dev & Admin panel:** `/dev` (viz `docs/systems/dev-panel.md`). Každý nový systém přidává odpovídající dev/mod akce — viz konvence v tom dokumentu.

## Context

Cílem je webová **idle RPG hra inspirovaná Dungeons & Dragons** (s výraznou inspirací Baldur's Gate 3 tam, kde by D&D 5e bylo příliš komplexní nebo nevhodné pro idle formát):

- Primárně **textová**, místy oživená **pixel art** grafikou.
- **Idle** design — hráč kontroluje jen párkrát denně, ale dá se hrát i ~10 min v kuse.
- Běží na **vlastním Dockeru**, instalovatelná na telefon jako **PWA** s **push notifikacemi**.
- **Singleplayer-first** s multiplayer prvky: Arény = MP PVP, Dungeony = SP/group PVE, Raidy = MP PVE. Vše idle, minimální nutná interakce.
- Systémy à la D&D 5e / BG3: leveling 1–20 (TBD: 12/15/20), třídy a podtřídy dle D&D, rasy dle D&D, Armor Class, tiered spell sloty, turn-based combat s dice rollem, veřejná backstory postavy, guilda přístupná od lvl 1.

Toto je **velmi velký, vícesezónní projekt**. Implementace probíhá inkrementálně po milnících (viz Roadmapa).

---

## Vize hry v kostce

| Aspekt          | Rozhodnutí                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Žánr            | Idle / incremental RPG s D&D-style progresí                                                                                                       |
| Smyčka          | Pošli postavu na aktivitu (quest/profese/dungeon) → běží na pozadí v reálném čase → vrať se, vyber odměny, přehoď gear/spelly, pošli na další     |
| Interakce       | "Set & forget" aktivity (hodiny) + krátké "active" sezení (10 min): správa gearu, spell slotů, rotace abilit, AH, výběr dalších aktivit           |
| Offline progres | Server dopočítá co se stalo, když hráč nebyl ve hře (server-authoritative)                                                                        |
| Estetika        | Tmavé fantasy UI, převážně text + tabulky, pixel art portréty/itemy/zóny pro oživení                                                             |

---

## Klíčová rozhodnutí PM (potvrzeno) & průřezové principy

Tato rozhodnutí platí napříč všemi fázemi a jsou pro projekt závazná:

1. **Vývoj řízený AI — agent-first kódová báze.** Celý projekt staví AI agenti; PM (uživatel) zadává směr a schvaluje. Kódová báze proto MUSÍ být optimalizovaná pro to, aby na ní mohli **různí agenti pohodlně a nezávisle pracovat** (viz sekce „Vývoj řízený AI" níže). To je tvrdý požadavek, ne nice-to-have.
2. **Škálovatelnost od základu.** Stateless API (horizontální škálování za load balancerem), stav výhradně v Postgres/Redis, žádný in-memory stav vázaný na jeden proces. Herní simulace, fronty (BullMQ) a WebSocket vrstva navržené tak, aby šly škálovat na víc instancí (Redis pub/sub adaptér, sticky sessions / shared adapter). Datový model a moduly připravené na růst contentu i hráčů.
3. **Level cap TBD (12/15/20), velmi pomalý.** XP křivka záměrně „long-haul" — lvl 1 zvládnutelný za den, lvl 3 za týden, max level za 3–5 měsíců reálného kalendářního času. Křivka jako laditelný parametr v `packages/shared`. Konkrétní cap rozhodne PM v rámci MR milníku.
4. **Frakce odstraněny.** Systém Aliance/Horda kompletně pryč (součást MR refaktoru). Případné D&D lore frakce (Harpers, Zhentarim apod.) jsou čistě kosmetické/lore, bez herního/MP dělení.
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

## Herní systémy (D&D-inspirované) — přehled

> ⚠️ **Tato sekce odráží cílový stav po MR milníku (D&D Remaster).** Implementované WoW-era systémy jsou popsány v dokončených milnících M0–M14; MR je postupně nahradí. Detailní D&D specy vzniknou v průběhu MR a žijí v `docs/systems/`.

- **Rasy** (dle D&D 5e / BG3): Human, Elf (High/Wood/Drow), Half-Elf, Dwarf (Hill/Mountain), Halfling, Gnome, Tiefling, Dragonborn, Half-Orc a další. Každá rasa = rasové schopnosti + atributové bonusy dle D&D.
- **Classy & subclassy** (D&D 5e, 12 tříd): Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard. Každá třída: D&D resource (spell sloty, Rage charges, Ki points, Superiority Dice), základní kit abilit, 2–3 subclass volby na příslušném levelu.
- **Leveling**: lvl 1 – TBD (12/15/20), D&D XP křivka přizpůsobená idle long-haul tempu.
- **Level-up odměny**: místo talent stromů → D&D systém (ASI: +2 do atributu / +1+1; nebo Feat; výběr subclass na daném levelu; nové spell sloty; nové spelly na spell list).
- **Spell systém**: tiered spell sloty (1.–9. level kouzel dle D&D tabulky), spell listy dle třídy, D&D kouzla s reálnými efekty (damage dice, saving throw, conditions). Long Rest = full recharge.
- **Staty**: D&D 6 atributů (STR/DEX/CON/INT/WIS/CHA) + odvozené (Armor Class, HP, saving throw bonusy, initiative, spell save DC, attack bonus).
- **Combat**: turn-based s dice rollem — d20 attack roll vs AC (hit/miss), damage dice, saving throws. Idle auto-resolve (rotace/priority abilit, hráč nenastavuje jednotlivé tahy).
- **Gear & equipment**: sloty (head, chest, weapon…), rarita (common→legendary), D&D-style enchanty.
- **Backstory**: při tvorbě postavy hráč zvolí D&D Background (Acolyte, Criminal, Folk Hero, Noble, Outlander, Sage, Soldier apod.) — dává skill proficiencies + lore. **Veřejně viditelná** na profilu postavy.
- **Kosmetika (skiny)**: vizuální vrstva **oddělená od statů** — vlastní entita + ownership na účtu/postavě, nikdy nedává power. Připraveno na pozdější monetizaci.
- **Inventář & měny**: gold pieces, bagy, banka.
- **Content gating**: dungeony a raidy dle levelu + quest attunement.
- **PVE**: Dungeony (SP/group, idle turn-combat auto-resolve), Raidy (MP, párty, idle s rolemi).
- **PVP**: Arény (MP, rated, idle auto-resolve), žebříčky.
- **Filler aktivity**: Gone Questing (generická idle aktivita), Profese (gathering/crafting), daily/weekly cíle.
- **Ekonomika**: Auction House (MP obchod mezi hráči), vendoři.
- **Sociální**: guilda (**přístupná od lvl 1**), friends, chat, mail. Žádné frakce.
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
  - [x] PWA ikony 192/512 do `static/` pro plnou instalovatelnost — procedurální
        pixel-art „60" (gold na tmavém podkladu) generované `scripts/generate-pwa-icons.mjs`
        (čistý Node + `zlib`, bez závislostí; any + maskable + apple-touch + favicon),
        zapojené do manifestu (`vite.config.ts`).
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

### M11 — Onboarding & tutoriál (odloženo → redesign v MR)

> Bude redesignováno v kontextu D&D character creation (MR-3: tvorba postavy + backstory flow).

- [ ] Tutoriál/onboarding nového hráče: provedení základní idle smyčkou — redesign po MR (D&D character creation, backstory výběr, spell sloty).

### M12 — Content expansion: questy, lore, dungeony, raidy 🧑‍💼

> ⚠️ **WoW naming/lore** (Ragefire Chasm, Deadmines, Molten Core, Northshire, Durotar…) bude přejmenováno v MR-8 (lore přejmenování). Engine a mechaniky zůstávají. Pending content položky jsou superseded MR content pasem.
>
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
> Duskwood/Barrens/Thousand Needles — viz níže); 7. inkrement: **questy s reálným
> combat cílem ✅** (M12.8 — opt-in `combatObjective`, souboj lze prohrát → odměna
> gatovaná vítězstvím; 4 challenge questy, viz „Lore rozdělený po zónách" níže).

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
- **Zbývá:** lore přejmenování zón/dungeonů/raidů → MR-8. Content balance → MR-10.

### M13 — Aktivní hráč: minihra / time-killer („The Gauntlet") — ✅ MVP hotovo

> **Nesouvisí** s idle jádrem — samostatná aktivita pro chvíle, kdy hráč CHCE
> aktivně hrát (čekárna u doktora, MHD, fronta). Idle hra zůstává „set & forget";
> tohle je volitelná vrstva navrch, která zabaví a napojuje se na progresi
> (drobné odměny: gold/XP/materiály), není povinná ani pay-to-win.
>
> **Koncept (PM):** mix aktivního combatu + roguelite draftu — **The Gauntlet**,
> tahová survival aréna. Detail + rozhodnutí: **ADR 0028**, `docs/systems/gauntlet.md`.

- [x] **Koncept minihry** ✅: hráč vejde se svou reálnou postavou (gear/talenty/
      spelly), kolo po kole **volí jakou ability použít** proti vlnám nepřátel, a po
      každé vyčištěné vlně si vybere **1 ze 3 odměn** (buff / kus gearu s porovnáním /
      nový spell), platné jen pro tenhle run (roguelite). Run končí smrtí nebo stropem
      vln. **Boj tahový** (rozhodnutí PM) — sedí na server-authoritative determinismus.
- [x] **Napojení na ekonomiku** ✅ (rozhodnutí PM: drobné herní odměny): XP + zlato +
      materiály škálované počtem vyčištěných vln a levelem, s **denním stropem**
      (`gauntlet_daily`, UTC den) → anti-grind. Žádný BoP gear (nenahrazuje dungeony/
      raidy); draft odměny jsou run-scoped → bez power-creepu. Monetizace-friendly
      (později kosmetické tituly/skiny za milníky vln).
- [x] **Determinismus & anti-cheat** ✅: stateful run uložen server-side
      (`gauntlet_runs.state`), klient posílá jen volbu (ability/draft), server validuje
      a dopočítá tah; náhoda jen přes `SeededRng` se **seedem per tah**. Recykluje
      bojový engine (`computeHit`/`abilityDamageMult`/`applyAbsorb`) → žádná duplikace.
- [x] **Shared engine** `@game/shared/gauntlet.ts` + **API modul**
      `apps/api/src/gauntlet/` (controller/service/repository, recykluje
      `RotationService.buildCombatProfile` + `InventoryGrantService`) + **web**
      `/characters/[id]/gauntlet` (+ `/run/[runId]`). Migrace `0034`. Testy: shared
      `gauntlet.test.ts` + API `gauntlet.flow.test.ts`. Build/test/lint/typecheck zelené
      (321 shared + 193 API).
- **Výstup:** hráč má „co dělat rukama" pár minut, aniž by to narušilo idle balanc. ✅
- **Zbývá doladit:** balanc obtížnosti vln a odměn/stropu (M9-ish); bohatší chování
  nepřátel (vlastní ability, víc nepřátel na vlnu); kosmetické odměny za milníky vln;
  případný realtime „arcade" režim jako varianta.

### M14 — Procedurální pixel-art vrstva „všude" (deep) ✅

> 🧑‍💼 Zadání PM: **výrazně rozšířit pixel-art grafiku napříč celou hrou** — od
> oživení karet, přes pozadí (celková i per-karta dle zóny), obrázky spellů,
> class, ras, frakcí až po profilové portréty. Navazuje na M9 PixiJS scénky
> (ADR 0024 zmiňuje „mezikrok"). **Přístup (rozhodnutí PM): plně procedurální,
> deterministické** — žádné externí PNG, vše generované z dat přes `SeededRng`.
> Architektura a rozhodnutí: **ADR 0027**.
>
> **Princip:** dvě vrstvy se sdíleným jádrem — (a) 2D-canvas sprite vrstva
> (`apps/web/src/lib/pixelart/`) pro malé hojné statické prvky (avatary, emblémy,
> ikony) — záměrně ne WebGL kvůli počtu prvků; (b) PixiJS (`PixiScene`) pro
> velké/animované scénky. Vše kosmetické (odděleno od statů), deterministické,
> data-driven (katalog vzhledu = jediný zdroj pravdy).
>
> Realizovat **inkrementálně** (po kategoriích), ne najednou.

- [x] **Increment 1 — Avatary + emblémy** ✅ (ADR 0027): pixel-art jádro
      (`pixelart/core.ts` — `Painter` + primitiva px/rect/sym/disc/ellipse/line/
      triangle + helpery hex/shade/mix, deterministicky přes `SeededRng`).
      **Procedurální portréty** (`pixelart/portrait.ts` + `PixelPortrait.svelte`):
      katalogy `RACE_LOOK` (8 ras: kůže/vlasy/oči+glow/uši short|long/rohy/kly/
      proporce/vousy) × `CLASS_LOOK` (9 class: barva brnění+lemu) × frakce (tón
      pozadí), deterministicky dle jména. **Procedurální emblémy**
      (`pixelart/emblems.ts` + `PixelEmblem.svelte`): 9 class crestů + 2 frakční
      znaky + 3 role ikony (geometrické glyfy). Zapojeno: `Avatar.svelte`
      (portrét + class crest badge; `src` override reálným artem má dál přednost),
      `/characters/new` (frakční crest dle rasy). Avatar je napříč appkou → projeví
      se všude (top bar, group strip, chat, inspect profil, výběr/tvorba postavy).
- [x] **Increment 2 — Spell / ability ikony** ✅: procedurální ikony pro baseline +
      signature abilities (`@game/shared/data/abilities.ts`) dle `kind`
      (strike/dot/drain/heal/shield/mitigation) + **živlu** odvozeného z názvu
      (fire/frost/shadow/holy/nature/arcane/lightning/blood…, fallback na barvu
      druhu). Jádro `pixelart/abilities.ts` (`drawAbilityIcon` na sdíleném
      `Painter` + cachovaný `abilityIconDataUrl` pro hojné výskyty) +
      `PixelAbilityIcon.svelte` (lehký `<img>` z cache). Zapojeno do combat logu
      (`CombatLog.svelte`, malá ikona před názvem ability), talent stromů
      (capstone uzly), `AbilityDetail.svelte` (velká ikona) a editoru rotace.
- [x] **Increment 3 — Pozadí karet dle zóny/instance** ✅: lehká **statická**
      varianta velkých PixiJS scén — `pixelart/scene-bg.ts` (`drawSceneThumb`
      recykluje katalog témat `scenes.ts`) vykreslí miniaturu jednou, nacachuje
      jako **data-URL** a sdílí ji přes CSS proměnnou `--scene-bg`. Třída
      `.scene-card` (app.css) ji vykreslí přes `::before` jemně (16 %, maskováno
      zleva → text čitelný), bez animace. Zapojeno na karty **dungeonů** (per
      instance), **raidů** (per instance) a **questů** (per zóna). Žádné canvasy
      per karta → škáluje i na desítky položek. Kosmetické, deterministické.
- [x] **Increment 4 — Celková pozadí stránek** ✅: jemné dlaždicovatelné
      procedurální pozadí appky laděné **per-frakce** (`pixelart/backdrop.ts` —
      rozptýlené tečky + drobné jiskry, seamless tiling, data-URL cache). Třída
      `.app-backdrop` (fixed, `z-index:-1`, nízký kontrast) zapojená v character
      shellu (`characters/[id]/+layout.svelte`), tint dle rasy→frakce. Statické
      (bez animace). Kosmetické, deterministické.
- [x] **Increment 5 — Animované oživení karet** ✅: drobné PixiJS akcenty +
      CSS shimmer na scene-kartách (dungeon/raid/quest). `CardAccent.svelte`
      (izolovaný PixiJS overlay, pár stoupajících jisker v barvě scény přes
      `sceneAccentColor`) se mountuje **jen nad kartou pod kurzorem** (`{#if}` na
      hoveru) → naživu nanejvýš jeden WebGL kontext (šetrné k výkonu, ctí limit
      kontextů). CSS `::after` shimmer sweep při hoveru. Obojí **vypnuté pod
      `prefers-reduced-motion`**; SSR-safe (dynamický import Pixi). Pozn.: efekty
      jsou hover-triggered (desktop) — na dotyku zůstává statické pozadí z
      incrementu 3 (vědomě, kvůli výkonu/baterii na phone-first). Kosmetické.
- [x] **Increment 6 — Ikony itemů / slotů / rarity** ✅: procedurální ikony dle
      **slotu** (helm/chest/zbraň/štít/prsten/amulet/batoh…) obarvené dle **typu
      brnění** (cloth/leather/mail/plate) resp. materiálu slotu, v **rámečku barvy
      rarity** (common→legendary) s glow/jiskrami u epic/legendary. Jádro
      `pixelart/items.ts` (`drawItemIcon` + cachovaný `itemIconDataUrl` +
      `itemIconMetaById` lookup z `ITEMS` pro místa s pouhým `itemId`) +
      `PixelItemIcon.svelte` (lehký `<img>` z cache). Zapojeno do: **inventáře**
      (vybavené sloty + seznam), **inspect** (PlayerProfile), **lootu** (claim na
      overview), **Auction House** i **vendora** (ne-equip položky bez slotu ikonu
      nemají). Kosmetické, deterministické.
- [x] **Increment 7 — Profil & showcase** ✅: `PortraitShowcase.svelte` — větší
      procedurální portrét (`dim 48`) v ozdobném rámečku s **frakční pečetí**
      (roh) + **class crestem** (`PixelEmblem`); zapojeno do character sheetu
      (overview header) i **inspect** modalu. **Mount/skin vizuální varianty**:
      `pixelart/mounts.ts` (`drawMount` — side-profil silueta dle druhu
      horse/wolf/cat/gryphon z id, seedovaný odstín = různé skiny téhož druhu,
      rámeček dle tieru: epic = zlatý + jiskry) + `PixelMount.svelte`, zapojeno do
      `/mounts`. Demonstruje princip „skin oddělený od power" (kompatibilní s
      monetizací). Kosmetické, deterministické. **M14 kompletní.**
- **Výstup:** vizuálně bohatá, konzistentní hra s procedurálním pixel-artem
  napříč všemi obrazovkami (portréty, emblémy, spelly, pozadí, itemy).
- **Zbývá doladit:** výtvarné jemnosti portrétů (varianty účesů/výrazů), výkonový
  rozpočet animovaných karet, případný pozdější přechod vybraných prvků na
  malovaný art (`src` override je připravený).

---

### MR — D&D Remaster (masivní refactor) 🚧

> Přechod hry od WoW-inspirace na D&D (Dungeons & Dragons 5e) / BG3 styl.
> Největší architektonický zásah od spuštění projektu. Realizovat inkrementálně.
> **Rozhodnutí PM potvrzeno:** level cap **20**, **homebrew** D&D setting, **PHB** rasy,
> **1 subclass/třída** v MVP (viz „Otevřená rozhodnutí PM" níže).

#### Rozsah refaktoru

1. **Nahradit WoW lore za D&D** — odstranit všechny zmínky o „Vanilla WoW" z kódu, dat i UI. Přejmenovat zóny/NPC/dungeony/raidy na D&D-neutrální nebo Forgotten Realms pojmenování (homebrew nebo FR dle rozhodnutí PM).

2. **Přejít na D&D staty (STR/DEX/CON/INT/WIS/CHA + AC)** — nahradit WoW-flavored staty (Strength/Agility/Intellect/Spirit/Stamina) 6 D&D atributy s modifiery (+/-). Armor Class místo defense ratingů. Odvozené staty: saving throw bonusy, spell save DC, initiative, attack bonus. Vše v `packages/shared`, nový unit test kontrakt.

3. **Nahradit WoW spelly za D&D kouzla** — spell katalog `data/abilities.ts` přepsat na D&D kouzla (Fireball, Magic Missile, Cure Wounds, Eldritch Blast, Sneak Attack, Rage, Bardic Inspiration apod.) s reálnými D&D efekty. Damage dice, saving throws, conditions. Spell listy vázat na třídu.

4. **Vylepšit combat engine — rozmanitější nepřátelé, časté používání spellů** — enemy katalog obohatit o D&D bestiář (více typů s unikátními schopnostmi, resistancemi, zranitelnostmi). Spelly se používají dle dostupných spell slotů a priority (ne flat cooldown). Rozšířit `data/enemies.ts` o CR (Challenge Rating).

5. **Převzít balance systém z D&D** — XP za combat/milníky dle D&D 5e tabulky (přizpůsobeno idle long-haul tempu). CR pro nepřátele. Spell slot progression dle D&D tabulky per třída/level. Nepoužívat vlastní vymyšlený balanc tam, kde D&D má fungující vzorec.

6. **Nahradit WoW talent stromy D&D level-up systémem** — zrušit stávající talent stromy (9 class × 3 stromy × 9 nodů). Místo toho: při levelupu hráč volí z D&D level-up odměn (ASI: +2 do jednoho atributu nebo +1/+1 do dvou; nebo Feat ze seznamu; výběr subclass na specifickém levelu; nové spell sloty; nové spelly na spell list). Implementovat `packages/shared/data/feats.ts` s feat katalogem.

7. **Kompletně odstranit systém frakcí** — smazat frakční data, logiku i UI (Aliance/Horda, frakční questy, frakční reputace). Questy, zóny a obsah přepsat jako neutrální. Případné D&D lore frakce (Harpers, Zhentarim, Order of the Gauntlet apod.) čistě kosmetické/lore.

8. **Předělat classy a subclassy dle D&D** — implementovat všech 12 D&D 5e tříd (Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard). Každá třída: D&D resource (Rage charges, Ki points, Superiority Dice, spell sloty), 2–3 subclass volby na příslušném levelu. Race-class matice bez omezení (jakákoli rasa + jakákoli třída dle D&D 5e).

9. **Předělat tvorbu postavy na D&D styl (vč. veřejné backstory)** — character creation flow: výběr rasy (D&D rasy s rasovými bonusy a schopnostmi), výběr třídy, **výběr Background** (D&D Backgrounds: Acolyte, Criminal, Folk Hero, Noble, Outlander, Sage, Soldier apod. — každé dává skill proficiencies + lore). Backstory **veřejně viditelná** na profilu postavy (inspect). Point-buy nebo standard array pro rozložení atributů.

10. **Inspirace BG3 tam, kde by D&D 5e bylo nevhodné** — idle formát neumožňuje plné D&D 5e (koncentrace, akce/bonusová akce, reakční kouzla, detailní podmínky). Adaptace dle BG3 přístupu: zjednodušit complex mechanics pro auto-resolve, zachovat flavor a feel. BG3 UI/UX inspirace pro zobrazení stavů (conditions), spell přehled, levelup screen.

11. **Předělat combat na turn-based s dice rollem** — doplnit combat engine o: d20 attack roll vs AC (hit/miss), damage dice (1d8+STR pro longsword, 8d6 pro Fireball atp.), saving throws (CON save vs spell, DEX save vs AOE). Výsledky v logu zobrazovat jako „rolled 14 + 5 = 19 vs AC 16 → HIT". Turn pořadí dle initiative (d20 + DEX mod). Zachovat idle/auto-resolve charakter — hráč nenastavuje jednotlivé tahy, jen rotaci/priority abilit.

12. **Maximální level: TBD (12/15/20)** — **nutné rozhodnutí PM před startem MR**. Doporučení: **level 20** (plný D&D cap, spell tier 1–9, nejvíc progression prostoru). Alternativy: 15 (spell tier 1–8, kratší grind) nebo 12 (spell tier 1–6, výrazně kratší). XP křivka: lvl 1 za den, lvl 3 za týden, max level za 3–5 měsíců reálného kalendářního času při idle hraní.

13. **Guilda přístupná od lvl 1** — ověřit a odstranit případné level gaty na vstup do guildy. (Aktuálně guilda nemá level gate, spíše ověřit UI a tutoriál.)

14. **Rotace zůstane, postupně se zpřehlední** — stávající deklarativní rotace (priority list abilit s podmínkami) zůstává jako základ idle combatu. V průběhu MR se obohatí o spell slot management (kdy použít slotové kouzlo vs cantrip, kdy šetřit sloty na boss), tracking concentration. Komplexnější podmínky rotace = follow-up po MR.

15. **Tiered spell sloty** — implementovat D&D tabulku spell slotů (1.–9. level kouzel, počet slotů per level per třída dle D&D; Warlock = Pact Magic = méně ale silnějších slotů + Short Rest recharge). V idle modelu: aktivity spotřebovávají spell sloty dle obtížnosti; Long Rest = full recharge při claimu odměny/návratu.

16. **Co nejblíže D&D** — průřezový princip: vždy upřednostnit D&D 5e pravidlo před vlastním vymyšleným řešením. Výjimky jen tam, kde idle formát vyžaduje zjednodušení (pak inspirace BG3).

#### Pořadí realizace (doporučení)

```
MR-1 (staty STR/DEX/CON/INT/WIS/CHA + AC)
→ MR-2 (classy 12 + subclassy)
→ MR-3 (tvorba postavy + backstory)
→ MR-4 (spell systém + tiered spell sloty)
→ MR-5 (combat engine dice roll + turn order)
→ MR-6 (level-up odměny: ASI/Feat/subclass výběr)
→ MR-7 (nepřátelé: D&D bestiář + CR)
→ MR-8 (lore přejmenování: zóny/NPC/dungeony/raidy)
→ MR-9 (kompletní odstranění frakcí)
→ MR-10 (balance pass: CR, XP tabulka, spell slot economy)
→ MR-11 (level cap + XP křivka dle zvoleného capu)
```

#### Otevřená rozhodnutí PM (nutná před nebo v průběhu MR) — ✅ vyřešeno

- [x] **Maximální level: 20** (plný D&D cap, spell tier 1–9, nejvíc progression prostoru).
- [x] **D&D rasy: PHB only** — Human, Elf, Dwarf, Halfling, Gnome, Half-Elf, Half-Orc, Tiefling, Dragonborn.
- [x] **Subclassy: 1 per třída v MVP**, další přidávat postupně.
- [x] **Lore setting: homebrew D&D** — vlastní D&D-neutrální universum (žádné licenční vazby).

#### Postup MR

- [x] **MR-1 — D&D staty (STR/DEX/CON/INT/WIS/CHA + AC)** ✅: WoW-flavored staty
      (Strength/Agility/Intellect/Spirit/Stamina) nahrazeny 6 D&D atributy s
      modifikátory (`abilityModifier` = `floor((score-10)/2)`). Přidán `proficiencyBonus`
      (D&D 5e: `2 + floor((lvl-1)/4)`). Odvozené staty dle D&D: **Armor Class**
      (10 + DEX mod), saving throw bonusy, **spell save DC** (8 + prof + casting mod),
      **spell attack bonus**, **initiative** (DEX mod), **attack bonus** (prof + lepší
      z STR/DEX). Classa má nově `spellcastingAbility` (D&D casting atribut: mage=INT,
      cleric/druid/ranger=WIS, warlock/paladin=CHA). Vše v `packages/shared`
      (`character.ts`), propagováno do `races`/`classes`/`items`/`materials`/`talents`/
      `combat`/gauntlet/web/API. Nový test kontrakt `dnd-stats.test.ts` (+28).
      Magnitudy skóre zatím zachované (combat balanc = MR-5/MR-10), dice-roll combat
      = MR-5. Build/test/lint/typecheck zelené (353 shared + 193 API).
      _Pozn.: rasy/classy zatím WoW sada (8/9) namapovaná na D&D atributy — plný
      D&D class/race redesign (12 tříd, PHB rasy, subclassy) přijde v MR-2/MR-3/MR-9._
- [ ] MR-2 — classy (12 D&D tříd) + subclassy (1 per třída v MVP).

---

## Archiv — WoW-era milníky (pending položky superseded MR refaktorem)

> Níže jsou pending ([ ]) položky z WoW-era backlogu a budoucích milníků, které byly
> nahrazeny nebo přesunuty do MR. Hotové (✅) položky jsou zachovány v příslušných
> dokončených milnících výše jako historický záznam.

### Tech & infra follow-upy (stále relevantní, nezávisí na theming)

- [ ] Auth: httpOnly cookie místo localStorage + refresh rotace/revokace (ADR 0005).
- [ ] Email login (potvrzení e-mailu).
- [ ] WS realtime tam, kde je teď REST polling (watch týmových arén, trade okno, lobby pozvánky).
- [ ] Per-postavová push granularita; `docker compose up` ověřit s běžícím daemonem.
- [ ] Trade-window pro BoP loot (závisí na MR item redesign).
- [ ] Monetizace: skiny, kosmetické tituly — připraveno od M0, implementace later.

### Gameplay pending (superseded MR)

- [ ] Late-game content 40–60 (WoW zóny/questy) → nahrazeno D&D content pasem po MR-8.
- [ ] Více gearu napříč tiery/typy → redesign v MR (D&D itemizace + CR-based loot).
- [ ] Revize drop rate (loot tabulky) → redesign v MR-10 (CR-based loot tables).
- [ ] PVP vs PVE balanc → redesign v MR-10 (D&D balance pass).
- [ ] 40-player raid → rozsah raidů redesignovat po MR (D&D encounter scaling).
- [ ] Onboarding/tutoriál (M11) → redesign po MR-3 (D&D character creation flow).

---

## Rozhodnutí (potvrzeno PM)

- ✅ **Přechod na D&D / BG3 inspiraci** — MR refaktor (viz MR milník).
- ❓ **Level cap: TBD (12/15/20)**, velmi pomalá XP křivka — lvl 1 za den, max za 3–5 měsíců.
- ✅ **Frakce odstraněny** — systém Aliance/Horda kompletně pryč (MR-9).
- ✅ **Guilda přístupná od lvl 1**.
- ✅ **Combat turn-based s dice rollem** (d20 vs AC, damage dice) — MR-5.
- ✅ **Tiered spell sloty** dle D&D tabulky — MR-4.
- ✅ **Monetizace later**: kosmetická vrstva oddělená od statů od začátku → pozdější prodej skinů bez refaktoru.
- ✅ **Vývoj řízený AI** + **škálovatelnost** jako tvrdé průřezové požadavky.

### WoW-era rozhodnutí (historický kontext)

- ~~Level cap 60~~ → nahrazeno: TBD 12/15/20 (MR-11).
- ~~Frakce kosmetické~~ → nahrazeno: frakce odstraněny (MR-9).
- ~~WoW-like talent stromy~~ → nahrazeno: D&D ASI/Feat/Subclass systém (MR-6).
- ~~WoW staty (STR/AGI/INT/SPI/STA)~~ → nahrazeno: D&D atributy STR/DEX/CON/INT/WIS/CHA + AC (MR-1).

### Menší rozhodnutí do dalších fází (historický kontext, platná)

- ~~Hloubka profesí v MVP. → M6~~ ✅ vyřešeno v M6: 2 gathering + 2 crafting + 3 frakce rep-gated recepty.
- ~~Sezónní model (reset ladderu) pro PVP. → M7~~ ✅ vyřešeno v M7: sezóny = data v shared, rating per sezóna.
- ~~Rozsah Aren MVP. → M7~~ ✅ vyřešeno v M7: `1v1`, live watch přes WebSocket.
- ~~Velikost raid party a počet rolí v MVP. → M8~~ ✅ vyřešeno v M8: flex 5/10/20 + T/H/DPS kompozice.
- ~~Kolik raidů/bossů + attunement model. → M8~~ ✅ vyřešeno v M8: 2 raidy × 3 bossy, level + questline gate.
- ~~AH model. → M8~~ ✅ vyřešeno v M8: buyout + bidding s depositem a 5 % cut + expirace.

---

## Verifikace

Pro implementační fáze platí obecný postup aplikovaný na konci každého milníku:

- **M0+**: `docker compose up` → appka naběhne, healthcheck zelený, PWA instalovatelná v prohlížeči.
- **Per-fáze**: ruční end-to-end průchod hlavní novou smyčkou + unit testy herních vzorců v `packages/shared` + integrační testy API modulu dané fáze.
- Po dokončení každého milníku: commit + push na **vývojovou větev `main`** a aktualizace tohoto plánu.
  - ℹ️ **Jediné místo, kde je vývojová větev uvedena** — pro změnu cíle pushů (např. zpět na feature větev) uprav jen tento řádek.
