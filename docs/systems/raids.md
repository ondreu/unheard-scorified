# Systém: Raidy (MP PVE) — M8

Organizovaný skupinový PVE obsah s rolemi, idle boss fighty, attunement gatingem
a raid lootem. Rozhodnutí a důsledky: **ADR 0011**. Combat recykluje M5 engine.

## Party & role (rozhodnutí PM)

5 hráčů: **1 tank / 1 healer / 3 dps** (`RAID_COMPOSITION` v `packages/shared/src/raid.ts`).

- **tank** — `maxHealth ×1.5`, `attackPower ×0.6`; boss na něj útočí a bere zmírněné
  poškození (`TANK_MITIGATION`).
- **healer** — léčí nejzraněnějšího živého spoluhráče (`healPower = attackPower ×1.6`),
  vlastní dmg `×0.15` (event typu `heal`).
- **dps** — beze změny (plný dmg bossovi).

`deriveRaidActor(base, role)` převede bojový profil (`deriveCombatProfile` z M5 —
base staty + gear + talenty) na `RaidActor`.

## Combat

`simulateRaidRun(party, bosses, seed)` — událostmi řízená deterministická simulace:
party útočí/léčí, boss cílí prvního živého tanka (jinak nejodolnějšího člena), po
`RAID_ENRAGE_SEC` enrage. Wipe (celá party mrtvá) = defeat, mezi bossy částečný
heal. Vrací `CombatEvent[]` timeline + `victory` + `durationSec`.

## Obsah (2 raidy × 3 bossy)

`packages/shared/src/data/raids.ts`:

| Raid | Level | Bossové | Attunement |
| --- | --- | --- | --- |
| Molten Core | 40 | Lucifron, Magmadar, Ragnaros | dokončený tier-3 capstone (`dw_morbent_fel` / `tn_galak_ogres`) |
| Blackwing Lair | 55 | Razorgore, Vaelastrasz, Nefarian | `al_/ho_drakefire_attunement` (questline) |

Loot: `RAID_LOOT_TABLES` (loot.ts) → epic/legendary raid gear (`items.ts`).
`isRaidUnlocked(raidId, level, completedQuestIds)` = level + alespoň jeden attunement quest.

## Idle-first matchmaking (NPC backfill)

- `POST …/raids/:raidId/queue {role}` — čekání ve frontě (Redis hash, snapshot).
- `POST …/raids/:raidId/enter {role}` — sestaví party: vytáhne čekající reálné
  hráče pro chybějící role (atomicky), zbytek doplní **NPC companiony**, okamžitě
  vyřeší. Vytažení hráči dostanou odměnu + push (jako offline arena soupeř).
- `POST …/raids/:raidId/leave`, `GET …/raids`, `GET …/raids/runs`, `GET …/raids/run/:runId`.

Raidy nepoužívají `character_activities` (MP) — vlastní tabulky `raid_runs` +
`raid_run_participants` (migrace 0006), snapshot party `RaidActor[]` + seed.

## Odměny

Při resolve se každému reálnému účastníkovi udělí XP/zlato/loot na seedu
`runId:characterId` (`computeRaidReward`). `durationSec` jen pro reveal logu.

## Realtime watch

`RaidGateway` (WS, recykluje M7 vrstvu): `raid:subscribe` / `raid:watch` /
`raid:resolved`. REST `GET …/raids/run/:runId` autoritativní fallback (web polluje).

## Web

`/characters/[id]/raids` (list + role + queue/enter + recent runs),
`/characters/[id]/raid/[runId]` (live watch + reward). Texty anglicky, oddělené.

## Zbývá doladit (M9)

Balanc (boss HP/AP, role tuning, loot), větší party (10/20/40), per-role gating
dle classy, weekly raid lockout.
