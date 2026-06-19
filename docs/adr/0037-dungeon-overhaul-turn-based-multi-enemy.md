# ADR 0037 — Dungeon overhaul: tahový group engine + multi-enemy encountery

Status: **Accepted** (rozhodnutí PM) — realizováno inkrementálně (slices).
Datum: 2026-06-19.

## Kontext

Dungeony dosud běžely jako **idle auto-resolve group PVE run** (ADR 0014):
party N rolí vs **sekvence jednotlivých nepřátel** (`simulateRaidRun`,
`fightBoss` = jeden boss na encounter). Boj se předpočítal při vstupu a hráč jen
sledoval „živý" log (reveal dle času). To je dobré pro idle, ale chybí:

1. **Interaktivní (tahový) boj** — hráč chce občas hrát rukama (jako Gauntlet),
   ne jen sledovat. Gauntlet má tahový engine, ale jen **1 hráč vs 1 nepřítel**.
2. **Víc nepřátel na encounter** — žádný engine neuměl skupinu nepřátel (trash
   pack, boss+adds) s výběrem cíle.
3. **Group tahový** — kombinace 1 + 2 pro 3/5 hráčů (ruční i AI autofill).

Rozhodnutí PM (směr „dungeon overhaul"):

- **Solo zůstává idle** (auto-resolve), ale přibude i **tahový** mód (solo idle/tahový).
- **3-player** tahový — ruční parta **nebo autofill s AI** parťáky (mimikují hráče).
- **5-player** tahový — **jen ruční** parta.
- **Multi-enemy encountery** — sekvence typu trash(5) → boss(1) → trash(3) →
  boss+adds → final boss (příklad PM).
- Pack difficulty: trash v packu = **oslabení minioni** (nižší efektivní level/CR),
  aby byl pack férový i pro at-level solo idle; **konzervativní velikosti packů**
  (2–3) pro start, agresivní sekvence = pozdější content pass.

## Rozhodnutí

Přepracovat dungeony na **multi-enemy encountery** a postupně přidat **tahový
interaktivní mód** vedle zachovaného idle auto-resolve. Realizováno ve slices:

- **Slice 1 — multi-enemy model + idle auto-resolve (tento ADR, hotovo):**
  - **Datový model** (`data/dungeons.ts`): `DungeonDef.encounters` je nově pole
    **`EncounterDef[]`**, kde `EncounterDef = { id, enemies: EnemyDef[] }` —
    každý encounter je **skupina nepřátel** bojovaná naráz. Trash packy mají
    „oslabené miniony" (nižší `level` → nižší CR HP/dmg). Helpery `dungeonEnemies`,
    `dungeonBoss`.
  - **Engine** (`raid.ts`): `fightBoss` → **`fightEncounter`** (party vs
    `CombatActor[]`). Tým fokusuje **nejslabšího** nepřítele (`chooseEnemyTarget`),
    nepřátelé útočí na **tanka/threat** (`chooseBossTarget`); každý nepřítel má
    vlastní swing/ability timery; DoT nese index cíle; **AoE** útoky/heal zasáhnou
    všechny živé cíle (aktivuje odložený AoE-damage z ADR 0036). `simulateRaidRun`
    bere `(CombatActor | CombatActor[])[]` — prvek je jeden nepřítel (legacy =
    1-enemy encounter) nebo skupina → **zpětně kompatibilní** (PVP/sandbox/testy
    s polem jednotlivců fungují beze změny). Wipe/retry determination (M8.5-A)
    běží per encounter → packy zůstávají clearovatelné (boj se po wipech zlehčí).
  - **API/web**: `groupEncounters` vrací `CombatActor[][]`; dungeon list `bossName`
    z `dungeonBoss`; run view mapuje encounter-skupiny na `{ name, isBoss }`.

- **Slice 2 — tahový solo engine (hotovo):**
  - **Engine** `dungeon-run.ts` (čistý, serializovatelný, seed per tah) — 1 hráč
    vs **sekvence multi-enemy encounterů** dungeonu. Hráč volí **ability + cíl**
    (`resolveDungeonTurn(base, state, abilityId, targetId)`): DoT tiky → hráčova
    ability (AoE = všichni živí) → protiútok všech živých nepřátel → údržba.
    Mezi encountery **short rest** (per-encounter refill slotů/Ki/cooldownů +
    částečné doléčení, jako auto-resolve pull). Smrt = konec (bez determination
    retry — to má idle auto-resolve). Recykluje `computeHit`/`abilityDamageSpec`/
    `healDiceSpec`/slot+Ki+rage helpery (žádná duplikace).
  - **DB**: nová tabulka `dungeon_turn_runs` (stateful JSON `DungeonRunState` +
    snapshot, mirror `gauntlet_runs`), migrace `0041`.
  - **API**: `DungeonTurnService`/`DungeonTurnRepository` + routy pod
    `characters/:id/dungeons/turn/*` (`enter`/`run/:id`/`act`/`abandon`). Odměna
    při vyčištění sdílí `computeGroupReward` + weekly lockout + reputaci s
    auto-resolve. Nejvýše jeden aktivní run; server validuje každý tah (anti-cheat).
  - **Web**: tlačítko „⚔️ Turn-based" u solo dungeonu + interaktivní stránka
    `dungeon-turn/[runId]` (výběr cíle klikem na nepřítele, ability bar, combat log).
  - Idle solo (`enter`) zůstává jako alternativní mód vedle tahového.

- **Slice 3 — tahový group + AI parťáci (hotovo):**
  - **Engine** (`dungeon-run.ts`): tahový boj rozšířen z 1 aktéra na **partu N**
    (hráč + AI parťáci). `DungeonRunState` dostal `allies: DungeonRunAlly[]` +
    `playerRole`/`playerName`; solo = prázdné pole → **plně zpětně kompatibilní**
    (Slice 2 chování beze změny). Pořadí tahu: DoT tiky → **hráčova** ability
    (heal cílí nejzraněnějšího člena party; solo = self) → **AI parťáci** (každý
    živý jeden tah) → protiútok nepřátel na **threat** (tank → jinak nejodolnější
    člen) → údržba (cooldowny/mitigace hráče i parťáků). Short rest mezi
    encountery doléčí + refillne zdroje **všem** členům. Sdílený `combatantHitEnemy`
    (hráč i parťák) — žádná duplikace damage vzorců; tank-mitigace přes
    `TANK_INCOMING_DAMAGE_MULT` (sdíleno s auto-resolve `raid.ts`).
  - **AI parťáci** (`data/companions.ts`): pevný **D&D companion roster** (Gareth
    fighter-tank, Lyra cleric-healer, Vex rogue-dps). Profil se staví **stejnou
    cestou jako hráč** (`deriveCombatProfile` → `deriveRaidActor`) na úrovni hráče
    se standard-array atributy a bez gearu → parťák „mimikuje hráče" (role, ability
    kit, spell sloty, rotace). `allyTakeTurn` jedná dle role + rotace: healer léčí
    nejzraněnějšího (jinak DPSí + free basic-heal fallback bez slotu), tank/dps
    sešle první použitelnou ability dle rotace (sloty/Ki/cooldown gating), jinak
    basic úder. Determinismus zachován (sdílený rng tahu).
  - **API/web**: `enterGroup` (hráč zvolí roli, `buildCompanionParty` autofillne
    zbytek do **1/1/1**, 3-player), route `:dungeonId/turn/enter-group`. Web:
    dungeon list nabídne „⚔️ Turn-based (party)" s volbou role při velikosti 3;
    tahová stránka kreslí **party panel** (HP bary parťáků s rolemi). Odměna sdílí
    `computeGroupReward` + lockout + reputaci se solo/auto-resolve. Bez DB migrace
    (parťáci žijí v JSON run-stavu).
  - **Zjednodušení (rozhodnutí PM, Slice 3):** **down hrdiny = konec runu**
    (`status: 'dead'`) — hráč ovládá jen sebe, takže pád hráče ukončí interaktivní
    run; pád **parťáka** ho jen vyřadí a party bojuje dál (žádný battlefield-revive
    zatím). Jen **autofill 3-player** (reální hráči 3/5 = Slice 4).

