# ADR 0006 — Aktivity & questing (idle smyčka M2)

**Status:** Accepted · **Datum:** 2026-06-14

## Kontext

M2 staví první kompletní idle smyčku: hráč pošle postavu questovat, ta na pozadí
(i offline) získá XP a zlato, hráč se vrátí, vybere odměny a postava povýší.
Navazuje na server-authoritative idle model z ADR 0002.

## Rozhodnutí

### 1. Obecný activity model, zatím jen `quest`

Tabulka `character_activities` má sloupec `activity_type` + `params` (jsonb).
M2 implementuje jen typ `quest`, ale profese (M6) a dungeony (M5) se přidají
přidáním nového `activity_type` + větve v `computeActivityReward`, bez refaktoru
schématu. **Jedna aktivní aktivita na postavu** (unique `character_id`).

### 2. Deterministický, lazy dopočet (anti-cheat)

Aktivita = `start_at` + `duration_sec` + `seed`. Průběh i odměny jsou čisté
funkce v `@game/shared` (`activityProgress`, `computeActivityReward`):

- **Server volí `seed`** při startu z neměnných vstupů
  (`seedFromString("<characterId>:<questId>:<startAtMs>")`) → odměna je
  reprodukovatelná a validovatelná, klient ji nemůže ovlivnit.
- **XP je fixní** (předvídatelný leveling), **zlato má varianci** ±`goldVariance`
  rollovanou přes `SeededRng` — demonstruje seedovanou náhodu.
- Odměny se počítají **lazy při claimu** (jediný zdroj pravdy). Offline progres
  „dožene" sám při návratu hráče, bez stálé zátěže.

### 3. BullMQ jen jako hook pro „nastane i bez hráče"

Při startu se naplánuje delayed job na čas dokončení. V M2 worker jen loguje;
v M3 zde vznikne push notifikace. Scheduler je **best-effort** — když Redis
neběží, smyčka stále funguje přes lazy dopočet (job není zdroj pravdy o odměnách).
BullMQ si spravuje vlastní Redis connection (options odvozené z `REDIS_URL`).

### 4. Leveling ve `@game/shared`

XP křivka (cap 60, „long-haul") z M0 zůstává. M2 doplňuje smluvní aliasy
`xpForLevel` / `levelFromXp` a `applyXpGain` (detekce level-upu po zisku XP).
Statový výpočet per-level už řeší `baseStatsFor(race, klass, level)` z M1.

### 5. Rozsah obsahu MVP (rozhodnutí PM)

- **3 level brackety na frakci** (frakce kosmetická, viz ADR 0003 — paralelní
  zóny se stejnými level reqy, dobami i odměnami, liší se jen lore/názvy):
  - **Alliance**: Northshire Valley (1–10), Westfall (10–25), Duskwood (25–40).
  - **Horde**: Durotar (1–10), The Barrens (10–25), Thousand Needles (25–40).
- Zóna má atribut `faction`; frakce questu se **odvozuje z jeho zóny**
  (`ZONES[zoneId].faction`) — žádná duplicita. Postava vidí jen questy své frakce.
- Zóna gateuje questy přes `requiredLevel`; `isQuestAvailable`/`availableQuests`
  berou frakci postavy jako parametr.
- **Lineární questline** (story chain napříč zónami přes `requiresQuest`,
  jednorázové) **+ repeatable** filler questy (gated levelem/zónou/frakcí).
- Statická data v `packages/shared/src/data/{zones,quests}.ts` = jediný zdroj pravdy.

## Důsledky

- Žádný `Math.random()` v odměnách; vše přes `SeededRng`.
- Dokončené story questy se evidují v `completed_quests` (prerekvizity + anti-repeat).
- Web jen zobrazuje stav a posílá záměry (start/claim); autorita je server.
- Migrace `0001_right_reavers` (gold sloupec, `character_activities`,
  `completed_quests`) se aplikuje auto při startu API (NAS-friendly).
