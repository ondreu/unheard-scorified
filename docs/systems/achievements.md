# Achievementy (M9)

> Viz ADR `docs/adr/0021-achievements.md`. Jednorázové mety s odměnou ve zlatě.

## Princip

Splnění se **odvozuje lazy z herního stavu** (žádné countery napříč systémy).
Metriky (`@game/shared/achievements.ts`):

| Metrika | Zdroj |
| --- | --- |
| `level` | level z `total_xp` |
| `gold` | aktuální zlato |
| `questsCompleted` | počet `completed_quests` |
| `dungeonClears` / `raidClears` | vítězné `raid_runs` dle `content_type` s účastí |
| `arenaWins` | součet `arena_ratings.wins` |
| `friends` | počet přijatých přátelství |

Katalog `ACHIEVEMENTS` (id, name, description, metric, threshold, rewardGold).
`achievementProgress(value, threshold)` → `{ completed, pct }`.

## API

- `GET /characters/:id/achievements` → seznam s progresem, `completed`, `claimed`,
  `claimable`.
- `POST /characters/:id/achievements/:achievementId/claim` → udělí zlato (jednou;
  `character_achievements`, migrace `0017`).

## Web

`/characters/[id]/achievements` — progress bary, tlačítko Claim u splněných.

## Follow-up

Denní/týdenní **cíle** (časově omezené, recyklují metriky + period id jako
weekly lockout) jsou navazující krok.
