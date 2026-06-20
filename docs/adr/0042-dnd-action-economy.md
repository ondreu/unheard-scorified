# ADR 0042 — D&D akční ekonomika (once per combat / extra action / bonus action)

- **Stav:** přijato — **Slice 1 + 2 + 3 hotové** (once-per-combat gating; Action Surge/
  Onslaught jako reálná akce navíc; bonus action jako samostatný akční slot). Featura
  uzavřena na engine/datové úrovni; interaktivní výběr bonus akce v UI = dokumentovaný
  follow-up.
- **Kontext:** backlog „Combat & obsah — overhaul → Akční ekonomika". Navazuje na
  MR-5 (dice-roll combat), ADR 0034 (class resources / spell sloty jako akční
  rozpočet) a ADR 0036/0037 (per-ability dice, tahový dungeon).
- **Rozsah Slice 1:** `packages/shared` (jediný zdroj pravdy — typ `SignatureAbility`,
  combat helpery + 6 simulátorů). **Bez DB migrace** (persistované tahové simy nesou
  nové pole v JSON stavu, staré běhy graceful-degradují). Bez API/web změn.

## Kontext

Engine neměl žádný pojem **akce / bonus action / kolo s více útoky** — všechno bylo
gateované jen `cooldownSec` + zdroji (sloty/Ki/rage). Z toho plynuly tři odchylky od
D&D 5e, které backlog jmenuje:

1. **„once per combat / na začátku" se nevynucovalo.** Action Surge (`fighter_action_surge`)
   i opener Assassinate (`rogue_assassinate`) byly jen ability na cooldownu → v delším
   souboji vystřelily **opakovaně** (D&D: Action Surge = short rest, Assassinate = opener).
