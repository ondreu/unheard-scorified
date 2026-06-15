# ADR 0012 — Auction House (hráčská ekonomika): buyout + bidding, sinks (M8)

- Status: Accepted
- Datum: 2026-06-15
- Kontext milníku: **M8 — Raidy (MP PVE) & Auction House**

## Kontext

M6 zavedl profese a materiály (gather → vendor/AH bylo odloženo na M8). M8 přidává
**Auction House** = hráčský obchod, který propojuje ekonomiku (gold, materiály,
crafted/raid gear) a dává materiálům z M6 trh. Zároveň zavádí **gold sinky** proti
inflaci.

Průřezové požadavky (ROADMAP): stateless API, stav v Postgres/Redis, idle-first
(prodejce i kupec jsou typicky offline → vypořádání nesmí záviset na tom, že je
někdo online).

## Rozhodnutí PM (potvrzeno)

**Buyout + bidding, s depositem a expirací.** Plnohodnotná aukce (vyvolávací cena
+ volitelný buyout, přihazování, expirace) + **deposit** a **AH cut** jako gold sinky.

## Rozhodnutí

### 1. Vzorce a katalog v `@game/shared`

`packages/shared/src/auction.ts` = jediný zdroj pravdy: `auctionDeposit`
(gold sink při výpisu, dle vendor hodnoty × množství × délky), `auctionCut`
(5 % z prodeje, sink), `minNextBid` (start bid / +5 % inkrement), durace
(12/24/48 h). `itemVendorValue`/`itemDisplayName`/`isTradeableItem` sjednocují
lookup napříč `ITEMS` (gear) + `MATERIALS` + `CONSUMABLES` (M6).

### 2. Escrow modelu (gold tok)

- **Výpis:** strhne se deposit (sink, vrací se jen při prodeji) a **item se
  escrowuje** (odebere z inventáře prodejce → nelze ho mezitím prodat/equipnout).
- **Bid:** zlato kupce se strhne hned; při přehození se předchozímu dražiteli vrátí.
- **Prodej (buyout/expirace s nabídkou):** prodejce dostane `cena − cut` + deposit
  zpět; item jde kupci (ten už zaplatil escrow).
- **Expirace bez nabídky / cancel:** item zpět prodejci, deposit propadá (sink).

Atomicita gold: `CharacterRepository.spendGold` strhává jen `WHERE gold >= amount`
(žádný záporný zůstatek ani souběh), `addGold` připisuje.

### 3. Vypořádání: LAZY je zdroj pravdy, BullMQ best-effort

Konzistentně s celou kódovou bází (offline progres je lazy):

- **Lazy:** při každém čtení AH (`browse`/`mine`) i před `bid`/`buyout` se
  vypořádají všechny aukce po expiraci (`AuctionSettler.settleDue/settleAuction`).
- **BullMQ:** `BullMqAuctionScheduler` naplánuje job na čas expirace, který přes
  `AuctionSettler` vypořádá a pošle push (jako M2 ActivityScheduler). Bez Redisu
  AH stále funguje (lazy). `NoopAuctionScheduler` pro testy.

`AuctionSettler` je oddělený provider (sdílí ho service i scheduler) → žádný DI
cyklus (vzor jako `ArenaEventsRelay`). Idempotence: `repo.settle` je atomický
(`WHERE status='active'`), takže souběh lazy čtení a BullMQ jobu nevypořádá aukci
dvakrát.

### 4. Datový model

Jedna tabulka `auctions` (seller, item+quantity, startBid, buyout?, currentBid +
bidder, deposit, duration, endsAt, status, winner, finalPrice). Stav
`active → sold | expired | cancelled` (terminální). Escrow itemu je implicitní
(item není v inventáři, je „v aukci").

## Důsledky

- ➕ Ekonomika s reálnými gold sinky (deposit + cut) proti inflaci.
- ➕ Idle-friendly: prodej/expirace se vypořádá i pro offline hráče (lazy + push).
- ➕ Materiály z M6 mají trh; raid/craft gear je obchodovatelný.
- ➖ Balanc poplatků (deposit rate, cut, durace) je placeholder → **M9 balanc pass**.
- ➖ MVP nemá vyhledávání/filtry nad rámec `itemId` ani „buyout = bid ≥ buyout"
  auto-resolve (bid musí zůstat pod buyoutem) — lze doplnit bez změny jádra.

## Reference

- `packages/shared/src/auction.ts`
- `apps/api/src/auction/*`, migrace `drizzle/0007_*`
- `docs/systems/auction-house.md`
