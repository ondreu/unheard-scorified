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

## API (`characters/:characterId/auctions`)

- `GET /` (browse, `?itemId=`), `GET /mine`
- `POST /` `{ itemId, quantity, startBid, buyout?, duration }`
- `POST /:auctionId/bid` `{ amount }`, `POST /:auctionId/buyout`, `POST /:auctionId/cancel`

Limit `MAX_ACTIVE_LISTINGS` aktivních výpisů per postava. Prodejce nemůže přihazovat
ani kupovat vlastní aukci; cancel jen bez nabídek.

## Datový model

Tabulka `auctions` (migrace 0007): seller, item+quantity, startBid, buyout?,
currentBid+bidder, deposit, duration, endsAt, status (`active→sold|expired|cancelled`),
winner, finalPrice. Escrow itemu je implicitní (není v inventáři).

## Web

`/characters/[id]/auctions` — taby **Browse / My auctions / Sell** (výpis z inventáře,
bid/buyout/cancel). Texty anglicky, oddělené od logiky.

## Zbývá doladit (M9)

Balanc poplatků (deposit rate, cut, durace), vyhledávání/filtry, vendoři (NPC odkup
za `vendorGold`), historie cen.
