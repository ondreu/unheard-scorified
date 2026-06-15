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

## Vazba itemu — `bindType` (M8.6)

`ItemDef.bindType: 'none' | 'bop' | 'boe'` (volitelné, chybí ⇒ `none`). Naplňuje
se z katalogových seznamů `BIND_ON_PICKUP` / `BIND_ON_EQUIP` v `data/items.ts`
(jediný zdroj pravdy). Viz **ADR 0015**.

| bindType | Význam | AH | Co spadá |
| --- | --- | --- | --- |
| `none` | volně obchodovatelný | ✅ prodejný | běžný gear, materiály, spotřebáky |
| `bop` | Bind-on-Pickup (soulbound) | ❌ neprodejný | dungeon boss loot (M5) + raid epic/legendary (M8) |
| `boe` | Bind-on-Equip | ✅ prodejný (equip-bind tracking = M9) | high-end craft/world gear (`masterwork_blade`, `arcane_robes`) |

Helpery: `itemBindType(id)`, `isSoulbound(id)` (= `bop`), `isAuctionable(id)`
(= známý a ne-BoP). Raid/dungeon **personal loot je BoP** → na AH se nedá vypsat
(filtr v sell UI + server validace). Trade-window soulbound itemů = M9 (závisí na
P2P trade).

## Typy brnění — `armorClass` (M10 armor types)

`ItemDef.armorClass: 'cloth' | 'leather' | 'mail' | 'plate'` (volitelné). Vyplňuje
se z `ARMOR_CLASS_BY_ITEM` v `data/items.ts` (jediný zdroj pravdy) **jen** u kusů
v armor slotech (`ARMOR_SLOT_TYPES` = head, shoulder, chest, waist, legs, feet,
wrist, hands). Zbraně, šperky (neck/finger/trinket), plášť a off-hand armorClass
**nemají** → nosí je každá classa bez omezení.

Typ se volí dle stat afinity: cloth = int/spirit (casteři), leather = agility,
mail = mix str/agi + stamina, plate = str/stamina (tanci/melee).

### Class proficiency

`CLASS_ARMOR_PROFICIENCY: Record<ClassId, ArmorClass[]>` (vanilla-style na cap
levelu; leveling progrese se neřeší):

| Classy | Umí nosit |
| --- | --- |
| Warrior, Paladin | cloth, leather, mail, plate |
| Hunter, Shaman | cloth, leather, mail |
| Rogue, Druid | cloth, leather |
| Priest, Mage, Warlock | cloth |

Helpery: `itemArmorClass(id)`, `canEquipArmor(klass, id)` (true pro ne-armor
itemy + armor v rámci proficiency). Gate je vynucen v `InventoryService.equip`
(po validaci slot typu) — pokus o nasazení nekompatibilního typu vrátí 400.

Pro cloth-only classy (mage/priest/warlock) byl doplněn základní **cloth set**
napříč sloty (`acolyte_hood`, `apprentice_mantle`, `silk_girdle`,
`woven_wristwraps`, `enchanters_gloves`, `sandals_of_insight`, `mystic_leggings`)
— dostupný u vendora.
