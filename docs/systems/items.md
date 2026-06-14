# Items & Inventory System (M4)

## Přehled

Item systém implementuje gear, inventář a equipment pro M4.
Rozšíření v M5+: zbraňové typy, set bonusy, sockety.

## Datový model

### `ItemDef` (`packages/shared/src/data/items.ts`)

Jediný zdroj pravdy pro všechny itemy. API i web importují z `@game/shared`.

```
ItemDef {
  id: ItemId          // unikátní řetězec
  name: string        // EN název
  slot: ItemSlotType  // head | neck | shoulder | ... | finger | trinket
  rarity: ItemRarity  // common | uncommon | rare | epic | legendary
  itemLevel: number   // přibližná "síla" itemu
  stats: ItemStats    // Partial<Record<PrimaryStat | armor | attack_power | ..., number>>
  vendorGold: number  // prodejní cena u vendora
}
```

### Equipment sloty

16 fyzických slotů: `head`, `neck`, `shoulder`, `chest`, `waist`, `legs`, `feet`, `wrist`,
`hands`, `back`, `main_hand`, `off_hand`, `finger1`, `finger2`, `trinket1`, `trinket2`.

Prsten a trinket mají každý 2 sloty. Mapování: `SLOT_TO_ITEM_SLOT`.

## DB schéma

- `character_inventory` — (characterId, itemId) PRIMARY KEY, quantity, grantedAt
- `character_equipment` — (characterId, slot) PRIMARY KEY, itemId
- `character_skins` — (accountId, skinId) PRIMARY KEY, acquiredAt (kosmetika, základ transmog)

## Loot systém

Loot se roluje deterministicky přes `SeededRng` po claimu aktivity:

1. `computeQuestReward` v `activity.ts` volá `rollLoot()` s RNG seedovaným stejně jako aktivita
2. Pokud zóna quest náleží do bracket tabulky (`ZONE_TO_BRACKET`), roluje se loot
3. Výsledné `itemId[]` jsou přidány do `character_inventory` přes `InventoryRepository.addItem()`

### Loot brackety

| Bracket | Zóny | anyDropChance |
|---------|------|---------------|
| bracket_1 | northshire, durotar | 25% |
| bracket_2 | westfall, the_barrens | 25% |
| bracket_3 | duskwood, thousand_needles | 30% |

## API endpointy

```
GET  /characters/:id/inventory     — seznam všech itemů v inventáři
GET  /characters/:id/equipment     — equipnuté itemy + souhrnné staty
POST /characters/:id/equipment     — equip itemu { itemId, slot }
DEL  /characters/:id/equipment/:slot — unequip ze slotu
```

## Stat výpočty

`sumEquipmentStats(items: ItemDef[]): ItemStats` — sečte staty všech equipnutých itemů.
`CharacterSheet.equipmentStats` obsahuje výsledek (prázdný objekt pokud nic equipnuto).
