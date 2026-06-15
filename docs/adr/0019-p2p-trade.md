# ADR 0019 — P2P trade (M8.5-D)

- Status: Accepted
- Datum: 2026-06-15
- Kontext milníku: **M8.5-D** (odemčeno M9 social)

## Kontext

M8 přinesl Auction House (asynchronní obchod přes vendora). M8.5-D doplňuje
**přímou výměnu mezi dvěma hráči** (trade window) — itemy + zlato, oboustranně
potvrzené. Vyžadovalo identitu protistrany → odemčeno M9 social. Souvisí s
M8.6 ekonomikou (soulbound/BoP): běžný trade BoP nepřenese.

## Rozhodnutí

### 1. Stavová trade session, dvě tabulky

```
trades(id, initiator_character_id, partner_character_id, initiator_gold,
       partner_gold, initiator_confirmed, partner_confirmed, status, ...)
trade_items(trade_id, side: initiator|partner, item_id, quantity, PK(trade,side,item))
```

`open → completed | cancelled`. Postava je nejvýše v **jednom otevřeném** trade.

### 2. Bez escrow — atomické ověření a převod až při potvrzení

Během vyjednávání se itemy/zlato **neblokují** (žádný escrow). Při oboustranném
potvrzení (`tradeReady`) se atomicky:

1. ověří, že **obě strany stále vlastní** nabídnuté zlato i položky (mezitím
   mohly utratit/prodat na AH),
2. převede zlato (atomický `spendGold` s refundem při souběhu) a položky
   (`consume` → `addItemQty`).

Když ověření selže, trade **netiše neprojde** — resetuje potvrzení a vrátí
chybu, hráči nabídku opraví. Jednodušší a bezpečnější než držet escrow stav
(žádné „uvíznuté" zboží při zrušení/expiraci).

### 3. Jakákoli změna nabídky resetuje potvrzení obou stran

`setOffer` (nahradí celou nabídku strany) volá `resetConfirmations`. Brání útoku
„potvrď, pak potají přidej/uber" — po jakékoli změně musí obě strany potvrdit znovu.

### 4. Soulbound (BoP) nelze běžně obchodovat

Validace `canTradeItem` = `isAuctionable` (známý & ne-BoP) — stejné pravidlo jako
AH, jediný zdroj pravdy v `@game/shared`. **Trade-window pro BoP** (výměna jen
mezi účastníky téhož runu v časovém okně) je samostatný follow-up.

### 5. Stejné vzory; web polluje

`TradeController` (tenký) → `TradeService` (logika, ownership, atomická výměna) →
`TradeRepository`. Vlastní `TradeModule`. Realtime se zatím neřeší — web **polluje**
`GET /trade` (2,5 s), takže změny/potvrzení protistrany se projeví (REST je zdroj
pravdy). WS push lze doplnit přes existující vrstvu později.

## Důsledky

- **Pozitivní**: bezpečný přímý obchod bez escrow bookkeepingu; sdílené pravidlo
  obchodovatelnosti s AH; model rozšiřitelný (trade-window BoP, realtime push).
- **Kompromisy**: polling místo realtime (jednoduché, lehce nahraditelné);
  malé okno souběhu mezi ověřením a převodem (idle hra → zanedbatelné, navíc
  `spendGold` je atomický a refunduje).

## Testy

- `@game/shared` unit: `trade.test.ts` (stavy/strany, `tradeReady`, `canTradeItem`).
- API integrační: `trade.flow.test.ts` (pglite) — plná výměna obousměrně, reset
  potvrzení po změně nabídky, nedostatek itemů/zlata, BoP odmítnut, jeden trade
  na postavu + cancel, self-trade/ownership.
