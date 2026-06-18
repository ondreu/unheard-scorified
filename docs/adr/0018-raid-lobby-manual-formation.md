# ADR 0018 — Raid lobby (ruční formace, M8.5-B)

> ⚠️ **OBSOLETE:** raid lobby bylo nahrazeno trvalou skupinou (ADR 0022, migrace
> 0019 dropla `raid_lobbies`), a raidy jako celek byly **vyříznuty** (ADR 0033).

- Status: Superseded (ADR 0022) → raidy odstraněny (ADR 0033)
- Datum: 2026-06-15
- Kontext milníku: **M8.5-B** (odemčeno M9 social)

## Kontext

M8 přinesl raidy s **idle-first matchmakingem** (fronta v roli + NPC backfill →
řešitelné i sólo). M8.5-B doplňuje druhý režim (potvrzeno PM): **ruční sestavení**
pro min-max/social hráče — leader sestaví party, zve konkrétní postavy do rolí a
spustí. Pozvánky vyžadují identitu spoluhráčů → záviselo na **M9 social** (friends
+ guild), které je nyní hotové.

## Rozhodnutí

### 1. Lobby jako stavová koordinace nad existujícím run modelem

Nový **lobby** (forming → started | cancelled) drží sestavu před spuštěním:

```
raid_lobbies(id, raid_id, leader_character_id, size, composition, status, run_id, created_at)
raid_lobby_members(lobby_id, character_id, role, status: invited|joined, created_at, PK(lobby,char))
```

Lobby **nereplikuje** run model — při spuštění se sestaví party a deleguje na
sdílený `RaidService.finalizeRun` (odsimuluje, uloží `raid_runs` + participanty,
udělí odměny vč. weekly lockoutu). `enter` (idle) i `start` (lobby) tak sdílí
jednu cestu k runu — žádná duplikace simulace/odměn.

### 2. Idle NPC backfill zůstává i v ručním režimu

Při spuštění se **zbylé sloty kompozice doplní NPC** (`remainingSlots` →
`buildCompanionBase`/`deriveRaidActor`). Leader nemusí naplnit celou raid — drží
idle-first filozofii (lze spustit i s pár reálnými hráči). Snapshoty členů se
berou **čerstvé** z aktuálního stavu postavy při startu (ne stará data z pozvánky).

### 3. Pravidla a oprávnění

- Postava je nejvýše v **jednom aktivním (forming) lobby** jako připojený člen.
- **Jen leader** zve, vyhazuje a spouští. Odchod leadera lobby **zruší**
  (cancelled) — žádné osiřelé lobby.
- Pozvat lze jen postavu, která má **raid odemčený** (level + attunement) a není
  už v tomto lobby; rezervace (joined + invited) drží počty v mezích kompozice.
- Čisté, testovatelné helpery slotů v `@game/shared/lobby.ts` (`remainingSlots`,
  `canFillRole`, `isLobbyFull`) — shodné BE (autorizace) i FE (UI gating).

### 4. Stejné vzory jako zbytek raid modulu

`RaidLobbyController` (tenký) → `RaidLobbyService` (logika) → `RaidLobbyRepository`
(Drizzle), v rámci `RaidModule`. Realtime pozvánka (`raid:lobby_invite`) přes
`RaidEventsRelay` (best-effort; REST je zdroj pravdy).

## Důsledky

- **Pozitivní**: ruční režim bez duplikace combat/reward logiky; idle backfill
  zachován; model snadno rozšiřitelný (group dungeon lobby, ready-check, role-lock).
- **Kompromisy**: leadership se nepřevádí (odchod leadera ruší lobby) — jednoduché;
  kompozici lze v UI zatím jen vybrat z defaultu pro velikost (custom comp je
  podporovaná API-side). Lobby chat využije globální chat (per-lobby kanál later).

## Testy

- `@game/shared` unit: `lobby.test.ts` (sloty/kapacita rolí).
- API integrační: `raid-lobby.flow.test.ts` (pglite) — create, invite/accept,
  leader-only invite/start, neattuneovaný cíl, start s NPC backfillem (party na
  velikost), leave ruší lobby, ownership/forbidden. Refaktor `enter` na
  `finalizeRun` ověřen beze změny stávajících `raid.flow` testů.
