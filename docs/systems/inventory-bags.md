# Omezený inventář & batohy (M10 limited inventory)

Vanilla-styl konečný inventář: pevný počet slotů, rozšiřitelný **batohy** v bag
slotech. Vzorce/kapacita jsou v `@game/shared` (`inventory.ts`), batohy v
`data/items.ts` (jako itemy se `slot: 'bag'`).

## Sloty & kapacita

- **Kapacita** = `BASE_BACKPACK_SLOTS` (16) + Σ `bagSlots` vložených batohů.
- **Stack**: `itemMaxStack(itemId)` — gear/batohy = 1 (nestackují se), materiály a
  spotřebáky = `STACKABLE_MAX` (20). Stack zabírá 1 slot až do maxStack, přebytek
  potřebuje další slot.
- **Využité sloty** se **dopočítávají** z inventáře (`usedSlots`) — DB drží dál
  jen `(itemId, quantity)`, žádný „slot index" se neukládá.
- `BAG_SLOT_COUNT` (4) equipovatelných bag slotů (tabulka `character_bags`,
  migrace `0026`).

`planGrant(current, capacity, incoming)` (čistá, testovaná funkce) naplánuje
přidání: dorovná neúplné stacky, plní volné sloty, přebytek → `overflow`.

## Batohy

Batoh = item se `slot: 'bag'` a `bagSlots` (počet přidaných slotů). Žije v `ITEMS`
(automaticky ve všech sjednocených lookupech — vendor/AH/zobrazení), ale do
equipment slotů ho nelze nasadit (`SLOT_TO_ITEM_SLOT` ho nemapuje). Vkládá se do
bag slotu samostatnými endpointy.

| Batoh | Slotů | Zdroj |
| --- | --- | --- |
| Small Pouch | 4 | vendor |
| Traveler's Backpack | 6 | vendor |
| Reinforced Pack | 8 | vendor |
| Woven Satchel | 10 | vendor |
| Enchanted Runecloth Bag | 12 | vendor |
| Light Leather Satchel | 8 | craft (Leatherworking) |
| Medium Leather Pack | 12 | craft (Leatherworking) |
| Heavy Leather Bag | 16 | craft (Leatherworking) |

> **Craftovatelné batohy** ✅: dvojice profesí **Skinning** (gathering kůže) →
> **Leatherworking** (craft batohů), vzácnější kůže = větší batoh (až 16 slotů,
> více než vendorové). Čistě data v `@game/shared` (viz `professions-reputation.md`).

## Banka (úložiště mimo batoh)

Banka má **vlastní kapacitu** (`BASE_BANK_SLOTS = 28`) nezávislou na bag slotech —
uložení itemu tedy uvolní místo v batohu. Stejný stack-aware model jako inventář
(`planGrant`/`usedSlots`). Deposit přesune item z inventáře do banky, withdraw zpět;
withdraw je **player-akce** → při plném batohu se zablokuje (žádný overflow do pošty).
`BankModule` + tabulka `character_bank` (migrace 0031). Web `/characters/[id]/bank`.

```
GET  /characters/:id/bank            — obsah banky + kapacita (used/total)
POST /characters/:id/bank/deposit    — { itemId, quantity } inventář → banka
POST /characters/:id/bank/withdraw   — { itemId, quantity } banka → inventář
```

Vyjmutí batohu se zablokuje, pokud by se jeho obsah/sám batoh po snížení kapacity
nevešel („empty it first").

### API

```
GET    /characters/:id/bags             — bag sloty + kapacita (used/free)
POST   /characters/:id/bags/:slotIndex   — vložit batoh { itemId }
DELETE /characters/:id/bags/:slotIndex   — vyjmout batoh
```

## „Bag full" — overflow do pošty (rozhodnutí PM)

Všechny **idle reward/transfer** cesty jdou přes centrální choke-point
`InventoryService`… resp. `InventoryGrantService.grant` (inventory modul):
respektuje kapacitu a **přebytek pošle systémovou poštou** (od „Courier", vanilla
styl). Pokryté zdroje: quest/dungeon/raid loot, aukční prodej/vrácení/expirace,
P2P trade. Pošta se štěpí po `6` přílohách na zprávu.

**Player-akce** (kde má smysl blokovat, ne přetékat) jdou přes `grant.fits` a při
plném inventáři vrátí 400:

- **vendor nákup** — „Not enough bag space",
- **vyzvednutí pošty** (claim) — „Not enough bag space to claim…" (žádný
  re-overflow pošty do pošty).

### Architektura (bez DI cyklu)

`InventoryGrantService` (export z `InventoryModule`) skládá `InventoryRepository`
+ `BagRepository` + `MailRepository`. `MailRepository` je vyčleněn do leaf
`MailDataModule` (importuje ho InventoryModule i MailModule) → žádný cyklus
inventory↔mail. Stejný vzor jako `MountDataModule` / `BuffDataModule`.
