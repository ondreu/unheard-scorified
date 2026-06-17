# ADR 0028 — The Gauntlet: aktivní tahová minihra (M13)

Status: Accepted · Datum: 2026-06-17

## Kontext

M13 zavádí **aktivní vrstvu** pro chvíle, kdy hráč CHCE hrát rukama (čekárna,
MHD, fronta) — protiklad k „set & forget" idle jádru. Roadmapa žádá: krátká
sezení, ovladatelnost jednou rukou na telefonu, offline-friendly (PWA),
**determinismus & anti-cheat**, drobné odměny s denním stropem (ne povinný grind,
ne pay-to-win).

PM zvolil koncept jako **mix aktivního combatu a roguelite draftu**: hráč vejde se
svou reálnou postavou (gear/talenty/spelly), kolo po kole volí, jakou ability
použít proti vlnám nepřátel, a po každé vlně si vybere jednu ze tří odměn (buff /
kus gearu s porovnáním / nový spell). Run končí smrtí nebo dosažením stropu vln.

Dvě klíčová rozhodnutí PM:

- **Boj = tahový (turn-based)**, ne real-time. Sedí na server-authoritative
  deterministický model projektu (klient posílá jen volbu, server dopočítá vše),
  je phone-friendly a anti-cheat je triviální.
- **Odměny = drobné herní** (gold + XP + materiály) s **denním stropem**. Žádný
  BoP gear (nenahrazuje dungeony/raidy), idle jádro zůstává hlavní progrese.

## Rozhodnutí

### Engine (`packages/shared/src/gauntlet.ts`) — čistý a deterministický

- Recykluje sdílené bojové vzorce (`computeHit`, `abilityDamageMult`,
  `applyAbsorb`, `buildAttackMessage`) → **žádná duplikace combat logiky**.
- Seed **per tah** (`seedFromString('<seed>:turn:<wave>:<turn>')`) → výsledek lze
  reprodukovat ze snapshotu profilu + voleb (anti-cheat, jako zbytek hry).
- Tah = (1) DoT tiky na nepříteli, (2) hráčova zvolená ability, (3) protiúder
  nepřítele, (4) údržba cooldownů/mitigace. Cooldowny v **tazích**
  (`cooldownSec / GAUNTLET_TURN_SEC`).
- Nepřátelé se škálují vlnou i levelem; každá 5. vlna je **elite**.
- **Draft picks jsou run-scoped** (drží se v `picks[]`, aplikují se na snapshot →
  efektivní `CombatActor`), nikdy se nepersistují na postavu → **žádný
  power-creep**, čistý anti-cheat. Buff = násobiče, gear = ploché staty (combat
  delta počítaná z reálného itemu), ability = nový spell do kitu pro run.

### Stavový model (na rozdíl od idle auto-resolve)

Idle obsah (dungeony/raidy) je „jedna simulace + reveal podle času". Gauntlet je
**stateful interaktivní**: kompletní mutabilní průběh (`GauntletRunState`) se
ukládá jako JSON do `gauntlet_runs.state`. `playerSnapshot` = neměnný bojový
profil ze vstupu. Klient posílá jen `abilityId` / `optionId`; server validuje
(ability v kitu a ready; vlastnictví runu) a dopočítá tah.

### Odměny + denní strop

- Odměna se uděluje **až při ukončení** runu (smrt / retire / dosažení stropu vln),
  škáluje s počtem vyčištěných vln a levelem (`gauntletRunReward`).
- **Denní strop** (`gauntlet_daily`, UTC den) ořízne XP i zlato
  (`capGauntletReward`) → drobná, ne-grindovatelná odměna. Gear draft je jen
  run-scoped (žádný trvalý loot kromě materiálů).

### API modul (`apps/api/src/gauntlet/`)

Standardní feature modul (controller/service/repository). Recykluje
`RotationService.buildCombatProfile` (snapshot profilu vč. rotace),
`InventoryGrantService` (odměny → overflow do pošty) a `HistoryRepository`.
Endpointy: `GET /` (status), `POST /enter`, `GET /run/:id`, `POST /run/:id/act`,
`POST /run/:id/draft`, `POST /run/:id/retire`, `GET /runs`.

### Web

`/characters/[id]/gauntlet` (landing: denní strop, best skóre, historie, Enter/
Resume) + `/characters/[id]/gauntlet/run/[runId]` (HP bary, ability tlačítka,
draft karty s porovnáním gearu, end-screen). Recykluje `CombatLog`,
`PixelAbilityIcon`, `SceneBanner`. Herní texty anglicky, oddělené od logiky.

## Důsledky

- **První stateful interaktivní herní smyčka v projektu** — server drží mutabilní
  stav runu, ne jen reveal. Konzistentní s determinismem (seed per tah).
- Combat engine zůstává jediným zdrojem pravdy bojových vzorců (recyklace, ne
  fork). DoT/heal/shield/mitigation/execute jsou v tahovém enginu podmnožinou
  stejných ability dat.
- DB: migrace `0034` (`gauntlet_runs` + `gauntlet_daily`).
- **Zbývá doladit:** balanc obtížnosti vln a velikosti odměn/stropu (M9-ish pass);
  bohatší nepřátelské chování (vlastní ability, víc nepřátel na vlnu); kosmetické
  odměny/tituly za milníky vln; případný realtime „arcade" režim jako varianta.
