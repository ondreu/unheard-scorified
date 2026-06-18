# Progrese & balanc tempa (XP křivka, délky aktivit, efektivita)

> Detail-spec systému progrese. Kotva balancu (MR-11 — D&D level cap 20 + XP
> křivka, rozhodnutí PM). Jediný zdroj pravdy pro čísla je `packages/shared` —
> tady je **model + odvození + cílová křivka** (mj. jako podklad pro plánování
> contentu napříč úrovněmi).

## Cíl (rozhodnutí PM)

- **Level cap 20** (D&D, MR-11), velmi pomalá „long-haul" křivka — cap je hlavní
  dlouhodobá meta.
- **Early rychlé, se zvyšujícím levelem progresivně pomalejší.** lvl 1→2 ≈ 3,3 h
  perfect-chain (≈ „level za den" běžného hraní); cesta dál progresivně zpomaluje.
- **Cesta 1→20 ≈ 3–5 měsíců** kalendářně pro aktivního idle hráče (stejné cílové
  okno času jako WoW-éra, jen rozložené do 20 levelů místo 60 → každý level
  „těžší", víc obsahu na level).
- **Idle cadence**: nejkratší aktivita 5 min, nejdelší 3 h („kontrola párkrát denně",
  ale i krátké aktivní sezení).

## Metrika: „perfect-chain" herní čas

Aktivity běží **server-authoritative v reálném čase** (`start_at` + `durationSec`,
offline dopočet). Tempo proto měříme v **perfect-chain hodinách** = herní čas, kdy
hráč při každé kontrole hned zařadí další aktivitu (žádné prostoje). Reálný
kalendářní čas s mezerami bude delší.

Kalibrace: **cap ≈ 2200 h perfect-chain** (`TARGET_HOURS_TO_CAP`). Kalendářně:

| Aktivita/den (h) | Čas na cap |
| --- | --- |
| 24 (24/7) | ~3,0 měsíce |
| 18 (hodně aktivní) | ~4,0 měsíce |
| 12 (aktivní) | ~6,0 měsíce |
| 8 (casual) | ~9,0 měsíce |

## Model

Tempo určují dvě věci ve `packages/shared/src/constants.ts`:

1. **XP křivka** `XP_CURVE` → `xpForNextLevel(L) = floor(base + scale·L^exponent)`.
   Kalibrováno `exponent = 2.0`, `scale = 1966.2`, `base = 0`
   (`scale = TARGET_HOURS_TO_CAP · 600 / Σ_{L=1..19} L^1.5`).
2. **Referenční rychlost** `XP_REWARD_RATE` → `referenceXpPerHour(L) = 600·L^0.5`
   (XP/h „nejlepší dostupné" aktivity na levelu L při efektivitě 1.0; roste s √L,
   aby vyšší questy dávaly větší čísla).

Z toho **čas-na-level**:

```
hoursToNextLevel(L) = xpForNextLevel(L) / referenceXpPerHour(L)
                    = (scale·L^2) / (600·L^0.5)  ∝  L^1.5
```

→ tvar `L^1.5` (early rychlé, late pomalé), součet ≈ 2200 h. Změnou `scale` se
posune celkový čas (lineárně), změnou `exponent` (a `levelExponent` rychlosti) tvar.

### Délka aktivit & efektivita

- `ACTIVITY_DURATION_BOUNDS` = **[300 s, 10800 s]** (5 min – 3 h). Všechny questy
  drží tento rozsah (vynuceno testem).
- `activityEfficiency(durationSec)` (v `activity.ts`): lineárně **1.0 @ 5 min →
  0.8 @ 3 h** (mimo rozsah clampnuto). Mírný „punish" za dlouhý běh — aktivní hráč
  může mírně víc, idle hráč obětuje ~20 % za pohodlí „set & forget".
- Quest `baseXp`/`baseGold` jsou definované jako odměna při **efektivitě 1.0** =
  `referenceXpPerHour(requiredLevel) × hodiny` (resp. gold rate `40·√L`). Skutečná
  odměna při claimu = `× activityEfficiency(durationSec)` (zlato navíc ± varicance).
  → optimální tempo = řetězit kratší běhy; dlouhé běhy jsou pohodlnější, ne lepší.

## Cílová křivka (podklad pro content)

Čas (perfect-chain) a XP na jednotlivých úrovních (scale = 1966,2):

| Level | XP na další level | h na tento level | kumulativně h |
| ---: | ---: | ---: | ---: |
| 1 | 1 966 | 3,3 | 3,3 |
| 2 | 7 864 | 9,3 | 12,5 |
| 3 | 17 695 | 17,0 | 29,6 |
| 5 | 49 155 | 36,6 | 92,4 |
| 8 | 125 836 | 74,2 | 275,4 |
| 10 | 196 620 | 103,6 | 467,5 |
| 13 | 332 287 | 153,6 | 876,9 |
| 15 | 442 395 | 190,4 | 1 238,9 |
| 18 | 637 048 | 250,3 | 1 928,6 |
| 19 | 709 798 | 271,4 | 2 200,0 |

Po pětilevelových pásmech:

| Pásmo | h v pásmu | kumulativně na vstup | podíl z cesty |
| --- | ---: | ---: | ---: |
| 1–5 | 56 | 56 | 2,5 % |
| 5–10 | 308 | 364 | 14,0 % |
| 10–15 | 685 | 1 049 | 31,1 % |
| 15–20 | 1 151 | 2 200 | 52,3 % |

Celkové XP 1→20 = **4 856 506**.

> ⚠️ **Content gap 14–20.** Pásmo 14–20 je **~52 % celé cesty**, ale je tam
> tenčí obsah (linear rescale MR-11 zkomprimoval WoW frontier 40–60 do levelů
> 14–20: frontier zóny Blighted Marches/Witherwood, dungeony Zarfarai→Pyrehold).
> Křivka je záměrně tímto směrem nastavená (cap = long-haul meta), ale **late-game
> obsah (14–20) je potřeba zahustit** (o to víc po vyříznutí raidů — ADR 0033),
> ať to není grind na jednom questu. Samostatný content task (viz ROADMAP).

## Mimo rozsah tohoto passu

- **Drop rate** (loot tabulky) — vědomě odloženo na samostatný pass (rozhodnutí PM).
- **Profese**: durations už v rozsahu 5 min–40 min, character XP je vedlejší
  (hlavní reward = materiály/skill) → neladěno zde.
- **Zlato/ekonomika** (vendor ceny, AH, mounty) — gold rate držen mírný, aby se
  ekonomika nerozhodila; hlubší ekonomický balanc = follow-up.
- **PVP vs PVE** combat balanc — řešeno samostatně (MIL combat overhaul / balanc).

## Testy (kontrakt)

`packages/shared/src/progression.test.ts`:
- perfect-chain čas 1→20 v okně cíle (±2 %),
- monotónní `hoursToNextLevel` (early < late), lvl 1→2 ≈ 3,3 h, pásmo 15–20 dominuje (>40 %),
- `activityEfficiency` endpointy/clamp/monotónnost,
- všechny questy v `[5 min, 3 h]` a `baseXp` kalibrovaný na referenční rychlost (±5 %).
