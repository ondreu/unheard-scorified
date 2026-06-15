# ADR 0023 — Mounty (speed bonus oddělený od kosmetiky)

Status: Accepted · M10+ (FEAT)

## Kontext

PM zadání (ROADMAP M10+ FEAT, 🧑‍💼): **Mounty** — velmi drahé, od vyššího levelu
(vanilla styl). Zrychlují questy a gathering (snižují `durationSec` aktivit).
Kosmeticky oddělené (skin) od bonusu (speed) → kompatibilní s pozdější monetizací
(průřezový princip projektu: cosmetic nikdy nedává power).

## Rozhodnutí

1. **Speed = mechanický přínos, vizuál = kosmetika.** Efektivní speed bonus postavy
   je odvozený z **nejlepšího vlastněného mountu** (`mountSpeedBonus`), nezávisle
   na tom, který mount má hráč zvolený jako „active" (`characters.active_mount_id`,
   čistě vizuál). Tím lze později prodávat cosmetic mounty (i s 0 bonusem) bez
   refaktoru jádra — power se nikdy neváže na konkrétní skin.
2. **Dva tiery** (basic level 30 / +30 %, epic level 50 / +50 %), každý s víc
   kosmetickými variantami sdílejícími bonus. Cena = velký gold sink (250 / 2500 g).
3. **Bonus se aplikuje při startu pohybové aktivity** (`applyMountSpeed` na
   `quest` + `gather`), uloží se už zkrácený `durationSec` → zůstává
   server-authoritative, deterministické a kompatibilní s offline dopočtem a
   BullMQ schedulerem. Crafting (stacionární) se nezrychluje.
4. **Data jen v `@game/shared`** (`data/mounts.ts`) — katalog, tiery, helpery
   (`mountSpeedBonus`, `applyMountSpeed`). API i web čtou tentýž zdroj.
5. **Bez DI cyklu**: `MountRepository` v leaf `MountDataModule` (jen DB token),
   importují ho `MountModule` (player endpointy), `ActivityModule` a
   `ProfessionModule` (čtení vlastnictví při startu). Stejný vzor jako
   `ProfessionDataModule`.

## Důsledky

- Nová tabulka `character_mounts` + sloupec `characters.active_mount_id`
  (migrace `0021`).
- `MountModule`: GET stáj, POST buy (level/gold gate, atomický `spendGold`),
  POST select (kosmetika). Dev: `grant-mounts`.
- Web `/characters/[id]/mounts`.
- Idle smyčka se zrychlí pro hráče s mountem; balanc cen/efektu → M9 balanc pass.

## Alternativy

- **Speed přímo z `active_mount_id`** — zamítnuto: svázalo by power s vizuálem a
  rozbilo monetizační princip (cosmetic by musel mít speed).
- **Mount jako buff/consumable** — zbytečná složitost; mount je trvalé vlastnictví
  (vanilla styl), ne spotřebovatelný buff.
- **Account-wide mounty (jako skiny)** — zamítnuto pro MVP: level gate je
  per-postava (vanilla), per-character drží gating jednoduchý. Lze rozšířit později.
