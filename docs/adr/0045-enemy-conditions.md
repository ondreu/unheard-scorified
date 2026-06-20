# ADR 0045 — Enemy schopnosti: conditiony (Slice 2a–2d)

- **Stav:** přijato. **Slice 2a** = conditiony jako mechanika v solo tahovém
  dungeonu (`dungeon-run.ts`). **Slice 2b** = stejná mechanika v **MP** tahovém
  dungeonu (`dungeon-party.ts`) přes sdílený `beginActorTurn`. **Slice 2c** =
  **živý obsah**: 10 dungeon bossů dostalo signature ability (typový úder + save +
  condition rider). **Slice 2d (1. část)** = conditiony jsou **obousměrné** —
  vybraná **hráčská kouzla/techniky** dostala condition ridery. Zbytek 2d (spojité
  simy/Gauntlet, trash/bestiář, UI) = follow-up (viz roadmap).
- **Kontext:** navazuje na napojení enemy abilit do enginu (ADR 0044, Slice 1),
  dice-roll combat + saving throwy (MR-5 / ADR 0032) a bestiář (MR-7 / ADR 0031).
  Slice 1 nechal `EnemyAbility.save.description` jen jako flavor („STR save or be
  knocked prone") — save uměl jen „half damage". Tenhle slice z té flavor
  hlášky dělá **reálnou mechaniku**.
- **Rozsah:** `packages/shared` — nový modul `conditions.ts`, rider na
  `SignatureAbility`/`EnemyAbility`, `applySpellSave` (dnd-combat.ts) a integrace
  do **tahového dungeon enginu** (`dungeon-run.ts`, solo + AI parťáci). **Bez DB
  migrace** (conditiony žijí v JSON run-stavu; staré běhy graceful → prázdné).

## Rozhodnutí

1. **Condition model (záměrně mechanický, ne plný D&D RAW).** Nový `conditions.ts`
   definuje 5 typů a jejich efekty (mapování přes flagy):

   | Condition    | skipTurn | attack disadvantage | incoming advantage | no bonus action |
   | ------------ | :------: | :-----------------: | :----------------: | :-------------: |
   | `stunned`    |    ✔     |                     |         ✔          |        ✔        |
   | `prone`      |          |          ✔          |         ✔          |                 |
   | `restrained` |          |          ✔          |         ✔          |                 |
   | `frightened` |          |          ✔          |                    |                 |
   | `slowed`     |          |          ✔          |                    |        ✔        |

   Modelujeme jen to, co dává smysl v idle/tahovém enginu (skip tahu, advantage/
   disadvantage na hod na zásah, blokace bonus-action). `prone`/`restrained` mají
   v našem modelu shodné mechanické flagy — rozdíl je flavor/trvání.

2. **Condition rider na ability.** `SignatureAbility.condition` / `EnemyAbility.
   condition` = `{ type, durationTurns }`. Uplatní se **jen na neúspěšný `save`** —
   sdílený `applySpellSave` (jeden hod = poloviční poškození *i* avšak-condition
   při úspěchu, jako D&D „save for half, or be …"). `SpellSaveOutcome.condition`
   nese rider k uvalení; volající ho přiřadí svému mutabilnímu aktérovi.

3. **Stav na aktérovi + životní cyklus.** `ActiveCondition[]` na hráči / parťákovi /
   nepříteli (`conditions?`, graceful). Conditiony se **uvalují během cizích tahů**
   a **tikají na začátku vlastního tahu** (`beginTurnConditions`: vyhodnotí efekty
   pro tento tah, pak dekrementuje) → každá vydrží přesně svůj počet tahů a nově
   uvalená nezmizí dřív, než se vůbec projeví. Stejný typ se **obnoví** (max
   trvání), neskládá se. **Short rest** mezi encountery conditiony setře.

3b. **Sdílený `beginActorTurn` (Slice 2b).** Per-turn vyhodnocení + dekrement
   vytaženo do `conditions.ts` (`beginActorTurn(holder)`), recyklováno solo
   (`dungeon-run.ts`) i MP (`dungeon-party.ts`) tahovým dungeonem. MP: stun =
   ztráta tahu člena (skip, AI fallback se nespustí), `attackerDisadvantage`
   protaženo `takeMemberTurn`/`aiMemberTurn`/`applyMemberAbility`→`memberHitEnemy`,
   slowed blokuje bonus-action v `resolvePartyRound`. Enemy condition rider →
   `applyCondition` na člena; short rest setře. **Bez DB migrace / změny API tvaru**
   (conditiony v JSON `PartyRunState`, optional pole, staré běhy graceful).

4. **Integrace do tahového dungeonu** (`dungeon-run.ts`):
   - **Stun** → postižený ztratí tah (hráč `resolveStunnedTurn`, parťák/nepřítel
     skip s hláškou); kolo doběhne (DoT → zbytek party → protiútok → údržba).
   - **attack disadvantage** (frightened/prone/restrained/slowed) → `combineAdvantage`
     ji sloučí s ability advantage / Dodge (advantage + disadvantage = normal).
   - **incoming advantage** (prone/restrained/stunned) → útoky na postiženého mají
     advantage (hráč i nepřítel).
   - **no bonus action** (slowed/stunned) → hráči se zablokuje vědomá bonus akce.

5. **Slice 2a/2b balanc-neutrální (jako ADR 0044).** Condition riders nejdřív
   dostaly jen **bestiář kreatury** (pack_takedown→prone, frost_nova→slowed,
   slam→prone, rooting_grasp→restrained, mind_blast→stunned, fire_breath→
   frightened) — žádnou nepoužíval živý obsah → mechanika dormantní.

6. **Slice 2c — aktivace v živém obsahu.** 10 final bossů dungeonů (`enemies.ts`
   boss šablony, instancované přes `instantiateEnemy` v `dungeons.ts`) dostalo
   **signature ability** = typový úder (`damageMult` 1.5–1.8) + saving throw +
   **condition rider** (frightened/prone/slowed/restrained/stunned napříč bossy).
   Tím se „Enemy schopnosti" rozsvítily v reálných dungeonech (auto-resolve i
   tahových). **Balanc je nově dotčen, ale ohlídaný:** `gear-balance` kontrakt
   měří syntetické CR-foe bez abilit (nedotčen); dungeon clear kontrakty
   (`dungeon-run.test.ts`/`raid.test.ts`) zůstaly zelené (geared hrdina dál
   čistí). V **auto-resolve** (`raid.ts`) je condition rider ignorován (nemá tahy)
   — boss tam jen udeří typově + se savem; conditiony se projeví jen v **tahových**
   dungeonech. Magnitudy bossů (HP/základní swing) i loot/XP beze změny.

7. **Slice 2d (1. část) — hráčská kouzla (plošně) + `effect: 'none'` + save-less
   ridery.** Aby conditiony nebyly „jen věc nepřátel", dostala condition rider
   **celá řada hráčských** abilit napříč třídami (engine je symetrický —
   `combatantHitEnemy`/`memberHitEnemy` uvalí condition na nepřítele). Tři vzory:
   - **`effect: 'none'`** (nový) — „weapon hit + save-or-condition": plný úder,
     save jen gatuje rider (Stunning Strike CON→stunned, Trip Attack STR→prone,
     Wrathful Smite WIS→frightened).
   - **`effect: 'half'/'negate'` + condition** — damage save *i* rider z jednoho
     hodu (Vicious Mockery, Dissonant Whispers, Phantasmal Killer, Mind Whispers →
     frightened; Quivering Palm → stunned; Spirit Guardians, Cone of Cold ×2, Ice
     Storm ×3 → slowed).
   - **save-less rider** (nový) — condition **automaticky na zásah**, bez saveu
     (Ray of Frost ×2 → slowed; D&D zpomalení na zásah je automatické). Engine:
     `combatantHitEnemy`/`memberHitEnemy` aplikují `ability.condition` přímo, když
     ability nemá `save`.

   Pokryto stunned/prone/frightened/slowed z hráčské strany (restrained zatím
   enemy-only — Web/Entangle nejsou v katalogu → „zbytek 2d"). `SpellCardInfo.
   condition` vystaveno pro UI štítek. **Balanc-neutrální mimo tahové dungeony:**
   ve spojitých simech (quest/gauntlet/PVP) se rider ignoruje (nemá tahy) a
   `'none'` poškození nemění → `gear-balance` i ostatní kontrakty beze změny;
   control se projeví jen v tahových dungeonech (proti boss obsahu z 2c).

8. **Slice 2d (zbytek hráčských kouzel) — restrained + condition-only control.**
   Doplnění obou chybějících vzorů z hráčské strany:
   - **Pure-control kouzlo bez poškození** (`isControlSpell` / `resolveControlCast`
     v `dnd-combat.ts`): D&D control kouzla (Hold Person, Web, Entangle) nemají
     útočný hod („d20 vs AC") ani poškození — cíl si jen hodí **save** a na
     **neúspěch** dostane condition. Pozná se podle `kind:'strike'` + `damageMult:0`
     bez `dice`/`bonusDice`, s `condition` riderem. Engine pro něj přeskočí celou
     damage cestu (`combatantHitEnemy`/`memberHitEnemy` vrátí brzy) a vyřeší jen
     `applySpellSave(…, 0)` → `applyCondition`. **Žádný chip damage** (kontrakt
     ověřuje nulové poškození) — odlišení od „dej 1 a uval condition".
   - **Restrained z hráčské strany** (poprvé): **Web**/**Entangle** (control-only,
     restrained 2 tahy) + **Ensnaring Strike** (Ranger; weapon hit + STR save
     `'none'` + restrained — jde normální damage cestou, vzor Trip Attack).
   - **Hold Person** mapuje D&D *paralyzed* na náš `stunned` (skip tahu + incoming
     advantage), WIS save negate, 1 tah. Zařazeno do `EXTRA_SPELLS` 6 casterů.

   Konzervativní rozsah: **autoHit obecné damage cesty se nemění** (Magic Missile
   v tahových dungeonech dál hází na zásah — latentní, mimo tento slice), control
   větev řeší „žádný útočný hod" sama. **Balanc-neutrální** mimo tahové dungeony
   (continuous simy: control kouzlo = 0 dmg, rider inertní → `gear-balance` beze
   změny). Kontrakt: `dnd-combat.test.ts` (isControlSpell + resolveControlCast),
   `dungeon-run.test.ts` (restrain end-to-end + nulové poškození).

## Důsledky

- **+** Nepřátelská (i hráčská — symetricky v `combatantHitEnemy`) ability umí
  uvalit reálný status efekt přes jeden D&D save. Bestiář pokrývá všech 5 typů.
- **+** Sdílené čisté helpery (`conditions.ts`) → Slice 2b/continuous simy je jen
  „dotáhnou", žádná duplikace logiky.
- **−** Zatím jen **tahové dungeony** (solo `dungeon-run.ts` + MP `dungeon-party.ts`).
  Spojité simy (quest/raid/PVP), Gauntlet a **hráčská kouzla** conditiony zatím
  **neaplikují** → follow-up (viz roadmap „rozšíření do existujících aspektů").
  V solo dungeonu má AI parťák `slowed` (no-bonus) jen částečně (bonus heal se řeší
  mimo jeho tah); v MP je `noBonusAction` plně respektován.
- **−** Bez UI panelu aktivních conditionů (jen combat-log hlášky) → follow-up
  (deslopifikace UI).
- **Follow-up (Slice 2d, zbytek):** (a) **další hráčská kouzla** s ridery (Hold
  Person, Web, Fear…) + condition-only kouzla bez damage (autoHit + save), (b)
  conditiony ve **spojitých** simech
  (quest/raid/PVP auto-resolve) + **Gauntlet** (timeline model: stun=pauza,
  disadvantage/slow=úprava hodu/tempa), (c) **UI** zobrazení aktivních conditionů,
  (d) **trash/bestiář** abilities + drain/dot enemy `kind` + další efekty
  (poisoned, charmed, blinded).

## Verifikace

Build/test/lint/typecheck zelené (662 shared + 199 API). Kontrakt:
`conditions.test.ts` (efekty/advantage/aplikace/tik), `data/enemies.test.ts`
(rider threading + pokrytí 5 typů), `data/dungeons.test.ts` (boss abilities),
`dnd-combat.test.ts` (`applySpellSave` `'none'` + obousměrné podmínky + katalog
hráčských kouzel), `spell-card.test.ts` (condition na kartě), `dungeon-run.test.ts`
+ `dungeon-party.test.ts` (stun end-to-end obou stran; short rest setře conditiony).
