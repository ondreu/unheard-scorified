# Talent System (M4)

## Přehled

Každá classa má 3 talent stromy po 5 uzlech. Hráč dostává 1 bod za každý level
(lvl 1 = 0 bodů, lvl 60 = 59 bodů). M4 implementuje alokaci a stat efekty;
combat tagy jsou hinty pro M5 combat engine.

## Datový model (`packages/shared/src/data/talents.ts`)

```
TalentNode {
  id: string              // "warrior.arms.mortal_strike"
  name: string            // EN název
  description: string     // EN popis
  tierRequirement: number // počet bodů v tomto stromě před odemčením
  maxRanks: number        // max bodů v tomto uzlu
  effect: TalentEffect    // statPerRank?, healthPerRank?, combatTags?
}

TalentTree { name, nodes: TalentNode[] }
ClassTalents = [TalentTree, TalentTree, TalentTree]
```

## Classy a stromy

| Classa | Strom 1 | Strom 2 | Strom 3 |
|--------|---------|---------|---------|
| Warrior | Arms | Fury | Protection |
| Paladin | Holy | Protection | Retribution |
| Hunter | Beast Mastery | Marksmanship | Survival |
| Rogue | Assassination | Combat | Subtlety |
| Priest | Discipline | Holy | Shadow |
| Shaman | Elemental | Enhancement | Restoration |
| Mage | Arcane | Fire | Frost |
| Warlock | Affliction | Demonology | Destruction |
| Druid | Balance | Feral | Restoration |

## Tier systém

Uzly na vyšších tierech vyžadují minimální počet bodů v daném stromě:
- Tier 0 (uzly 1–2): `tierRequirement = 0`
- Tier 1 (uzel 3): `tierRequirement = 5`
- Tier 2 (uzel 4): `tierRequirement = 10`
- Tier 3/capstone (uzel 5): `tierRequirement = 14` (uzly 1–4 dávají max 14 bodů v některých stromech, takže 14 je nutné, aby šel capstone vůbec odemknout)

## DB schéma

`character_talents` — (characterId, talentId) PRIMARY KEY, points

## API endpointy

```
GET  /characters/:id/talents           — aktuální stav všech stromů
POST /characters/:id/talents/:talentId — alokuj 1 bod
DEL  /characters/:id/talents           — reset všech talentů (zdarma v M4)
```

## Přímé efekty v M4

`TalentEffect.statPerRank` — flat bonus k primárnímu statu za každý rank.
`TalentEffect.healthPerRank` — flat bonus k HP za rank (combat engine ho přičte v M5).

`TalentEffect.combatTags` — pro M5: odemkne ability nebo modifikuje combat rotaci.
V M4 jsou tagy uloženy ale nezpracovávají se.

## Budoucí rozšíření

- M5: combat engine číst combatTags z alokovaných talentů a modifikovat DPS/rotaci
- M6+: přeskillování za gold (nyní reset zdarma)
