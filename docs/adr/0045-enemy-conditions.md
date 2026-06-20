# ADR 0045 — Enemy schopnosti: conditiony (Slice 2a)

- **Stav:** přijato (Slice 2a — conditiony jako mechanika, tahový dungeon; live
  content + spojité simy = follow-up).
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

4. **Integrace do tahového dungeonu** (`dungeon-run.ts`):
   - **Stun** → postižený ztratí tah (hráč `resolveStunnedTurn`, parťák/nepřítel
     skip s hláškou); kolo doběhne (DoT → zbytek party → protiútok → údržba).
   - **attack disadvantage** (frightened/prone/restrained/slowed) → `combineAdvantage`
     ji sloučí s ability advantage / Dodge (advantage + disadvantage = normal).
   - **incoming advantage** (prone/restrained/stunned) → útoky na postiženého mají
     advantage (hráč i nepřítel).
   - **no bonus action** (slowed/stunned) → hráči se zablokuje vědomá bonus akce.

5. **Balanc-neutrální pro live content (jako ADR 0044).** Condition riders dostaly
   jen **bestiář kreatury** (pack_takedown→prone, frost_nova→slowed, slam→prone,
   rooting_grasp→restrained, mind_blast→stunned, fire_breath→frightened) — žádnou
   **nepoužívá** živý dungeon (ten autoruje přes šablony bez abilit). Mechanika je
   tedy dormantní; rozsvítí se, až Slice 2b přiřadí abilities dungeon bossům.

## Důsledky

- **+** Nepřátelská (i hráčská — symetricky v `combatantHitEnemy`) ability umí
  uvalit reálný status efekt přes jeden D&D save. Bestiář pokrývá všech 5 typů.
- **+** Sdílené čisté helpery (`conditions.ts`) → Slice 2b/continuous simy je jen
  „dotáhnou", žádná duplikace logiky.
- **−** Zatím jen **tahový dungeon** (`dungeon-run.ts`). MP dungeon (`dungeon-party.ts`),
  spojité simy (quest/raid/PVP) a Gauntlet conditiony **neaplikují** → follow-up.
  AI parťák má `slowed` (no-bonus) jen částečně (bonus heal se řeší mimo jeho tah).
- **−** Bez UI panelu aktivních conditionů (jen combat-log hlášky) → follow-up
  (deslopifikace UI).
- **Follow-up:** (a) Slice 2b — abilities živým dungeon bossům + bestiáři (rebalance
  proti `gear-balance`), (b) conditiony v MP/continuous/Gauntlet simech, (c) UI
  zobrazení aktivních conditionů, (d) další efekty (poisoned, charmed, blinded).

## Verifikace

Build/test/lint/typecheck zelené (652 shared + 199 API). Kontrakt:
`conditions.test.ts` (efekty/advantage/aplikace/tik), `data/enemies.test.ts`
(rider threading + pokrytí 5 typů), `dungeon-run.test.ts` (stun end-to-end:
uvalení → ztráta tahu; short rest setře conditiony).
