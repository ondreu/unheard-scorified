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

### Slice 2 — Sloty do idle auto-resolve combatu (dungeon + PVP) ✅

Per-encounter slot spotřeba (vzor `quest-run.ts`) retrofitnutá do **dungeon
enginu** (`raid.ts` — `fightBoss`) a **PVP/arén** (`pvp.ts` — `simulatePvpDuel`
+ `simulateTeamFight`). Sdílený primitiv `spendSlotForTier` vytažen z `quest-run.ts`
do `data/spell-slots.ts` (jediný zdroj pravdy spotřeby slotů; quest-run na něj
přepojen).

Model (shodný s quest-run, idle-konzistentní):

- **Lokální slot budget** = kopie `actor.spellSlots` (snapshot), **fresh per
  encounter/pull/duel** — slot model je per-encounter (jako quest-run, kde
  `simulateQuestEncounter` dostává čistý rozpočet). Long Rest = reset při
  claimu/návratu (beze změny, MR-4).
- **Spotřeba**: každé seslání kouzla (`spellTier ≥ 1`) čerpá slot tieru ≥ kouzla
  (nejnižší dostupný → upcast jen když musí). Cantripy (tier 0) a martial techniky
  (bez `spellTier`) jdou **zdarma** (at-will).
- **Fizzle/hold**: když není slot, kouzlo se nesešle (`continue`) → aktér mlátí
  basic údery / cantripy dál. **Pojistka u healerů**: ability-heal (heal-kind
  kouzlo) čerpá slot, ale **basic-swing heal** (raid `member` timer) je free →
  healer i po vyčerpání slotů léčí slabě dál (žádný kolaps group PVE).
- **Upcast** v dungeonu: `fightBoss` teď trackuje použitý slot tier → `abilityDamageSpec`
  dostává reálný tier (Fireball atd. upcastuje; dřív `null` = base dice, ADR 0032).
  PVP zatím škáluje přes `damageMult` (literal dice/upcast v PVP = mimo tento slice).

Kontraktní testy: `raid.test.ts` + `pvp.test.ts` ověřují, že tier ≥ 1 kouzlo se
sešle nejvýš `available slots`-krát a cantrip neomezeně.

> ⚠️ Mění bojové výsledky (slabší rotace po vyčerpání slotů). Verifikováno:
> build/test/lint/typecheck zelené, dungeon + arena integrační flows beze změny
> (winnability zachována — fallback na cantrip/basic + wipe/retry determination).

### Slice 2b — Sloty v Gauntletu (follow-up)

Gauntlet (`gauntlet.ts`) **záměrně oddělen** — není idle auto-resolve, ale
**interaktivní** (hráč volí tah), **persistovaný** JSON run-stav napříč vlnami,
s **drafty** (přidávají spelly za běhu) a bez HP regenerace. Sloty tam vyžadují
vlastní rozhodnutí, a proto samostatný slice:

- **persistence** slot rozpočtu v `GauntletPlayerState` (JSON, bez migrace),
- **recharge kadence** (per-vlnu = encounter? per-run? — design decision),
- **UI**: zobrazení dostupných slotů + **odmítnutí tahu** (kouzlo bez slotu jako
  „not ready", analogicky cooldownu) ve web kliencie,
- interakce s ability draftem (nové kouzlo vs. dostupné sloty).

### Slice 3 — Class resources (follow-up)

Reálné non-caster resources: **Rage** (Barbarian), **Ki** (Monk),
**Pact Magic** (Warlock — už má `pact` caster type, jen recharge granularitu).
Sjednotí model „resource per třída" bez návratu k `ResourceType` proxy.

## Důsledky

- (+) Jeden koncept zdroje (spell sloty), žádný duplicitní mrtvý stav; D&D pravda
  jako jediný zdroj.
- (+) Slice 1 je čistá deletion bez DB migrace a bez změny bojových výsledků
  (resource se nikdy nečetl) → nízkoriziková, plně testovaná.
- (+) Slot ekonomika je po Slice 2 bojově relevantní v **questu/grindu + dungeonech
  + PVP/arénách** — caster front-loaduje nejlepší kouzla, pak padá na cantripy
  (D&D depletion). Jediný sdílený primitiv (`spendSlotForTier`).
- (−) Martial třídy mezi Slice 1 a Slice 3 bez explicitního resource (jejich
  techniky jsou ale už at-will, takže funkčně beze změny).
- (−) Gauntlet (Slice 2b) zatím sloty nečerpá — vyžaduje persistenci + UI +
  recharge rozhodnutí (interaktivní mód).
- (−) Slot rozpočet je **per-encounter** (fresh per pull/duel), ne sdílený přes
  celý dungeon run — jednodušší a bezpečnější (žádné dry-caster unwinnable
  retries); plný „one Long Rest per adventure" model = případný budoucí tuning.

## Alternativy

- **Ponechat `ResourceType` a jen ho dopočítat z D&D.** Zamítnuto — zdvojuje
  koncept zdroje, který už spell sloty pokrývají; martial „mana/energy" je
  WoW-ismus bez D&D kotvy.
- **Udělat scrap mana + sloty všude + class resources v jednom kroku.** Zamítnuto
  — velký refaktor měnící bojové výsledky napříč 4 simulátory; poručuje CLAUDE.md
  pravidlo malých vertikálních přírůstků. Krájeno na 3 slices.
