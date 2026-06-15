# Mounts (M10+ FEAT)

> Vanilla-WoW styl: drahé, od vyššího levelu. Zrychlují **pohybové** idle aktivity
> (questing + gathering) → kratší `durationSec`. Kosmetika oddělená od bonusu
> (mount = budoucí skin) → kompatibilní s monetizací. Viz **ADR 0023**.

## Model

- **Katalog**: `@game/shared/data/mounts.ts` (`MOUNTS`, jediný zdroj pravdy).
  Dva tiery:
  - `basic` — level 30, cena 250 g, **+30 %** speed.
  - `epic` — level 50, cena 2500 g, **+50 %** speed.
  Každý tier má víc **kosmetických variant** se STEJNÝM bonusem (Brown Horse /
  Dire Wolf / Striped Nightsaber; Swift Palomino / Swift Gray Wolf / Ebon Gryphon).
- **Power je odvozený z vlastnictví, ne z vizuálu**: `mountSpeedBonus(ownedIds)`
  vrací nejlepší bonus z vlastněných mountů. `characters.active_mount_id` je čistě
  kosmetická volba (jaký mount „vidíš") a NEMĚNÍ rychlost → pozdější prodej
  cosmetic mountů nikdy nedá power.
- **Aplikace bonusu**: `applyMountSpeed(durationSec, bonus)` zkrátí trvání aktivity
  (min. 1 s). Aplikuje se při **startu** quest (`ActivityService.start`) a gather
  (`ProfessionService.startGather`) běhu → uloží se zkrácený `durationSec`, takže
  zůstává server-authoritative a deterministické (offline progres se dopočítá
  beze změny). Crafting (stacionární) se mountem **nezrychluje**.

## Perzistence

- `character_mounts` (PK `character_id` + `mount_id`) — vlastněné mounty per postava.
- `characters.active_mount_id` (nullable) — kosmeticky zvolený mount. První koupený
  mount se nastaví jako aktivní automaticky.
- Migrace `0021_condemned_landau`.

## API (`MountModule`)

| Metoda | Endpoint | Popis |
| ------ | -------- | ----- |
| GET | `/characters/:id/mounts` | Stáj: katalog + owned/active/affordable/level-gate + efektivní speed bonus. |
| POST | `/characters/:id/mounts/:mountId/buy` | Koupě (level + gold gate, atomický `spendGold`). |
| POST | `/characters/:id/mounts/:mountId/select` | Nastaví aktivní (kosmetický) mount (musí vlastnit). |

`MountRepository` žije v leaf modulu `MountDataModule` (jen DB token), aby ho mohly
ActivityModule i ProfessionModule importovat pro výpočet speed bonusu **bez DI cyklu**
(stejný vzor jako `ProfessionDataModule`).

## Dev

`POST /dev/characters/:id/grant-mounts` — udělí všechny mounty (testing speed bonusu).
`reset` postavy mounty i aktivní volbu maže.

## Web

`/characters/[id]/mounts` — stáj: zlato, aktuální „Riding speed", koupě, výběr
aktivního mountu. Link z character page. Texty anglicky, oddělené od logiky.

## Testy

- shared `data/mounts.test.ts` (10): tier konzistence, best-of bonus, `applyMountSpeed`.
- API `mount.flow.test.ts` (8): level/gold gating, idempotence vlastnictví,
  kosmetický výběr nezávislý na power, zkrácení trvání.

## Zbývá doladit

- Balanc cen vs XP/gold křivka (M9 balanc pass).
- Mount jako prodejná cosmetic varianta (monetizace) — datově už připraveno.
- Flying-only zóny / racial mounty (později, pokud bude potřeba).
