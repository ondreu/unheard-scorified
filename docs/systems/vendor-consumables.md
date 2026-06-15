# Vendoři & spotřebáky (M10)

Dva související systémy ekonomiky/utility: **NPC vendor** (nákup/odkup za pevné
ceny) a **„use" spotřebáků** (dočasné buffy). Jediný zdroj pravdy pro vzorce a
data je `@game/shared` (`vendor.ts`, `data/materials.ts`).

## Vendor

NPC obchod oddělený od Auction House (hráč↔hráč). Ceny jsou pevné, žádné aukce.

| Akce | Cena | Tok zlata |
| --- | --- | --- |
| Prodej hráčem | `vendorSellPrice(id)` = `itemVendorValue(id)` | gold **source** |
| Nákup hráčem | `vendorBuyPrice(id)` = `itemVendorValue × VENDOR_BUY_MARKUP` (≥1) | gold **sink** |

- **Sortiment** (`VENDOR_STOCK`): základní (ne-soulbound) gear napříč armor typy +
  startovní zbraně/doplňky + základní spotřebáky. Cílem je, aby každá classa měla
  startovní výbavu i bez dropů (zejm. cloth set pro caster classy).
- **Odkup**: lze prodat cokoli známého s nenulovou hodnotou — **včetně soulbound
  (BoP)** itemů (vendor je jediný odbyt pro vázaný loot; na AH BoP nejde).
- `VENDOR_BUY_MARKUP = 5` → nákup je vždy dráž než odkup (vendor marže).

### API

```
GET  /characters/:id/vendor              — gold + sortiment + prodejné věci
POST /characters/:id/vendor/buy/:itemId   — koupit { quantity? } (default 1)
POST /characters/:id/vendor/sell/:itemId  — prodat { quantity? } (default 1)
```

`VendorModule` recykluje `InventoryRepository` (přidání/odebrání itemů) a
`CharacterRepository.spendGold/addGold` (atomický gold). Web: `/characters/[id]/vendor`.

## Spotřebáky — „use" → buff

`ItemDef`-mimo systém: spotřebáky žijí v `character_inventory` jako stackovatelné
ne-equip položky (`CONSUMABLES`). Použití (`use`) spotřebuje 1 kus a aktivuje
**dočasný stat buff** (`CONSUMABLE_BUFFS`):

| Spotřebák | Buff | Trvání |
| --- | --- | --- |
| Minor Healing Potion | +6 Stamina | 10 min |
| Healing Potion | +12 Stamina | 15 min |
| Superior Healing Potion | +20 Stamina | 20 min |
| Elixir of Strength | +15 Strength | 30 min |

- Buff staty sdílí `ItemStats` (stejný systém jako gear) → **žádná nová combat
  mechanika**. Aktivní buffy se přičítají do bojového profilu v jediném místě:
  `InventoryService.getEquipmentStats` (= equipment + aktivní buffy), které
  používají dungeon/raid/arena profily. Equipment UI view (`listEquipment`)
  zůstává jen gear.
- **Jeden stack na spotřebák**: opětovné použití expiraci **obnoví** (refresh, ne
  stacking). Buff drží tabulka `character_buffs` (PK character+consumable +
  `expires_at`); stat bonus se odvozuje z `CONSUMABLE_BUFFS`. Prošlé buffy se lazy
  filtrují (a mažou) při čtení.
- Idle smysl: vypij lektvar **před** vysláním na aktivitu → po dobu trvání se
  efekt projeví v auto-resolve boji.

### API

```
GET  /characters/:id/consumables            — spotřebáky v inventáři + aktivní buffy
POST /characters/:id/consumables/use/:itemId — použít (aktivovat buff)
```

`ConsumableModule` + `BuffDataModule` (leaf s `BuffRepository`, importovaný i
InventoryModule). Web: `/characters/[id]/consumables`.
