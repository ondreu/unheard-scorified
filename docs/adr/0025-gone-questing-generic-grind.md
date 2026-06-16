# ADR 0025 — „Gone Questing": generický grind místo repeatable questů

Status: Accepted · Datum: 2026-06-16

## Kontext

Repeatable questy (per-zóna filler s pevnou délkou) měly dva problémy, na které
upozornil PM:

1. **Na nízkých levelech jen krátké questy.** Startovní brackety nabízely jen běhy
   ~5–20 min. Idle hráč, co kontroluje jednou denně, nemá co zařadit „přes noc" →
   promrhaný offline čas, přitom design slibuje „set & forget na hodiny".
2. **Příběhových questů je málo, ale donekonečna přidávat questy není řešení.**
   Odměny jsou kalibrované na `referenceXpPerHour(L)` → na daném levelu má **každý
   quest stejnou XP/h**. Počet questů tedy neovlivňuje délku grindu (tu určuje XP
   křivka), jen rozmanitost/loot/příběh. Psát stovky repeatable questů = drahé a s
   nízkou marginální hodnotou.

## Rozhodnutí (PM)

- **Příběhové (`story`) questy zůstávají** jako kurátorovaná, jednorázová páteř
  (rozšíří se v M12).
- **Repeatable questy se ruší** a nahrazuje je jeden generický **„Gone Questing"**:
  - Hráč zvolí **jen délku** běhu (5 min – 6 h). Žádný výběr konkrétního questu/zóny.
  - **Level flexuje s hráčem**: efektivní level = aktuální level postavy (snapshot
    při startu). Zóna (loot bracket + flavor nepřátele) se **auto-odvodí** z levelu
    a frakce (`questingZoneForLevel`).
  - **Odměny podle času**: XP/zlato = referenční rychlost(level) × délka ×
    `activityEfficiency` (mírný punish za dlouhý běh, >3 h plochých 0.8). Funkčně
    ekvivalent dřívějších repeatables, jen s volnou délkou.
  - **Loot**: jeden roll z bracketu zóny na `GRIND.lootRollSec` (30 min) běhu →
    drop ∝ času, jako kdyby hráč udělal odpovídající počet krátkých questů. Overflow
    nad kapacitu inventáře jde přes poštu (M10 `InventoryGrantService`).

## Implementace

- **Shared**: nový `ActivityType 'grind'` + `GrindActivityParams { zoneId, level }`
  (`activity.ts`), `computeGrindReward` (deterministické z params+durationSec+seed),
  `grind.ts` (`questingZoneForLevel` + flavor log `simulateGrindRun`, recykluje
  quest combat engine), `referenceGoldPerHour` (`leveling.ts`), balanc v
  `constants.ts → GRIND`. Odebráno 16 repeatable quest definic z `quests.ts`
  (engine náhodných událostí `quest.events` zůstává dostupný, dormantní).
- **API**: `ActivityService.startQuesting` (validace délky, snapshot level/zóna),
  grind větev v `claim` (flavor log do `questLog`) a `toActivityView` (titulek
  „Gone Questing: <Zóna>"). `StartActivityDto.questId` volitelné + `durationSec`.
- **Web**: `startQuesting` v `api.ts`, sekce „Gone Questing" s výběrem délky na
  `/characters/[id]/quests`. Character page i claim log fungují genericky.

## Důsledky

- **Idle od začátku**: level-1 hráč zařadí klidně 6h běh (set & forget).
- **Míň nutného obsahu**: grind nese propustnost; do questů investujeme úsilí jen
  na kvalitní příběh (M12), ne na kvantitu filleru.
- **Interní název zůstává `grind`** (odlišení od reálných questů `quest`); „Gone
  Questing" je jen UI string (oddělení stringů od logiky dle CLAUDE.md).
- **Determinismus zachován**: level/zóna snapshotnuté při startu, vše přes `SeededRng`.

## Drop rate (orientačně)

Per roll = `anyDropChance` bracketu (0.25–0.32). 1 roll / 30 min, takže max **6h
běh = 12 rollů** → očekávaně ~3–4 itemy, šance na alespoň jeden ~97–99 %. XP nad
cap (lvl 60) se nevyužije (jen zlato/loot mají smysl). Balanc (`GRIND.*`) laditelný
na jednom místě.
