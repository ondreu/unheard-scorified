# Systém: Auction House (ekonomika) — M8

Hráčský obchod: buyout + bidding s depositem a AH cut (gold sinky) + expirace.
Rozhodnutí a důsledky: **ADR 0012**.

## Vzorce & katalog (`packages/shared/src/auction.ts`)

- `auctionDeposit(itemId, qty, duration)` — gold sink při výpisu (vendor hodnota
  × množství × `AUCTION_DEPOSIT_RATE` × duration faktor). Vrací se jen při prodeji.
- `auctionCut(price)` — 5 % z prodejní ceny (`AUCTION_CUT_RATE`, sink);
  `sellerProceeds(price) = price − cut`.
- `minNextBid(startBid, currentBid)` — start bid, nebo +5 % inkrement.
- `AUCTION_DURATIONS` — `short` 12 h / `medium` 24 h / `long` 48 h.
- `itemVendorValue` / `itemDisplayName` / `isTradeableItem` — sjednocený lookup
  napříč `ITEMS` (gear) + `MATERIALS` + `CONSUMABLES` (M6).
- `isAuctionable(itemId)` = `isTradeableItem && !isSoulbound` (M8.6) — **soulbound
  (BoP) loot je neprodejný** (filtr v sell UI + validace v `createListing`,
  „Soulbound items cannot be auctioned"). Viz `docs/systems/items.md`, ADR 0015.

## Gold tok (escrow)

| Akce | Item | Zlato |
| --- | --- | --- |
| Výpis | z inventáře → escrow v aukci | strhne deposit (sink) |
| Bid | — | strhne kupci; přehození vrátí předchozímu |
| Buyout / expirace s nabídkou | → kupci | prodejce: `cena − cut` + deposit zpět |
| Expirace bez nabídky / cancel | → zpět prodejci | deposit propadá (sink) |

Atomicky: `CharacterRepository.spendGold` (`WHERE gold >= amount`), `addGold`.
`InventoryRepository.addItemQty` (doručení/vrácení stacku).

## Vypořádání

**LAZY je zdroj pravdy** (jako offline progres): při čtení (`browse`/`mine`) i před
`bid`/`buyout` se vypořádají expirované aukce (`AuctionSettler`). **BullMQ**
(`BullMqAuctionScheduler`) je best-effort job na čas expirace (vypořádá + push).
`AuctionSettler` je sdílený provider (service + scheduler → žádný DI cyklus).
Idempotence: `repo.settle` atomicky `WHERE status='active'`.

## „Živá" aukce — seedované NPC nabídky (M10+ FEAT)

Aby AH působil obydleně i při malém počtu hráčů, browse vrací vedle reálných aukcí
i **NPC listingy** (`@game/shared/npc-auction.ts`):

- **Negenerují se do DB** — počítají se deterministicky z **časového okna** (rotace
  á `NPC_AUCTION_WINDOW_HOURS = 6` h, UTC) přes `SeededRng` (anti-cheat,
  reprodukovatelné). `generateNpcListings(now)` = stabilní sada per okno; `id` =
  `npc:<windowStart>:<index>`.
- Sortiment = obchodní zboží (`NPC_AUCTION_POOL`: rudy/byliny/spotřebáky/batohy),
  vše `isAuctionable` (ne soulbound). Cena = vendor hodnota × `[3,7]` (pevný
  **buyout**, NPC nesmlouvá) → nákup je **čistý gold sink**.
- NPC listingy jsou **buyout-only** (`bid` je odmítne). Po koupi se eviduje nákup
  (`npc_auction_purchases`, unique `(characterId, listingId)`) → hráč nekoupí tentýž
  listing dvakrát a zmizí mu z výpisu. Idempotentní proti dvojkliku (refund při
  konfliktu). NPC „prodeje" nezasahují do reálných hráčských aukcí.

## API (`characters/:characterId/auctions`)

- `GET /` (browse, `?itemId=`) — reálné aukce + NPC listingy (`isNpc: true`), `GET /mine`
- `POST /` `{ itemId, quantity, startBid, buyout?, duration }`
- `POST /:auctionId/bid` `{ amount }`, `POST /:auctionId/buyout`, `POST /:auctionId/cancel`
  (buyout na `npc:`-id koupí NPC listing)

Limit `MAX_ACTIVE_LISTINGS` aktivních výpisů per postava. Prodejce nemůže přihazovat
ani kupovat vlastní aukci; cancel jen bez nabídek.

## Datový model

Tabulka `auctions` (migrace 0007): seller, item+quantity, startBid, buyout?,
currentBid+bidder, deposit, duration, endsAt, status (`active→sold|expired|cancelled`),
winner, finalPrice. Escrow itemu je implicitní (není v inventáři). Tabulka
`npc_auction_purchases` (migrace 0030): evidence nákupů NPC listingů (dedup + skrytí).

## Web

`/characters/[id]/auctions` — taby **Browse / My auctions / Sell** (výpis z inventáře,
bid/buyout/cancel). NPC listingy mají „Merchant" badge a jen tlačítko **Buy now**.
Texty anglicky, oddělené od logiky.

## Zbývá doladit (M9)

Balanc poplatků (deposit rate, cut, durace), vyhledávání/filtry, vendoři (NPC odkup
za `vendorGold`), historie cen.
