# The Gauntlet (M13) — aktivní tahová minihra

> Detail-spec. Architektura a rozhodnutí: **ADR 0028**. Jazyk hry = angličtina
> (UI/obsah), dokumentace česky.

## Co to je

Volitelná **aktivní** vrstva navrch idle jádra — pro chvíle, kdy hráč CHCE hrát
rukama. Hráč vejde se svou **reálnou postavou** (gear/talenty/spelly), kolo po
kole volí, jakou ability použít proti **vlnám nepřátel**, a po každé vyčištěné
vlně si vybere **jednu ze tří odměn** (draft). Run končí smrtí nebo dosažením
stropu vln. Idle hra zůstává „set & forget"; tohle je bonus.

## Smyčka

1. **Enter** → snapshot bojového profilu postavy (`RotationService.buildCombatProfile`)
   + vlna 1.
2. **Boj (tahový)**: každý tah zvolíš jednu **ready** ability (nebo základní úder).
   Server vyhodnotí: DoT tiky → tvá ability → protiúder nepřítele. Cooldowny běží
   v tazích.
3. **Vyčištění vlny** → **draft**: 3 nabídky (buff / kus gearu s porovnáním vůči
   vybavení / nový spell). Výběr platí **jen pro tenhle run** (roguelite). HP se
   mezi vlnami **nedoplňuje** — léčit jde jen heal spellem (viz fall-off níže).
4. Další vlna je silnější (každá 5. je **elite**), staty nepřátel rostou
   **exponenciálně**. Opakuj, dokud nepadneš nebo nedosáhneš stropu vln.
5. **Konec** (smrt / retire / strop) → odměna škálovaná počtem vyčištěných vln,
   omezená **denním stropem**.

## Léčení & fall-off (anti heal+DoT spam)

- **HP se mezi vlnami NEregeneruje automaticky** — co utržíš, to si neseš dál.
- **Léčit jde jen heal *spelly*** (heal-kind ability, např. Holy Light). Heal
  draft karty zatím nejsou (rozhodnutí PM; engine je podporuje pro pozdější přidání).
- **Globální fall-off léčení**: každé použité léčení v runu zlevní další
  (`healFalloff(healsUsed) = 0.65 ** healsUsed` — 1. plné, pak ~65 %, ~42 %, …).
  Sdílený čítač `healsUsed` přes celý run → **nejde spamovat heal**, čímž padá i
  „nalep DoT a léč se donekonečna" stall strategie. Heal je na kritické momenty,
  ne na přežívání.
- Sustain bez heal spellu: **lifesteal** (talenty, `Vampiric Aura` draft) a
  **drain** ability (heal z uděleného poškození) — tyto fall-offu nepodléhají
  (jsou vázané na dealnutí dmg, samoregulační).

## Determinismus & anti-cheat

- Vše server-authoritative: klient posílá jen volbu (`abilityId` / `optionId`),
  server validuje (ability v kitu a ready, vlastnictví runu) a dopočítá tah.
- Náhoda jen přes `SeededRng`; **seed per tah** → výsledek reprodukovatelný ze
  snapshotu + voleb.
- Draft odměny jsou **run-scoped** (nepersistují se na postavu) → žádný power-creep.

## Odměny

- Drobné herní: **XP + zlato + materiály**, škálují s počtem vyčištěných vln a
  levelem (`gauntletRunReward`). Žádný BoP gear → nenahrazuje dungeony/raidy.
- **Denní strop** (`gauntletDailyXpCap` / `gauntletDailyGoldCap`, UTC den,
  tabulka `gauntlet_daily`) → anti-grind. Po vyčerpání stropu run nedá XP/zlato.

## Kód

- **Shared engine** (`packages/shared/src/gauntlet.ts`): typy stavu
  (`GauntletRunState`, …), `startGauntletRun`, `resolveGauntletTurn`,
  `rollGauntletDraft` / `applyGauntletDraft`, `buildGauntletEnemy`,
  `gauntletRunReward` / `capGauntletReward`. Recykluje `combat.ts`
  (`computeHit`, `abilityDamageMult`, `applyAbsorb`, `buildAttackMessage`).
- **API** (`apps/api/src/gauntlet/`): `GauntletModule` (controller/service/
  repository). Endpointy pod `characters/:characterId/gauntlet`:
  - `GET /` — status (aktivní run, best skóre, denní strop).
  - `POST /enter` — založí run.
  - `GET /run/:runId` — stav runu.
  - `POST /run/:runId/act` `{ abilityId }` — jeden tah.
  - `POST /run/:runId/draft` `{ optionId }` — výběr odměny.
  - `POST /run/:runId/retire` — předčasné ukončení (zinkasuje odměnu).
  - `GET /runs` — nedávné runy.
- **DB**: `gauntlet_runs` (stateful run + snapshot + odměna) + `gauntlet_daily`
  (denní strop). Migrace `0034`.
- **Web**: `/characters/[id]/gauntlet` (landing) + `/.../gauntlet/run/[runId]`
  (interaktivní run). Recykluje `CombatLog`, `PixelAbilityIcon`, `SceneBanner`.

## Testy

- Shared `gauntlet.test.ts`: škálování nepřátel, determinismus tahu, lifecycle
  (clear → draft → další vlna), buff/ability draft, odměny + denní strop.
- API `gauntlet.flow.test.ts` (pglite): enter, act → drafting → draft, retire +
  denní strop, ownership, jeden aktivní run, celý run do terminálního stavu.

## Zbývá doladit

- Balanc obtížnosti vln a velikosti odměn/stropu (M9-ish pass).
- Bohatší chování nepřátel (vlastní ability, víc nepřátel na vlnu).
- Kosmetické odměny/tituly za milníky vln (kompatibilní s monetizací).
- Případný realtime „arcade" režim jako varianta tahového boje.
