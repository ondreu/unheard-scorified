# ADR 0035 — D&D-věrný gear + bounded ability skóre (dokončení MR-10e)

- Status: Accepted
- Datum: 2026-06-19
- Kontext fáze: **post-Remaster backlog** (Ekonomika & gear → „Recheck gear"; dokončení MR-10e follow-upu)

## Kontext

MR-10e (ADR 0032) převedl combat magnitudy na **literal D&D**: HP = hit dice,
nepřátelé = Challenge Rating, kouzla = literal dice. Zůstaly dva explicitně
odložené follow-upy a jeden skrytý problém, který D&D-ifikace odhalila:

1. **Gear stat škála byla z WoW éry.** Katalog `items.ts` (≈340 statových kusů)
   dával na lvl 20 jeden kus až `strength` 34 (→ modifikátor +17; D&D cap 20 =
   mod +5), `attack_power`/`spell_power` ~44, `armor` ~140. Base hráčova
   `attackPower` na lvl 20 bez gearu přitom ≈ 22. Full BiS tak převažoval nad base
   **23–1770×** (měřeno harnessem) a raw ability skóre na gearu kaskádovala přes
   AC / saving throws / attack bonus / spell save DC i `attackPower`.

2. **`PER_LEVEL_GROWTH = 1`** — každé ze 6 ability skóre rostlo **+1 za level**
   (na lvl 20 +19 ke každému; primár ~39, modifikátor +14). To bylo ve
   skutečnosti **dominantní** zdroj ne-D&D škálování: i nahá postava měla na lvl 20
   AC 22, attack bonus +20, spell DC 26 — zhruba 2× D&D-korektní hodnoty.
   (MR-1 ho označil „ad-hoc, balanc = MR-10".)

3. **`ENEMY_DPR_TO_SWING` / HP faktory** byly empirické, laděné proti nafouklé
   postavě.

## Rozhodnutí (PM)

1. **Gear model = D&D-věrný.** Gear dává primárně `attack_power` / `spell_power`
   (≈ magic weapon) a `armor` (AC). Raw ability skóre jen **malé a vzácné**
   (epic+ trinket „stat stick" +1; cap ~+2 z celého setu).
2. **Cílová váha gearu = střední.** Full BiS na lvl 20 ≈ **1.5–2× efektivní síla**
   nahé postavy (bounded accuracy; level/class/staty zůstávají relevantní).
3. **D&D-ifikovat i base scaling.** Odstranit per-level růst skóre; ability skóre
   plynou jen ze standard array + rasy + **ASI**, innate clampnuto na **20**.
4. **Casteři odloženi** na samostatný milník „Fix kouzla nesedící na D&D"
   (viz Důsledky).

## Implementace

- **`ABILITY_SCORE_CAP = 20`** (`character.ts`). `PER_LEVEL_GROWTH` odstraněn z
  `baseStatsFor` i `abilityScoresFor` (skóre už nezávisí na levelu). Combat engine
  cappuje `min(20, innate + ASI)` a teprve pak přičítá gear → bounded accuracy,
  bez kaskády z gearu.
- **`scripts/rescale-gear.py`** — deterministicky přepíše `stats: { … }` každého
  itemu z budgetu odvozeného z (itemLevel, rarity, slot, role). Role (martial vs
  caster) z původních statů. Idempotentní z čistého katalogu.
- **`ARMOR_PER_AC = 40`** (`combat.ts`, jediný zdroj pravdy pro `armor` → AC).
  Full BiS ≈ +3 AC.
- **Enemy 1v1 kalibrace přeladěna**: `ENEMY_HP_FACTOR` 0.26 / 0.40,
  `ENEMY_DPR_TO_SWING` 0.08 / 0.10 (trash / boss).
- **`gear-balance.test.ts`** — kalibrační harness + kontrakt: poměr BiS/naked
  v pásmu 1.4–2.25×, BiS staty power+AC s minimem ability, geared martial on-level
  boss 4–12 úderů s vítězstvím a HP ztrátou.

## Důsledky

- Bez DB migrace (staty itemů žijí v kódu; vlastněné kusy referencují `itemId`).
- HP pooly i AC/attack/DC nahé postavy klesly na D&D škálu (záměr).
- **Martialové** vyladěni (geared on-level boss 5–8 úderů, win ~90–100 % s ~45–62 %
  HP; naked riskantní).
- **Casteři dočasně neviable na high-level bossech**: jejich leveled kouzla i
  cantripy běží na literal D&D kostkách (Fire Bolt 1d10, Fireball 8d6) hluboko pod
  martial `attackPower`, cantripy navíc neškálují s levelem. Po odstranění HP
  crutche (growth) nestihnou bosse umlátit. Náprava = milník **„Fix kouzla
  nesedící na D&D"** (cantrip scaling D&D 1→2→3→4 + sustained leveled kouzel).
  Gear / base / enemy čísla z tohoto passu zůstávají.
