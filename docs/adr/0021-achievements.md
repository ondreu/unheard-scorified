# ADR 0021 — Achievementy (M9)

- Status: Accepted
- Datum: 2026-06-15
- Kontext milníku: **M9 — Polish, balanc, pixel grafika, sociální**

## Kontext

M9 zahrnuje achievementy a denní/týdenní cíle. Tento ADR pokrývá **achievementy**
(jednorázové mety s odměnou). Klíčové rozhodnutí: jak sledovat splnění bez
invazivního instrumentování každého herního systému.

## Rozhodnutí

### 1. Achievementy se odvozují z existujícího stavu (read-model), ne countery

Místo aby každý systém (quest/dungeon/raid/arena/social) inkrementoval countery,
se splnění **počítá lazy při čtení** agregací nad už perzistovanými daty:

| Metrika | Zdroj |
| --- | --- |
| `level` | `levelFromXp(characters.total_xp)` |
| `gold` | `characters.gold` |
| `questsCompleted` | count `completed_quests` |
| `dungeonClears` / `raidClears` | count vítězných `raid_runs` (dle `content_type`) s účastí postavy |
| `arenaWins` | sum `arena_ratings.wins` |
| `friends` | count `accepted` friendships |

Výhody: **žádné dotyky cizích modulů** (nízké riziko regresí), žádná
de-synchronizace counterů, jednoduché přidání metrik. Cena: pár agregačních
dotazů při čtení (zanedbatelné u idle hry).

### 2. Katalog ve `@game/shared`, odměna jednorázová

`ACHIEVEMENTS` (id, name, description, metric, threshold, rewardGold) + čisté
helpery `achievementById`, `achievementProgress`. Splnění = `value >= threshold`.
Nárok (`claim`) udělí zlato a zapíše se do `character_achievements` (PK brání
dvojímu udělení). Web ukazuje progress bar a tlačítko Claim u splněných.

### 3. Stejné vzory

`ProgressionModule`: tenký controller → `ProgressionService` (ownership, výpočet,
claim) → `ProgressionRepository` (agregační dotazy + idempotentní claim).

## Důsledky

- **Pozitivní**: izolované, bez rizika pro ostatní systémy; snadno rozšiřitelné
  (další metriky/tiery); odměny přes existující `addGold`.
- **Kompromisy**: metriky musí být derivovatelné z DB (např. „zlato vyděláno
  celkem" se netrackuje → použito „drženo zlato"); achievementy se nevyhodnocují
  push-em v reálném čase (hráč je uvidí splněné při příští návštěvě stránky —
  pro idle hru přirozené). Denní/týdenní cíle (časově omezené) = navazující krok.

## Testy

- `@game/shared` unit: `achievements.test.ts` (katalog, `achievementById`,
  `achievementProgress`).
- API integrační: `progression.flow.test.ts` (pglite) — derivace level/quests,
  claim přidá zlato + idempotence, nelze claimnout nesplněné, ownership.