- **Slice 4 — ruční party 3/5 (reální hráči):** lobby/matchmaking do tahového
  boje, 5-player jen ruční. **Otevřená otázka** (vlastní ADR): model koordinace
  tahů reálných lidí (synchronní živé sezení vs. async).

- **Slice 5 — content + boss mechaniky:** dotažení encounter sekvencí, cílení
  a aktivních schopností nepřátel (navazuje na „Enemy schopnosti" backlog).

## Důsledky

- **Žádná DB migrace** — encounter struktura je statická data + runtime; běhy se
  ukládají jako snapshot party + seed (re-simulace ze snapshotu beze změny schématu).
- **Determinismus zachován** — vše přes `SeededRng`; multi-enemy timery řazené
  deterministicky, reprodukovatelné ze seedu (anti-cheat).
- **Balanc packů = follow-up** (Slice 5): minioni jsou ručně oslabení, ale plný
  balanc multi-enemy obtížnosti (a velikosti packů dle příkladu PM) se doladí
  s content passem. Determination safety-net drží hru clearovatelnou mezitím.
- **Idle model nedotčen** pro solo i group — auto-resolve běží dál, jen nově
  zvládá skupiny nepřátel. Tahový mód je aditivní (Slice 2+).

## Reference

- `packages/shared/src/data/dungeons.ts` (model + 10 dungeonů přepsáno na packy)
- `packages/shared/src/raid.ts` (`fightEncounter`, `simulateRaidRun`)
- `packages/shared/src/group.ts` (`groupEncounters` → `CombatActor[][]`)
- ADR 0014 (sjednocený group PVE run), ADR 0028 (Gauntlet tahový), ADR 0036 (AoE flag).
