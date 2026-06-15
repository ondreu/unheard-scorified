# P2P trade (M8.5-D)

> Viz ADR `docs/adr/0019-p2p-trade.md`. Přímá výměna itemů + zlata mezi dvěma
> postavami (oddělená od Auction House). Odemčeno M9 social.

## Tok

1. **Otevření** — `POST /characters/:id/trade` `{ partnerName }`. Postava je
   nejvýše v jednom otevřeném trade.
2. **Nabídka** — `PUT .../trade/offer` `{ items: [{itemId, quantity}], gold }`
   nastaví celou nabídku volající strany. Validuje obchodovatelnost
   (`canTradeItem` = známý & ne-BoP) a vlastnictví. **Resetuje potvrzení obou stran.**
3. **Potvrzení** — `POST .../trade/confirm`. Když potvrdí **obě** strany
   (`tradeReady`), proběhne atomická výměna a trade se uzavře (`completed`).
   `POST .../trade/unconfirm` odznačí.
4. **Zrušení** — `POST .../trade/cancel`.
5. **Stav** — `GET .../trade` → `{ trade }` (obě nabídky, zlato, potvrzení,
   `mySide`/`me`/`them`). Web polluje (2,5 s), REST je zdroj pravdy.

## Provedení (bez escrow)

Itemy/zlato se během vyjednávání neblokují. Při oboustranném potvrzení se
**ověří**, že obě strany stále vlastní nabídnuté zlato i položky, a teprve pak
převedou (`spendGold`/`addGold`, `consume`/`addItemQty`). Při nesouladu trade
neprojde tiše — resetuje potvrzení a vrátí chybu.

## Soulbound

BoP loot nelze běžným trade přenést (`canTradeItem` = `isAuctionable`). Trade-window
pro BoP (výměna mezi účastníky téhož runu v časovém okně) je samostatný follow-up.

## Sdílené (`@game/shared/trade.ts`)

`TRADE_STATUSES`, `TRADE_SIDES`, `canTradeItem`, `tradeReady`.

## Web

`/characters/[id]/trade` — otevři dle jména (nebo „Trade" u přítele), uprav
nabídku (položky z inventáře + zlato), potvrď/zruš.
