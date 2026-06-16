# ADR 0024 — Quest narrative + combat engine (M9 quest overhaul)

Status: Accepted (M9)
Kontext navazuje na: 0002 (idle model), 0006 (activities & questing), 0008 (combat).

## Kontext

Questy z M2 byly „nudná chore": pošli idle timer → claim XP/zlato. Žádný příběh,
žádný combat, repeatable byly pokaždé identické. Zadání PM (M9): questy mají být
**vícekrokový příběh** — „vydal jsem se hledat tu věc → teď je combat s gnollem →
teď jsem našel tohle → teď jsem zabil bosse" — s **více unikátními questy, lore**,
a **repeatable jako náhodně generované události**. Plus **dungeon attunement**
(questline odemyká dungeon).

Omezení projektu (tvrdá): idle-first (kontrola párkrát denně), determinismus
(seedovaný RNG, server-authoritative), sdílená pravda jen v `packages/shared`,
žádná duplikace combat vzorců.

## Rozhodnutí

1. **Idle zachováno — log se generuje při claimu** (volba PM). Quest zůstává
   JEDEN idle běh (`character_activities`, beze změny schématu). Při claimu se
   z `ActivityState.seed` (stejný seed jako pro odměny) deterministicky vygeneruje
   `questLog` (`ClaimResult.questLog`) — narativní beaty prokládané auto-resolved
   combaty. Žádná nová nutná interakce, žádná migrace, žádný per-step stav.
   Alternativa „krok po kroku s potvrzováním" zamítnuta jako protichůdná idle-first.

2. **Combat NELZE prohrát** (volba PM). Questový combat je flavor: silnější
   postava = rychlejší/čistší boj (vyšší zbylé HP), slabší = víc utržených ran,
   ale postava nikdy neklesne pod 1 HP a quest se vždy dokončí. Tím **idle progres
   nikdy nezamrzne**. Odměny (`computeQuestReward`) se NEMĚNÍ → balanc (M9 pass)
   zůstává netknutý; combat je čistě nadstavba.

3. **Data: kroky a události na questu.** `QuestDef.steps?: QuestStep[]`
   (`narrative` | `combat`) pro ručně psané story questy; `events?: QuestEventDef[]`
   + `eventCount?` pro repeatable (z poolu se deterministicky vybere podmnožina →
   variabilní průběh). Combat krok zadává jen **jméno + tier** nepřítele; staty se
   odvodí z `requiredLevel × tier` (`questFoeStats`) — autor questu neřeší balanc
   čísla. Quest bez `steps`/`events` → fallback (jeden beat z `description`), takže
   nic se nerozbije a obsah lze doplňovat postupně.

4. **Engine recykluje combat.** `quest-run.ts::simulateQuestRun` staví na
   `computeHit`/`applyAbsorb` z `combat.ts` (žádná duplikace per-hit vzorců).
   Combat profil postavy (gear + talenty + rotace) poskytuje
   `RotationService.buildCombatProfile` (sdílené s dungeon/raid/arena/dummy).

5. **Dungeon attunement.** `DungeonDef.attunement?: { questAnyOf: string[] }`
   (mirror `RaidAttunement`). `isDungeonUnlocked(id, level, completedQuestIds)`.
   Vynuceno v `DungeonService` (list/enter/queue/runForGroup) i v group launch
   (`isGroupContentUnlocked`). Vzorově Ragefire Chasm gated startovním questlinem.

## Důsledky

- **+** Questy mají příběh, lore i combat bez ztráty idle-first a determinismu;
  combat je validovatelný ze snapshotu+seedu (anti-cheat) jako zbytek hry.
- **+** Žádná migrace, žádný nový per-step stav — minimální plocha pro chyby.
- **+** Obsah je inkrementální: M9 přepsal startovní zóny (Northshire + Durotar)
  jako vzor; ostatní zóny běží na fallbacku a doplní se v content passu (M10+).
- **−** Combat „nelze prohrát" je čistě flavor — neklade riziko/odměnu na gear.
  (Vědomá volba PM; iterativní wipe/retry zůstává doménou dungeonů/raidů.)
- **Follow-up**: dopsat steps/lore pro Westfall/Duskwood/Barrens/Thousand Needles
  a raid-attunement questy; questy s reálným combat-cílem (kill/clear) mimo idle
  timer; per-dungeon attunement questline pro vyšší dungeony.
