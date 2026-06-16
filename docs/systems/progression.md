# Progrese & balanc tempa (XP křivka, délky aktivit, efektivita)

> Detail-spec systému progrese. Kotva balancu (M9 balanc pass, rozhodnutí PM).
> Jediný zdroj pravdy pro čísla je `packages/shared` — tady je **model + odvození
> + cílová křivka** (mj. jako podklad pro plánování contentu napříč úrovněmi).

## Cíl (rozhodnutí PM)

- **Level cap 60**, velmi pomalá „long-haul" křivka — cap je hlavní dlouhodobá meta.
- **Early rychlé, se zvyšujícím levelem progresivně pomalejší.** lvl 10 ≈ za týden
  běžného hraní.
- **Cesta 1→60 ≈ 3–5 měsíců** kalendářně pro aktivního idle hráče.
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
   Kalibrováno `exponent = 2.0`, `scale = 120.8`, `base = 0`.
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

Čas (perfect-chain) a XP na jednotlivých úrovních:

| Level | XP na další level | h na tento level |
| ---: | ---: | ---: |
| 1 | 120 | 0,2 |
| 5 | 3 020 | 2,3 |
| 10 | 12 080 | 6,4 |
| 15 | 27 180 | 11,7 |
| 20 | 48 320 | 18,0 |
| 25 | 75 500 | 25,2 |
| 30 | 108 720 | 33,1 |
| 35 | 147 980 | 41,7 |
| 40 | 193 280 | 50,9 |
| 45 | 244 620 | 60,8 |
| 50 | 302 000 | 71,2 |
| 55 | 365 420 | 82,1 |
| 59 | 420 504 | 91,2 |

Po desítkových pásmech:

| Pásmo | h v pásmu | kumulativně na vstup | podíl z cesty |
| --- | ---: | ---: | ---: |
| 1–10 | 22 | 22 | 1 % |
| 10–20 | 113 | 135 | 5 % |
| 20–30 | 245 | 381 | 11 % |
| 30–40 | 409 | 790 | 19 % |
| 40–50 | 599 | 1388 | 27 % |
| 50–60 | 811 | 2199 | 37 % |

Celkové XP 1→60 = **8 481 344**.

> ⚠️ **Content gap 40–60.** Pásmo 40–60 je **64 % celé cesty**, ale dnes tam je
> tenký obsah (dungeony končí Scarlet Monastery lvl 30–38, pak jen repeatable
> questy + 2 raidy). Křivka je záměrně tímto směrem nastavená (cap = long-haul
> meta), ale **late-game obsah (zóny/dungeony/questy 40–60) je potřeba doplnit**,
> ať to není grind na jednom questu. Samostatný content task (viz ROADMAP M10+).

## Mimo rozsah tohoto passu

- **Drop rate** (loot tabulky) — vědomě odloženo na samostatný pass (rozhodnutí PM).
- **Profese**: durations už v rozsahu 5 min–40 min, character XP je vedlejší
  (hlavní reward = materiály/skill) → neladěno zde.
- **Zlato/ekonomika** (vendor ceny, AH, mounty) — gold rate držen mírný, aby se
  ekonomika nerozhodila; hlubší ekonomický balanc = follow-up.
- **PVP vs PVE** combat balanc — řešeno samostatně (MIL combat overhaul / balanc).

## Testy (kontrakt)

`packages/shared/src/progression.test.ts`:
- perfect-chain čas 1→60 v okně cíle (±2 %),
- monotónní `hoursToNextLevel` (early < late), lvl 10 ≈ 22 h, pásmo 50–60 dominuje,
- `activityEfficiency` endpointy/clamp/monotónnost,
- všechny questy v `[5 min, 3 h]` a `baseXp` kalibrovaný na referenční rychlost (±5 %).
