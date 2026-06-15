# ADR 0015 — Ekonomika: soulbound/BoP & weekly lockout (M8.6)

- Status: Accepted
- Datum: 2026-06-15
- Kontext milníku: **M8.6 — Ekonomika** (vyčleněno z M8.5-E)

## Kontext

M8 přinesl Auction House (hráčský obchod) a raidy/dungeony s **personal loot**
(M8.5-D). Bez ekonomických brzd hrozí, že idle farmení zaplaví AH epickým raid/
dungeon lootem a znehodnotí progresi i ceny. Vanilla WoW to řeší dvěma nástroji,
které přebíráme:

1. **Soulbound / Bind-on-Pickup** — nejlepší PVE loot se při sebrání „naváže" na
   postavu a nejde prodat přes AH.
2. **Weekly lockout / raid ID** — z daného raidu (a vyššího dungeonu) padá loot
   jen jednou za herní týden.

Oba mechanismy jsou ortogonální k bojovým/mode změnám M8.5 (A–D) → vlastní malý
milník M8.6.

## Rozhodnutí

### 1. `bindType` na itemech (`@game/shared`)

`ItemDef` má nový volitelný atribut `bindType: 'none' | 'bop' | 'boe'` (chybí ⇒
`none`). Hodnoty se naplňují z **explicitních katalogových seznamů**
`BIND_ON_PICKUP` / `BIND_ON_EQUIP` v `data/items.ts` (jediný zdroj pravdy, na
jednom místě) — ne rozsypané po definicích itemů.

- **BoP**: boss-only dungeon loot (M5) + raid epic/legendary loot (M8). To je
  přesně to, co padá jako personal loot z instancí.
- **BoE**: high-end gear dostupný i mimo instance (crafted `masterwork_blade`,
  world-drop `arcane_robes`). Obchodovatelný — „equip bind" se zatím netrackuje
  (M9 follow-up), takže se chová jako volně obchodovatelný.
- **none**: vše ostatní (běžný gear, materiály, spotřebáky).

Helpery: `itemBindType(id)`, `isSoulbound(id)` (= `bop`).

### 2. AH: BoP neprodejný

`@game/shared`: `isAuctionable(id)` = `isTradeableItem(id) && !isSoulbound(id)`
(jediný zdroj pravdy pro API i web).

- **API** (`AuctionService.createListing`): po kontrole „item je známý" navíc
  odmítne soulbound itemy (`isSoulbound` → 400 „Soulbound items cannot be
  auctioned"). Server-authoritative — nelze obejít.
- **Web** (sell tab): seznam k prodeji filtruje `isAuctionable` → BoP itemy se
  vůbec nenabídnou.

> BoE zůstává prodejný (správné WoW chování — BoE jde na AH, naváže se až při
> obléknutí; tracking equip-bindu je M9).

### 3. Weekly lockout (deterministicky dle UTC týdne)

`@game/shared/lockout.ts` — čisté vzorce:

- `weeklyLockoutId(nowMs)` = `YYYY-MM-DD` (UTC) pondělí, kterým týden začíná.
  Kotva = pondělí **2024-01-01 00:00 UTC**; týden = celé násobky `MS_PER_WEEK`
  od kotvy → **reset vždy v pondělí 00:00 UTC**. Plně deterministické, žádný
  per-process stav.
- `lockoutResetAt(nowMs)` = ms příštího resetu (UI countdown).
- `contentHasWeeklyLockout(type, id)` / `lockoutIdForContent(type, id)` →
  `"<typ>:<contentId>"` nebo `null`. **Všechny raidy** lockoutu podléhají;
  **dungeony** jen označené `weeklyLockout` — zatím jen `scarlet_monastery`
  (nejvyšší, drop epiců). Nižší dungeony zůstávají volně farmitelné (idle-friendly).

**Persistence (API):** tabulka `character_lockouts` (PK `character_id` +
`lockout_id` + `week_id`), migrace `0010`. Modul `LockoutModule` →
`LockoutRepository` (`isLocked`, `acquire` přes `onConflictDoNothing` + returning,
idempotentní/atomický). Importují `RaidModule` i `DungeonModule`.

**Kontrola při grantu odměn** (raid i dungeon `grantParticipant`): jen při
**vítězství** se zkusí `acquire(charId, lockoutId, weekId)`. Pokud lockout právě
vznikl → plná odměna. Pokud už existoval (postava tento týden obsah vyčistila) →
**odměna = 0** (XP, zlato i loot). Wipe / hard fail nelockuje (lze opakovat).

> **Proč jen na vítězství a celá odměna:** lockujeme přesně to, co generuje loot
> (úspěšný clear); blokace celé odměny (ne jen lootu) je nejjednodušší a nejsilněji
> „drží progresi" — opakovaný idle clear téhož obsahu týž týden už nic nedá. UI to
> ukáže (`myLockedOut`), takže to není matoucí.

`myLockedOut` ve view se odvozuje z **uloženého výsledku + odměny**
(`victory === 1 && lockoutId != null && reward.xp === 0`) — nezávisí na reveal
čase, konzistentní pro `enter` i `getRun`.

## Důsledky

- Epic/raid loot je vázaný (BoP) a omezený weekly lockoutem; AH zobrazí jen
  obchodovatelné itemy. Idle farmení už nezaplaví ekonomiku.
- Lockout je deterministický (UTC týden) → server-authoritative, žádný scheduler/
  cron na reset (reset je čistě dopočet z času, jako offline progres).
- **Trade-window** soulbound itemů (krátké okno pro účastníky runu) závisí na
  **P2P trade** (M8.5-D), tj. **M9 social** — zde nezavádíme.
- **BoE equip-bind tracking** (naváže se při obléknutí) → M9. Zatím BoE = tradeable.
- Které další dungeony pod lockout (např. shadowfang) a délka trade-window =
  balanc M9.

## Úklid při příležitosti (M9, mimo M8.6)

Legacy single-actor `simulateDungeonRun` / `computeDungeonReward` /
`DungeonActivityParams` + větev `'dungeon'` v activity modelu (viz ADR 0014) —
runtime je nepoužívá; ponecháno na samostatný úklidový commit.
