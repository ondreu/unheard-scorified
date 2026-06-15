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

### Simulace — sdílené primitivy v `combat.ts`, run engine v `raid.ts`

`combat.ts` je **jediný zdroj per-hit vzorců** (žádná duplikace):

- `computeHit(attacker, defender, rng, mult, enraged)` — variance 0.85–1.15 →
  crit (×2) → armor mitigace. Sdílí ho group PVE run, dungeon i PVP.
- `deriveCombatProfile` → `CombatActor`; `determinationFactor` /
  `wipeRewardMultiplier` (křivka obtížnosti + škálování odměn, sdílí s raidem).

Vlastní událostmi řízenou simulaci (swing + ability timery, enrage, wipe/retry)
dělá **`simulateRaidRun` v `raid.ts`** — dungeon i raid jedou na jednom group-run
enginu (viz „Sjednocený group PVE run" níže). Vrací kompletní `CombatEvent[]`
timeline (čas `t` v sekundách + anglická hláška), `victory`, `durationSec`, `wipes`.

> ℹ️ Původní single-actor `simulateDungeonRun`/`fightEncounter`/`easeActor`/
> `DungeonCombatResult` (M5) byly **odstraněny v M9** — runtime je nepoužíval od
> M8.5-B. Zachované sdílené helpery: `computeHit`, `determinationFactor`,
> `wipeRewardMultiplier`, `round1`, `buildEnemyActor`.

„Živý" log = filtr `events.filter(e => e.t <= elapsedSec)` — žádný per-process
stav (stateless, škálovatelné). Klient polluje (REST) / WS (M7).

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

## Sjednocený group PVE run (M8.5-B)

Dungeon už **není idle aktivita** (`character_activities`), ale **group PVE run**
sdílený s raidy (`raid_runs` + `content_type='dungeon'`, ADR 0014). SP = party 1 dps,
group 3/5 = role, jen reální hráči z fronty `dungeon:<id>` (žádný NPC backfill —
chybí-li hráči, party je menší a encountery se škálují její velikostí). Combat =
`simulateRaidRun` (party vs sekvence encounterů, členové používají signature abilities),
encountery škálované velikostí party. **Personal loot** per účastník
(`computeGroupReward`, seed per postava). Odměna padá při resolve (žádný separátní
claim). API: `enter(size?,role?,composition?)`, `queue`/`leave`, `getRun`, `recentRuns`.

> ✅ Legacy single-actor path (`simulateDungeonRun`/`computeDungeonReward`/
> `DungeonActivityParams`) **odstraněn v M9** — dungeon jede výhradně přes group run.

## Web (`apps/web/src/routes/characters/[id]/`)

- `dungeons/` — seznam dungeonů (zamčené/odemčené) + **výběr velikosti** (Solo/3/5) +
  **Enter** → naviguje na run.
- `dungeon/[runId]/` — sledování boje: progress bar + party (group) + **combat log**
  (poll), po dokončení **personal reward** (XP/zlato/loot) + případně „reduced reward"
  dle wipů. (`dungeon/` bez parametru jen přesměruje na seznam.)
- Character page: link na Dungeons.

> ℹ️ Tabulka API výše je z M5 (activity model). Od M8.5-B je dungeon **group PVE
> run** (viz níže + ADR 0014): `POST .../dungeons/:id/enter`, `.../queue`, `.../leave`,
> `GET .../dungeons/run/:runId`, `.../dungeons/runs`. Žádný `activity/claim`.

## Iterativní wipe/retry (M8.5-A)

`simulateRaidRun` (group engine v `raid.ts`) je **orchestrátor per-boss/encounter
pullů** (helper `fightBoss` = jeden pull). Wipe na encounteru → retry téhož
(7 pullů), encounter se **zlehčí** (`determinationFactor`, HP/dmg ×factor). První
wipe je „zdarma"; křivka obtížnosti `1 → 1 → 0.95 → 0.9 → 0.85 → 0.8 → 0.75`, pak
**hard fail** (0 odměny, žádná útěcha). Vyčištěné encountery zůstávají; po wipu se
party resetuje na plnou HP.

Počet wipů (`wipes` ve výsledku runu) řídí odměnu přes `wipeRewardMultiplier`, která sleduje
obtížnost (XP, zlato i loot šance; plná za 0–1 wipe, dno 0.3 na obtížnosti 0.75).
Combat log zobrazí retry pully
(`encounter_start (pull N, weakened)` + opakované `player_defeated`); dungeon log
view vystaví `wipes` po dokončení. Detail: ADR 0013.

## Weekly lockout (M8.6)

Vyšší dungeony (`DungeonDef.weeklyLockout`, zatím jen **Scarlet Monastery**)
podléhají **týdennímu lockoutu per postava** — stejná mechanika jako raidy (první
vítězný run v UTC týdnu zamkne, další clear týž týden nedá odměnu). Nižší dungeony
zůstávají volně farmitelné (idle-friendly). Vzorce `@game/shared/lockout.ts`
(`lockoutIdForContent('dungeon', id)`); run view vystaví `myLockedOut`. Detail:
**ADR 0015**.

## Co zbývá / navazuje

- **Balanc** (HP/AP nepřátel, loot šance, XP, weaponPower model, determination
  křivka/strop pokusů) → M9.
- **WebSocket realtime** transport (Redis pub/sub, multi-instance) → M7.
- Plné využití všech combat tagů (DoTy, štíty, CC) → budoucí rozšíření.
- Set bonusy a zbraňové typy (M4 TODO) → budoucí.
