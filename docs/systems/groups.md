# Systém: Skupina / party (M9)

Trvalá skupina, se kterou se jde na **dungeon, raid i arénu**. Jeden formační
systém, který nahradil raid lobby (M8.5-B) i ruční team arénu (M8.5-C).
Rozhodnutí a důsledky: **ADR 0022**.

## Model

- `groups` (id, leaderCharacterId) + `group_members` (groupId, characterId, role,
  status `invited`|`joined`) — migrace 0020. Postava je v nejvýše jedné skupině
  (`joined`); pozvánky = řádky `invited`.
- Role = PVE role (tank/heal/dps); **aréna roli ignoruje**.
- Trvalá: přežívá mezi aktivitami (žádné auto-rozpuštění po runu).

## Formace (`GroupService`, `apps/api/src/group/`)

`create(role)` · `invite(name, role)` (jen leader; cíl musí být **friend/guildmate**)
· `respondInvite(accept, role?)` · `setRole(role)` · `leave` (odchod leadera →
předá vedení nejstaršímu, jinak rozpustí) · `kick` · `promote` · `disband` ·
`getState`. Web `/characters/[id]/group` (polling, bez WS).

## Launch (jen leader)

`launch(activityType, contentId)`:

| activityType | obsah | engine |
| --- | --- | --- |
| `dungeon` | dungeon id | `DungeonService.runForGroup` → group PVE run |
| `raid` | raid id (attunement dle leadera) | `RaidService.runForGroup` → `finalizeRun` |
| `arena` | — (bracket z velikosti) | 1→`ArenaService.queue`, 3/5→`TeamArenaService.launchForGroup` |

**Aréna bracket = velikost skupiny** (`arenaBracketForSize`: 1→1v1, 3→3v3, 5→5v5;
jiné velikosti odmítnuty). Žádný NPC backfill — obsah se odsimuluje s reálnou
partou, boss/encountery se škálují její velikostí. Recykluje existující run/aréna
enginy (combat, odměny, lockout, Elo, personal loot) — žádná duplikace.