2. **Action Surge nebyl akce navíc** — jen `damageMult: 2.0` (ne „druhá akce v tomtéž kole").
3. **Bonus action neexistovala** jako samostatný akční slot (Healing Word, Martial Arts
   bonus úder, two-weapon…).

Je to **průřezové přes 6 simulátorů**: spojité-timeline (`quest-run`, `pvp` duel + team,
`raid`/group) a tahové (`dungeon-run`, `dungeon-party`, `gauntlet`). Dva turn modely =
hlavní designová výzva (proto krájeno na slice; velké → ADR).

## Rozhodnutí — celková featura (3 slice)

- **Slice 1 — „once per combat" gating (✅ tady).** Nejmenší, samostatně hodnotný kus
  = oprava bugu + základ pro 2/3.
- **Slice 2 — Action Surge / Onslaught jako reálná akce navíc** (`grantsExtraAction` +
  `extraActions`, ✅): místo ×2 damage spustí hned `extraActions` extra **útoků zbraní**
  v tomtéž kole (Action Surge 1, Onslaught 2), než jedná soupeř. Sjednoceno přes sdílené
  `extraActionCount` + pojmenovanou pseudo-ability `EXTRA_ATTACK_ABILITY` (rozpoznatelná
  v logu/testech) ve všech 6 simulátorech (hráč i AI). Action Surge přeladěn `damageMult
  2.0 → 1.0` (jeho hit + 1 extra ≈ původní magnituda, ale teď reálná akce navíc).
  **`oncePerTurn` se přesouvá do Slice 3** — extra útoky jsou plain weapon swing (bez
  Sneak Attack rideru), takže rider se zatím nezdvojuje; oncePerTurn začne bít až s
  bonus-action útokem, který Sneak Attack nést může.
- **Slice 3 — bonus action jako vlastní slot** (`actionCost: 'action' | 'bonus'`, ✅):
  1 akce + 1 bonus action / kolo. `isBonusAction` + tag **Healing Word / Mass Healing
  Word**. V **tahových group PvE simech** (dungeon-run solo+AI, dungeon-party MP) aktér
  po hlavní akci automaticky provede jednu ready bonus-action ability (`takeBonusHeal`,
  rotation/cooldown-gated, 1/kolo; bonus použitý jako hlavní akce se neduplikuje díky
  cooldownu). **Auto-resolved** (jako rage) — interaktivní výběr bonus akce v UI = follow-up.
  **Gauntlet vynechán** schválně: jeho roguelite heal-scarcity (`healFalloff`) by free
  bonus heal rozbil. Spojité simy: `actionCost` kosmetický (žádné kolo).
  **`oncePerTurn` se nezavádí** — Sneak Attack je v enginu diskrétní ability (1× za
  aktivaci/cooldown) a bonus akce je cap 1/kolo, takže D&D „1× za kolo" je strukturálně
  splněné bez nového flagu (rozhodnutí: nepřidávat mrtvé pole). Extra útoky ze Slice 2
  jsou plain weapon swing bez Sneak Attack rideru → rider se nezdvojuje.

## Rozhodnutí — Slice 1

1. **Datový model.** `SignatureAbility.oncePerCombat?: boolean` (jediný zdroj pravdy,
   serializovatelné — součást bojového snapshotu). `undefined`/false = beze změny.
2. **Sdílené helpery** (`combat.ts`, žádná duplikace gatingu napříč 6 soubory):
   - `OnceUsedTracker = Set<string>` — per-aktér množina vyčerpaných „once per combat" id.
   - `abilityOnceAvailable(used, ability)` / `markAbilityUsed(used, ability)` (no-op bez flagu).
3. **Sledování per aktér + reset na začátku encounteru** (D&D short rest mezi encountery):
   - **In-memory simy** (`quest-run`, `raid` fightEncounter) drží `Set<string>` lokálně
     (fresh per encounter / per pull).
   - **Timer simy** (`pvp` duel + team) drží `Set` per strana / per člen; flag se nese
     na timeru (`abilityOncePerCombat`).
   - **Persistované tahové simy** (`dungeon-run`, `dungeon-party`, `gauntlet`) drží
     `usedOncePerCombat?: string[]` v JSON stavu (Set není serializovatelný). Reset:
     dungeon/party při short restu mezi encountery (`restoreEncounterResources`),
     gauntlet při spawnu vlny (`spawnWave`) — **vlna = jeden combat**.
   - **Gating se promítá i do `canCast*`** (dungeon/gauntlet) → UI ability zašedne;
     `submitPartyAction` ji odmítne.
4. **Vyčerpání = „drž"**, ne crash: ability se přeskočí jako kdyby byla na cooldownu →
   aktér mlátí basic / jinou ability (žádný kolaps rotace).
5. **Tagy v MVP:** `fighter_action_surge` + `rogue_assassinate` = `oncePerCombat: true`.
   (`fighter_onslaught` ponechán jako sustained — přejde na `grantsExtraAction` ve S2.)
6. **`oncePerTurn` se zatím NEzavádí** — nemá v současném single-attack-per-turn modelu
   co gatovat; přijde se Slice 2 (extra attacks), aby slice zaváděl jen to, co používá.

## Důsledky

- **Balanc:** Action Surge/Assassinate teď přispějí jednou za boj (D&D-věrné). Magnitudy
  jednotlivých zásahů beze změny. Existující kontraktní testy (pvp/raid/gauntlet/dungeon/
  gear-balance) zůstaly zelené — tyhle dvě ability nebyly v asertovaných výsledcích.
- **Zpětná kompatibilita:** staré persistované běhy bez `usedOncePerCombat` se čtou jako
  prázdné pole (`?? []`), lazy-init při zápisu → žádná migrace.
- **Determinismus zachován:** gating jen vynechá seslání (mění výsledek seedu jako každá
  rotační podmínka), žádné nové RNG draws.

## Alternativy

- *„Big bang" jeden akční-ekonomika engine přes všechny simy* — zamítnuto: 6 různých
  turn-loopů, velký refaktor, riziko regresí (proti „malé vertikální přírůstky").
- *Action Surge jako reálná extra akce hned ve Slice 1* — odloženo do S2 (dotýká se
  turn-loopů + UI); S1 je čistě bug-fix + datový/helper základ.

## Reference

- Kód: `packages/shared/src/data/abilities.ts` (`SignatureAbility.oncePerCombat`, tagy),
  `combat.ts` (`abilityOnceAvailable`/`markAbilityUsed`), `quest-run.ts`, `pvp.ts`,
  `raid.ts`, `dungeon-run.ts`, `dungeon-party.ts`, `gauntlet.ts`.
- Testy: `packages/shared/src/action-economy.test.ts` (helpery + quest/dungeon/gauntlet kontrakt).
