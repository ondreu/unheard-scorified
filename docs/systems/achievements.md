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
| `dungeonClears` | vítězné `raid_runs` (`content_type='dungeon'`) s účastí |
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

## Denní / týdenní cíle (M9)

Časově omezené cíle (`@game/shared/goals.ts`) recyklují metriky, ale počítají se
**v rámci období**: UTC den (`daily`) nebo UTC týden (`weekly`, sdílí pondělní
kotvu s weekly lockoutem). Po resetu se dají splnit znovu. Metriky musí být
časově ukotvené (`questsCompleted`, `dungeonClears` — mají timestamp ve zdroji);
progres = počet od `periodStartMs`. (Raid metriky odebrány — ADR 0033.)

- `GET /characters/:id/achievements/goals` → `{ daily, weekly, resetsAt }`.
- `POST /characters/:id/achievements/goals/:goalId/claim` → odměna jednou za
  období (`character_goal_claims`, PK `(postava, cíl, periodId)`, migrace `0018`).

Web: sekce „Daily goals" / „Weekly goals" nahoře na stránce achievementů.
