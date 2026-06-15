# Combat engine & Dungeony (M5)

Detailní specifikace bojového systému a SP PVE dungeonů. Viz ADR
`docs/adr/0008-combat-and-dungeons.md` pro rozhodnutí; tento dokument popisuje
„jak to funguje".

## Přehled

Hráč pošle postavu do **dungeonu** (SP PVE instance). Boj je **deterministický**
a **předpočítaný** při vstupu — postava na pozadí (i offline) odbojuje sérii
nepřátel, hráč sleduje **živý log boje** a po vítězství vybere **boss loot**.

Dungeon run je realizovaný jako **idle aktivita typu `dungeon`** (recykluje M2
activity infrastrukturu — žádná nová tabulka, žádná migrace). Claim odměn jde
přes generický `activity claim`.

## Combat engine (`packages/shared/src/combat.ts`)

Jediný zdroj pravdy pro boj (FE i BE). Veškerá náhoda jen přes `SeededRng`.

### Bojový profil postavy — `deriveCombatProfile`

Z postavy odvodí `CombatActor` spojením dat z předchozích milníků:

- **Base staty** (M1) — `baseStatsFor(race, class, level)`.
- **Gear staty** (M4) — sečtené staty equipnutých itemů (`sumEquipmentStats`).
- **Talenty** (M4) — `aggregateTalentEffects(class, allocations)`:
  - `statPerRank` → bonus k efektivním statům,
  - `healthPerRank` → bonus HP,
  - `combatTags` → bojové modifikátory (viz níže).

Odvozená čísla:

| Veličina        | Vzorec (zjednodušeně)                                            |
| --------------- | ---------------------------------------------------------------- |
| `attackPower`   | `(4 + primaryStat·0.9 + level·0.8 + weaponPower) · damageMult`    |
| `maxHealth`     | `40 + stamina·8 + level·6 + talentHealth + tagHealth`            |
| `swingInterval` | `2.4 / (1 + haste)` sekund                                        |
| `critChance`    | `0.05 + crit_rating·0.002 + tag crit` (strop 0.6)                 |
| `armor`         | z gearu (mitigace: `reduction = armor / (armor + 400)`)          |

`weaponPower = attack_power + spell_power` z gearu (melee i casteři sdílí jeden
model — balanc later v M9).

### Combat tagy → mechaniky

Kurátorovaná mapa `COMBAT_TAG_EFFECTS` (per rank): crit, damage, haste, HP,
lifesteal. Capstone tagy (`SIGNATURE_ABILITIES`) odemykají **signature ability**
— periodický silný úder (cooldown + damage multiplier), např. `mortal_strike`,
`mutilate`, `chaos_bolt`, `stormstrike`. **Nenamapované tagy = no-op** (flavor /
budoucí rozšíření, žádný tichý fail).

### Simulace — `simulateDungeonRun(player, enemies, seed)`

Událostmi řízená (swing timery + ability timery), deterministická:

- Postava začíná na plné HP, mezi souboji se doléčí o 30 % maxHP (klid 3 s).
- Každý úder: variance 0.85–1.15 → crit (×2) → armor mitigace.
- **Enrage**: po 60 s v jednom souboji nepřítel ztrojnásobí poškození (zabrání
  nekonečným fightům — fight vždy skončí).
- Vrací kompletní `CombatEvent[]` timeline (čas `t` v sekundách + anglická
  hláška), `victory`, `durationSec`.

„Živý" log = filtr `events.filter(e => e.t <= elapsedSec)` — žádný per-process
stav (stateless, škálovatelné). Klient polluje (REST). WS transport je práce M7.

## Dungeony (`packages/shared/src/data/dungeons.ts`)

PVE neutrální (obě frakce), gated `requiredLevel` (content gating). Každý
dungeon = sekvence `EnemyDef` (trash → boss) + `baseXp`/`baseGold` + odkaz na
boss loot tabulku.

| Dungeon            | Req lvl | Boss                          |
| ------------------ | ------- | ----------------------------- |
| Ragefire Chasm     | 8       | Taragaman the Hungerer        |
| The Deadmines      | 15      | Edwin VanCleef                |
| Shadowfang Keep    | 20      | Archmage Arugal               |
| Scarlet Monastery  | 30      | High Inquisitor Whitemane     |

### Boss loot (`DUNGEON_LOOT_TABLES` v `loot.ts`)

Vyšší šance na drop než questy + dungeon-only itemy (`items.ts`, např.
`whitemane_chapeau`, `herod_shoulder`, `commanders_crest`). Loot se rolluje při
**vítězství** na deterministicky odvozeném seedu (neinterferuje s combat RNG).

## API (`apps/api/src/dungeon/`)

| Endpoint                                            | Popis                              |
| --------------------------------------------------- | ---------------------------------- |
| `GET  /characters/:id/dungeons`                     | seznam dungeonů (+ `unlocked`)     |
| `POST /characters/:id/dungeons/:dungeonId/enter`    | vstup → založí dungeon aktivitu    |
| `GET  /characters/:id/dungeons/log`                 | živý combat log běžícího runu      |
| `POST /characters/:id/activity/claim`               | claim odměn (sdílený, generický)   |

Při `enter` se **snapshotne bojový profil** do `params.player` (anti-cheat +
determinismus — boj nezávisí na pozdější změně gearu/talentů). `durationSec`
aktivity = délka předpočítaného boje.

## Web (`apps/web/src/routes/characters/[id]/`)

- `dungeons/` — seznam dungeonů (zamčené/odemčené), tlačítko **Enter**.
- `dungeon/` — sledování boje: progress bar + **combat log** (poll po 1.5 s),
  po dokončení **Claim loot** (vítězství) nebo defeat.
- Character page: link na Dungeons + běžící dungeon run s „Watch fight →".

## Iterativní wipe/retry (M8.5-A)

`simulateDungeonRun` je teď **orchestrátor per-encounter pullů** (helper
`fightEncounter` = jeden pull). Wipe na encounteru → retry téhož encounteru
(`ENCOUNTER_ATTEMPT_CAP` = 7 pullů), encounter se **zlehčí** (`determinationFactor`,
HP/dmg ×factor). První wipe je „zdarma"; křivka obtížnosti
`1 → 1 → 0.95 → 0.9 → 0.85 → 0.8 → 0.75`, pak **hard fail** (0 odměny, žádná
útěcha). Vyčištěné encountery zůstávají; po wipu se postava resetuje na plnou HP.

`DungeonCombatResult.wipes` řídí odměnu přes `wipeRewardMultiplier`, která sleduje
obtížnost (XP, zlato i loot šance; plná za 0–1 wipe, dno 0.3 na obtížnosti 0.75).
Combat log zobrazí retry pully
(`encounter_start (pull N, weakened)` + opakované `player_defeated`); dungeon log
view vystaví `wipes` po dokončení. Detail: ADR 0013.

## Co zbývá / navazuje

- **Balanc** (HP/AP nepřátel, loot šance, XP, weaponPower model, determination
  křivka/strop pokusů) → M9.
- **WebSocket realtime** transport (Redis pub/sub, multi-instance) → M7.
- Plné využití všech combat tagů (DoTy, štíty, CC) → budoucí rozšíření.
- Set bonusy a zbraňové typy (M4 TODO) → budoucí.
