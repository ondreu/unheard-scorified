# ADR 0034 — Scrap mana: spell sloty jako jediný resource model

- Status: Accepted
- Datum: 2026-06-19
- Kontext fáze: **post-Remaster backlog** (spell sloty & resource)

## Kontext

Z předhotovené WoW-éry (M1/M2) zůstal zjednodušený `ResourceType`
(`rage` / `energy` / `mana`) — kategorie zdroje per třída. MR-4 (ADR 0029)
nad ním zavedl **D&D tiered spell sloty** jako skutečnou idle resource ekonomiku,
ale `ResourceType` zůstal souběžně viset jako **mrtvý kosmetický stav**:

- žil pouze v `DerivedStats.resource` (`{ type, max }`) pro zobrazení v character
  sheetu (overview / inspect),
- **nikdy se nespotřebovával v boji** — žádný combat simulátor (quest / dungeon /
  Gauntlet / PVP) ho nečetl ani neodečítal,
- jeho `max` byl ad-hoc placeholder (`mana = 100 + INT·15`, `energy/rage = 100`),
  bez napojení na D&D.

Souběžně spell sloty (MR-4) jsou **autoritativní jen v questu/grindu**
(`quest-run.ts` per-encounter slot budget); dungeon/Gauntlet/PVP sloty zatím
nespotřebovávají (vědomě odloženo v ADR 0029).

Roadmapa (backlog → „Spell sloty & resource") tedy žádá dvě věci:

1. **scrap mana** — odstranit zjednodušený `ResourceType`,
2. **spell sloty všude** — zavést slotovou spotřebu do všech bojových režimů,
   sjednotit na D&D spell sloty (+ class resources Rage / Ki / Pact Magic).

## Rozhodnutí

**Jediný resource model hry = D&D spell sloty** (`spell-slots.ts`, ADR 0029),
v budoucnu doplněné o **class resources** (Rage / Ki / Pact Magic). Zjednodušený
`ResourceType` (mana/energy/rage proxy) **scrapnut** — nebyl zdrojem pravdy ani
se nikde nečetl, jen zdvojoval koncept zdroje.

Realizováno **inkrementálně, vertikálními slices** (CLAUDE.md: žádné velké
nedokončené refaktory):

### Slice 1 — Scrap mana (tento ADR) ✅

- Smazán `ResourceType` z `@game/shared` (`data/classes.ts`) i `resource` pole
  z `ClassDef` (všech 12 tříd).
- `DerivedStats.resource` odstraněn; `deriveStats` už nepočítá ad-hoc resource max.
  Spotřeba ani zobrazení o nic nepřišly — slot ekonomika (`casterType` +
  `spellSlots` na `DerivedStats`, MR-4) je nahrazuje.
- Web (character sheet + inspect `PlayerProfile`) zobrazuje místo mrtvého resource
  **„Spell Slots"** (součet max slotů; martial bez slotů = „—"). Detailní rozpad
  per tier žije dál na `/characters/[id]/spells` (MR-4).
- Žádná DB migrace — `ResourceType` nebyl perzistovaný (jediný mutable resource
  stav je `characters.spent_spell_slots`, beze změny).

Martial třídy (Barbarian/Fighter/Monk/Rogue) tím dočasně nemají **žádný**
explicitní resource — což je honest stav: jejich bojové techniky jsou už dnes
**at-will** (bez `spellTier`, free v simulátorech). Rage/Ki/Pact jako reálné
resources přijdou ve Slice 3.

### Slice 2 — Sloty do všech combat módů (follow-up)

Retrofit per-encounter slot spotřeby (vzor `quest-run.ts`) do dungeonů
(`raid.ts` engine), Gauntletu (`gauntlet.ts`) a PVP/arén (`pvp.ts`):
lokální slot budget ze snapshotu na startu běhu, spotřeba od nejvyššího tieru,
upcast, Long Rest na konci běhu. `CombatActor.spellSlots` už je všude
naplněný (`deriveCombatProfile`), takže jde o čtení/odečet v simulačních smyčkách.

> ⚠️ Slice 2 mění bojové výsledky (slabší rotace po vyčerpání slotů) → vlastní
> slice + balanc ověření; proto oddělené od scrap mana.

### Slice 3 — Class resources (follow-up)

Reálné non-caster resources: **Rage** (Barbarian), **Ki** (Monk),
**Pact Magic** (Warlock — už má `pact` caster type, jen recharge granularitu).
Sjednotí model „resource per třída" bez návratu k `ResourceType` proxy.

## Důsledky

- (+) Jeden koncept zdroje (spell sloty), žádný duplicitní mrtvý stav; D&D pravda
  jako jediný zdroj.
- (+) Slice 1 je čistá deletion bez DB migrace a bez změny bojových výsledků
  (resource se nikdy nečetl) → nízkoriziková, plně testovaná.
- (−) Martial třídy mezi Slice 1 a Slice 3 bez explicitního resource (jejich
  techniky jsou ale už at-will, takže funkčně beze změny).
- (−) „Sloty všude" (Slice 2) zůstává otevřené — slot ekonomika je bojově
  relevantní zatím jen v questu/grindu.

## Alternativy

- **Ponechat `ResourceType` a jen ho dopočítat z D&D.** Zamítnuto — zdvojuje
  koncept zdroje, který už spell sloty pokrývají; martial „mana/energy" je
  WoW-ismus bez D&D kotvy.
- **Udělat scrap mana + sloty všude + class resources v jednom kroku.** Zamítnuto
  — velký refaktor měnící bojové výsledky napříč 4 simulátory; poručuje CLAUDE.md
  pravidlo malých vertikálních přírůstků. Krájeno na 3 slices.
