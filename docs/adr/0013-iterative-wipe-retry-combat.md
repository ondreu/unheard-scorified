# ADR 0013 — Iterativní wipe/retry combat (M8.5-A)

- Status: Accepted
- Datum: 2026-06-15
- Kontext milníku: **M8.5 — Iterativní (wipe/retry) combat, skupinové módy & personal loot** — část **A**

## Kontext

M5 zavedl deterministický PVE combat engine (`simulateDungeonRun`: 1 postava vs
sekvence nepřátel) a M8 jeho party-vs-boss variantu pro raidy (`simulateRaidRun`).
Oba modely byly **„jedna simulace → run uspěje / selže"**: při neúspěchu dostal
hráč jen malou útěchu (10 % XP) a žádný loot.

PM v reviewu M8 rozhodl (viz ROADMAP M8.5-A), že **všechny PVE módy** (SP dungeon,
budoucí skupinový dungeon i raid) přejdou na **iterativní wipe/retry** model
inspirovaný moderním WoW („determination" / rally nerf).

## Rozhodnutí PM (potvrzeno, viz ROADMAP M8.5-A)

1. Combat přejde z jediné simulace na **per-encounter (per-boss) pully**: wipe na
   encounteru → **retry téhož encounteru** (nový stav RNG), vyčištěné encountery
   zůstávají.
2. Encounter se **s každým wipem zlehčí** (stacking determination — HP i dmg dolů)
   **až po dolní hranici** → odhodlaný hráč nakonec clear dá.
3. **Odměna klesá s počtem wipů**: klesá XP, zlato **i šance na loot**; maximum za
   0 wipů.
4. **Hard fail** = vyčerpání stropu pokusů bez clearu → **prostě fail, 0 odměny**
   (žádná útěcha). Ruší dosavadní 10% útěchu z M5/M8.
5. **Idle režim**: auto-retry až do clearu nebo hard failu (hráč není u toho).
   Ruční re-pull (leader) je odložen na M8.5-B (závisí na social M9).

## Rozhodnutí (implementace)

### Sdílený engine (`packages/shared`)

Žádná duplikace per-hit vzorců — `computeHit` zůstává jediný zdroj pravdy. Obě
simulace dostaly stejnou strukturu „pokus o encounter" + orchestrátor retry:

- **`combat.ts`**: extrahován `fightEncounter` (jeden pull: postava vs jeden
  nepřítel od daného `clock`/`startHp`). `simulateDungeonRun` je teď orchestrátor,
  který každý encounter zkouší až `ENCOUNTER_ATTEMPT_CAP`×.
- **`raid.ts`**: analogicky `fightBoss` (jeden pull: party vs jeden boss) +
  orchestrátor v `simulateRaidRun`.

Determinismus zůstává: jeden `SeededRng` na celý run; retry jen spotřebuje další
hodnoty RNG. Live combat log = stále jen reveal předpočítaného timeline dle času
(stateless), retry pully se v něm zobrazí přirozeně (`encounter_start` s poznámkou
`(pull N, weakened)` + opakované `player_defeated`).

### Determination (zlehčování)

`factor(attempt) = max(FLOOR, 1 − PER_WIPE · attempt)`, aplikováno na `maxHealth`
i `attackPower` nepřítele/bosse. Laditelné konstanty (vyladí se v M9):

| Konstanta                  | Dungeon | Raid |
| -------------------------- | ------- | ---- |
| `*_ATTEMPT_CAP`            | 6       | 6    |
| `*_DETERMINATION_PER_WIPE` | 0.07    | 0.07 |
| `*_DETERMINATION_FLOOR`    | 0.50    | 0.50 |
| regroup mezi pully (s)     | 5       | 8    |

Po wipu se HP postavy/party resetuje na plnou (party doběhla); **mezi vyčištěnými**
encountery se nese částečně doléčená HP jako dřív (attrition v rámci clean runu).

### Odměny — `wipeRewardMultiplier`

```
wipeRewardMultiplier(wipes) = max(0.25, 1 − 0.15 · wipes)
```

- Maximum (1.0) za 0 wipů, klesá s každým wipem, dno 0.25.
- Aplikuje se na **XP, zlato i šanci na loot** (`rollLoot(..., dropChanceMult)`).
- **Hard fail (run nevyčistěn) → `{ xp: 0, gold: 0, items: [] }`** (žádná útěcha).

`DungeonCombatResult` i `RaidCombatResult` nově nesou `wipes: number`;
`computeDungeonReward` / `computeRaidReward` z něj počítají multiplikátor.
`RaidRun`/dungeon log view vystavují `wipes` (jen po dokončení) → web zobrazí
„cleared after N wipes — reduced reward".

## Důsledky

- **Žádná nová DB tabulka ani migrace** — dungeon recykluje activity infra (M2),
  raid recykluje run tabulky (M8). Délka runu (`durationSec`) teď zahrnuje retry
  pully → BullMQ scheduler i countdown fungují beze změny.
- **Backward-compatible API**: `rollLoot` má volitelný 3. parametr (default 1),
  `computeRaidReward` volitelný 4. parametr `wipes` (default 0).
- **Breaking herní změna**: zrušena 10% útěcha při neúspěchu (M5/M8). Testy
  aktualizovány.

## Zbývá na další části M8.5 (mimo A)

- **B**: skupinový dungeon (3/5) + ruční formace (leader/lobby) — závisí na M9 social.
- **C**: arena 3v3/5v5 brackety + ad-hoc rating.
- **D**: personal loot pro dungeony + P2P trade.
- **E**: soulbound/BoP (`bindType`) + weekly lockout/raid ID.
</content>
</invoke>
