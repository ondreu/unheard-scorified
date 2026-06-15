# ADR 0008 — Combat engine & Dungeony (SP PVE, M5)

**Status:** Accepted · **Datum:** 2026-06-14

## Kontext

M5 přidává první bojovou smyčku: hráč pošle postavu do **dungeonu** (SP PVE
instance), ta na pozadí odbojuje sérii nepřátel (trash + boss), hráč sleduje
**živý log boje** a po vítězství vybere **boss loot**. Combat musí být
deterministický (anti-cheat, konzistence FE/BE, viz ADR 0002) a využít data
z předchozích milníků: primární staty (M1), gear staty (M4) a **talent combat
tagy** (M4).

Současný idle model je server-authoritative + **lazy/deterministický**:
aktivita = `startAt` + `durationSec` + `seed`, odměna je čistá funkce v
`@game/shared` dopočítaná při claimu (ADR 0006). M5 do tohoto modelu zapadá.

## Rozhodnutí

### 1. Dungeon run = idle aktivita typu `dungeon` (žádná nová tabulka)

Activity model z ADR 0006 je záměrně obecný (`activity_type` + `params` jsonb).
Dungeon run je **další `activity_type`** — žádná změna schématu, žádná migrace.
Platí „jedna aktivní aktivita na postavu" (unique `character_id`); claim, BullMQ
plánovač i push notifikace se **recyklují beze změny** (claim je generický:
připíše XP/zlato, přidá loot do inventáře).

`params` pro dungeon = `{ dungeonId, player: CombatActor }` — viz bod 3.

### 2. Deterministický, předpočítaný combat timeline

Boj je **čistá funkce** `simulateDungeonRun(player, enemies, seed)` v
`@game/shared/combat.ts`. Z neměnných vstupů (snapshot postavy + statická data
dungeonu + `seed`) deterministicky vyprodukuje **kompletní timeline událostí**
(`CombatEvent[]` s časem `t` v sekundách), výsledek (`victory`) a délku
(`durationSec`). Veškerá náhoda jde přes `SeededRng` (žádný `Math.random()`).

- **`durationSec`** aktivity = délka předpočítaného boje (uloží se při startu →
  plánování BullMQ jobu i UI countdown).
- **Odměny** (`computeActivityReward` větev `dungeon`) re-simulují boj a při
  vítězství rolnou boss loot ze stejného seedu → reprodukovatelné a
  validovatelné serverem.

### 3. Snapshot bojového profilu při vstupu (anti-cheat + determinismus)

Při vstupu do dungeonu se z postavy odvodí `CombatActor`
(`deriveCombatProfile`): efektivní staty z **base + gear (M4) + talent stat
bonusy (M4)**, a bojové modifikátory z **talent combat tagů (M4)** — crit, haste,
damage, lifesteal a **signature ability** (capstone talenty → periodický silný
úder). Tento snapshot se uloží do `params.player`.

Snapshot (ne živý přepočet) je zvolen schválně:

- **Determinismus** boje nezávisí na pozdější změně gearu/talentů během běhu.
- **Anti-cheat**: hráč nemůže po zhlédnutí (prohraného) boje přehodit gear a
  „doклikat" jiný výsledek — výsledek je dán už při vstupu.

### 4. Live log = odhalování předpočítaného timeline (REST polling), WS až v M7

„Server tick / live combat log" je realizovaný **bez per-process stavu**: server
re-simuluje deterministický timeline a vrátí události s `t <= elapsed`
(`GET …/dungeon/log`). Klient polluje (stejné UX jako questing countdown).

WebSocket gateway s Redis pub/sub adaptérem (škálovatelná realtime vrstva pro
více instancí) je **odložen do M7**, kde se staví MP realtime infra (Areny).
Důvody: (a) idle tempo boje (úder ~2–3 s) plně zvládne polling; (b) timeline je
už strukturovaný jako stream událostí — přechod na WS push je čistě transportní
záměna bez změny doménové logiky; (c) stateless determinismus splňuje
škálovatelnost (ADR 0003) bez sticky sessions. Tím držíme M5 jako malý
vertikální přírůstek.

### 5. Obsah MVP

- **Dungeony** (`packages/shared/src/data/dungeons.ts`) — PVE neutrální (obě
  frakce), gated `requiredLevel`, napříč existujícím 1–40 contentem. Každý
  dungeon = sekvence `EnemyDef` (trash + boss) + `baseXp`/`baseGold` + odkaz na
  loot tabulku.
- **Boss loot** (`DUNGEON_LOOT_TABLES` v `loot.ts`) — vyšší šance + dungeon-only
  itemy (přidány do `items.ts`).
- **Combat tagy → mechaniky**: kurátorovaná mapa `COMBAT_TAG_EFFECTS` +
  `SIGNATURE_ABILITIES`. Nenamapované tagy zatím nemají mechanický efekt
  (flavor / budoucí rozšíření) — žádný tichý fail, jen no-op.

## Důsledky

- Žádná migrace; dungeon je `activity_type`. Claim/scheduler/push se sdílí.
- Balanc (HP/AP nepřátel, loot šance, XP) je laditelný v `@game/shared` →
  vyladí se v M9. M5 cílí na „vyhratelné, ne triviální".
- Combat čísla počítá `deriveCombatProfile`/`simulateDungeonRun` jako jediný
  zdroj pravdy (FE i BE). `buildCharacterSheet.derived` zůstává zjednodušený
  display, combat má vlastní přesnější odvození.
- WS realtime je explicitně práce M7; M5 timeline je na něj připravený.
