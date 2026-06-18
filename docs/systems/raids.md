# Systém: Raidy (MP PVE) — M8 ❌ ODSTRANĚNO (ADR 0033)

> ⚠️ **Raidy byly vyříznuty (ADR 0033, 2026-06-18).** Tento dokument je
> **historický**. Raid mód (data, služby, UI, loot, achievementy) už neexistuje.
> Sdílený **group-run engine** (party vs sekvence, role T/H/DPS, wipe/retry) a run
> tabulky **přežívají** pod legacy názvy `raid_*` a obsluhují už jen **dungeony**
> (viz `docs/systems/groups.md`, `combat-dungeons.md`). Níže popsaný stav platil
> do odstranění.

Organizovaný skupinový PVE obsah s rolemi, idle boss fighty, attunement gatingem
a raid lootem. Rozhodnutí a důsledky: **ADR 0011** (superseded ADR 0033). Combat
recykluje M5 engine.

## Velikost & kompozice (rozhodnutí PM)

Modern-WoW flex velikosti **5 / 10 / 20** (`RAID_SIZES`); per-raid `RaidDef.sizes`
(první = default). Hráč při `enter` zvolí `size` + **vlastní kompozici**
`{tank,healer,dps}` (`isValidComposition`: součet = size, jeho role ≥ 1); jinak
`defaultRaidComposition(size)` (5: 1/1/3 · 10: 2/2/6 · 20: 2/5/13). Kompozice je
**cíl** — chybějící sloty zůstanou prázdné (NPC backfill **odebrán**); party se
skládá jen z reálných hráčů a boss se škáluje skutečnou velikostí party (málo
healerů → wipe, málo dps → enrage).

**Boss scaling** (`scaleBoss`): boss HP i dmg ×`size/5` → balanc zůstává zhruba
invariantní napříč velikostmi, rozhoduje hlavně kompozice. Velikost se odvodí
z délky `party` snapshotu (žádná nová migrace).

## Role

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

## Obsah (4 raidy × 3 bossy)

`packages/shared/src/data/raids.ts`:

| Raid | Level | Velikosti | Bossové | Attunement |
| --- | --- | --- | --- | --- |
| Molten Core | 40 | 5/10/20 | Lucifron, Magmadar, Ragnaros | dokončený tier-3 capstone (`dw_morbent_fel` / `tn_galak_ogres`) |
| Zul'Gurub | 50 | 10/20 | High Priest Venoxis, Bloodlord Mandokir, Hakkar the Soulflayer | `al_/ho_paragons_of_power` (questline, M12) |
| Blackwing Lair | 55 | 10/20 | Razorgore, Vaelastrasz, Nefarian | `al_/ho_drakefire_attunement` (questline) |
| Temple of Ahn'Qiraj | 58 | 10/20 | The Prophet Skeram, Battleguard Sartura, C'Thun | `al_/ho_scepter_of_the_sands` (questline, M12) |

Progrese: MC (40) → **Zul'Gurub (50)** → BWL (55) → **Temple of Ahn'Qiraj (58)** vyplňuje
dříve tenké pásmo 40–60. ZG i AQ přibyly v **M12** (jen data — combat/run model i
web/API se nemění, vše iteruje přes `RAIDS`).

Loot: `RAID_LOOT_TABLES` (loot.ts) → epic/legendary raid gear (`items.ts`, vše BoP).
ZG = epic ilvl 54–57; AQ = epic ilvl 62–65 + legendary `aq_scepter_shifting_sands`
(ilvl 68) od C'Thuna. Attunement questy jsou plně narativní (M12 styl, per-frakce
paralelní), navazují na frontier questlines (EPL / Felwood).
`isRaidUnlocked(raidId, level, completedQuestIds)` = level + alespoň jeden attunement quest.

## Matchmaking (jen reální hráči — bez NPC backfillu)

- `POST …/raids/:raidId/queue {role}` — čekání ve frontě (Redis hash, snapshot).
- `POST …/raids/:raidId/enter {role}` — sestaví party: vytáhne čekající reálné
  hráče pro chybějící role (atomicky) a okamžitě vyřeší. **Žádný NPC backfill** —
  chybí-li hráči, party je menší a boss se škáluje její velikostí. Vytažení hráči
  dostanou odměnu + push (jako offline arena soupeř).
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

## Iterativní wipe/retry (M8.5-A)

`simulateRaidRun` je **orchestrátor per-boss pullů** (helper `fightBoss` = jeden
pull party vs boss). Wipe (celá party mrtvá) → retry téhož bosse (`BOSS_ATTEMPT_CAP`
= 7 pullů), boss se **zlehčí** sdílenou křivkou `determinationFactor`
(`1 → 1 → 0.95 → … → 0.75`, první wipe zdarma). Poražení bossové zůstávají; po wipu
se party resetuje na plnou HP. Vyčerpání pokusů = **hard fail** (0 odměny, žádná
útěcha — ruší dosavadní 10% útěchu).

`RaidCombatResult.wipes` se propisuje do `computeRaidReward(raid, victory, seed,
wipes)` → odměna všech účastníků škálovaná `wipeRewardMultiplier` (XP, zlato, loot
šance). Run view vystaví `wipes` po dokončení. Detail: ADR 0013.

## Weekly lockout (M8.6)

Každý raid podléhá **týdennímu lockoutu per postava** (deterministicky dle UTC
týdne). První **vítězný** run raidu v týdnu postavu „saved" (`character_lockouts`);
další clear téhož raidu v témže UTC týdnu pak **odměnu nedá** (XP, zlato i loot =
0). Wipe/hard fail nelockuje. Reset v pondělí 00:00 UTC (čistý dopočet, žádný
scheduler). Run view vystaví `myLockedOut`. Vzorce: `@game/shared/lockout.ts`
(`lockoutIdForContent('raid', id)`, `weeklyLockoutId`). Detail: **ADR 0015**.

## Ruční formace — trvalá skupina (M9)

Vedle idle fronty lze raid sestavit **ručně přes trvalou skupinu**
(`/characters/[id]/group`, viz `docs/systems/groups.md` + **ADR 0022**): leader
sestaví party (friends/guild) a spustí raid. Běží s připojenými reálnými hráči —
**žádný NPC backfill**; spuštění recykluje `RaidService.runForGroup` →
`finalizeRun` (stejná simulace/odměny/lockout jako idle `enter`). _Původní raid
lobby (M8.5-B) bylo nahrazeno skupinou._
Tabulky `raid_lobbies` + `raid_lobby_members`; sloty počítají čisté helpery
`@game/shared/lobby.ts`. Detail: **ADR 0018**.

## Zbývá doladit (M9)

Balanc (boss HP/AP, role tuning, loot, size scaling faktor, determination
křivka/strop pokusů), 40-player velikost, per-role gating dle classy, délka
trade-window pro BoP loot.
