# AFK to 60 — roadmapa (idle RPG, D&D)

> **Single source of truth** roadmapy. Po každém milníku se aktualizuje.
> Aktivní fáze = **MR (D&D Remaster)**. Hotová WoW-éra (M0–M14) je kondenzovaná v
> archivu dole. Detailní specy systémů žijí v `docs/systems/*`, rozhodnutí v `docs/adr/*`.
>
> **Dev & Admin panel:** `/dev` (viz `docs/systems/dev-panel.md`) — každý nový systém přidá dev/mod akce.

## Co to je

Webová **idle RPG hra inspirovaná Dungeons & Dragons** (BG3 tam, kde je D&D 5e pro idle příliš složité). Převážně **textová** + pixel art, **PWA** s push notifikacemi, běží na vlastním Dockeru. **Singleplayer-first** s MP prvky (Arény = PVP, Dungeony = SP/group PVE, Raidy = MP PVE). Vícesezónní projekt, implementovaný inkrementálně.

| Aspekt          | Rozhodnutí                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| Žánr            | Idle / incremental RPG s D&D-style progresí (lvl 1–20)                                                        |
| Smyčka          | Pošli postavu na aktivitu → běží na pozadí v reálném čase → vrať se, vyber odměny, přehoď gear/spelly → další |
| Interakce       | „Set & forget" aktivity (hodiny) + krátká aktivní sezení (~10 min: gear, spell sloty, rotace, AH)             |
| Offline progres | Server-authoritative lazy dopočet (deterministický, seedovaný RNG → anti-cheat)                              |
| Estetika        | Tmavé fantasy UI, převážně text + tabulky, procedurální pixel art (portréty/itemy/zóny)                      |

## Klíčová rozhodnutí PM (závazná, průřezová)

1. **Vývoj řízený AI — agent-first kódová báze.** Implementaci dělají AI agenti, PM řídí a schvaluje. Báze musí umožnit, aby do ní kdykoli „vskočil" nový agent s minimem kontextu a bezpečně pracoval (tvrdý požadavek).
2. **Škálovatelnost od základu.** Stateless API, stav výhradně v Postgres/Redis, žádný in-memory stav vázaný na proces. Simulace/fronty (BullMQ)/WebSocket (Redis pub/sub adaptér) navržené na víc instancí.
3. **Přechod na D&D / BG3** — viz aktivní fáze **MR**. Level cap **20**, **homebrew** D&D setting, **PHB** rasy, **1 subclass/třída** v MVP.
4. **Frakce odstraněny** — Aliance/Horda kompletně pryč (MR). Případné D&D lore frakce (Harpers, Zhentarim…) jen kosmetické.
5. **Monetizace later, připravená teď.** Kosmetická vrstva (skiny) od začátku **oddělená od statů** (vlastní entita/ownership, nikdy nedává power) → pozdější prodej skinů bez refaktoru jádra.
6. **Jazyk hry = angličtina** (veškerý herní obsah/UI). Dokumentace + komentáře česky. UI stringy oddělené od logiky (pozdější i18n).
7. **Guilda přístupná od lvl 1.**

## Technologický stack

Full-stack **TypeScript monorepo** (jeden jazyk pro BE/FE/sdílené vzorce — combat/itemy/balanc musí být identické na obou stranách).

| Vrstva                  | Volba                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Monorepo                | **pnpm workspaces + Turborepo** (`packages/shared` = jediný zdroj typů/vzorců/konstant)  |
| Backend                 | **NestJS** (Fastify), TS — každý herní systém = vlastní modul                            |
| Databáze                | **PostgreSQL** + **Drizzle ORM** (auto-migrace při startu, NAS-friendly)                 |
| Cache / realtime / fronty | **Redis** — cache, pub/sub (WS fan-out), **BullMQ** fronty, sorted-sets (leaderboardy) |
| Realtime                | **WebSocket** (Socket.IO + Redis adaptér, multi-instance)                                |
| Frontend                | **SvelteKit** + **TailwindCSS** (PWA)                                                     |
| Pixel grafika           | **PixiJS** (scénky/animace) + 2D-canvas sprite vrstva (avatary/ikony) — procedurální     |
| PWA + notifikace        | `vite-plugin-pwa` (service worker) + **Web Push** (VAPID)                                 |
| Auth                    | JWT (access + refresh)                                                                    |
| Deploy                  | **docker-compose** (api/web/postgres/redis/Caddy HTTPS) → CI → GHCR → Watchtower (ADR 0004) |

## Idle & real-time model (jádro)

Server-authoritative, **lazy + tick hybrid**, vše deterministické (seedovaný `SeededRng`):

1. Aktivita má `start_at` + parametry; průběh se **lazy dopočítá** při čtení/přihlášení (offline progres bez stálé zátěže).
2. **BullMQ** scheduled jobs pro okamžiky, co musí „nastat" i bez hráče (dokončení → push notifikace).
3. **Tick/WS** jen pro živé události (probíhající dungeon/raid/arena boj, chat) přes Redis pub/sub.
4. **Matchmaking** (Arény/Raidy): fronta v Redisu se snapshotem profilu → spárování i s offline soupeřem → deterministická simulace.

## Cílové herní systémy (D&D — stav po MR)

- **Rasy** (PHB): Human, Elf, Dwarf, Halfling, Gnome, Half-Elf, Half-Orc, Tiefling, Dragonborn — rasové schopnosti + atributové bonusy (+2/+1).
- **Classy & subclassy** (12 D&D tříd): Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard. Resource (spell sloty / Rage / Ki…), abilit kit, subclass na příslušném levelu.
- **Leveling 1–20**, D&D XP křivka přizpůsobená idle long-haul tempu (lvl 1 za den, max za 3–5 měsíců).
- **Level-up odměny**: ASI (+2 / +1+1) / Feat / subclass / nové spell sloty (místo talent stromů).
- **Spell systém**: tiered spell sloty (1.–9. dle D&D tabulky), spell listy per třída, kouzla s reálnými efekty (damage dice, saving throw, conditions). Long Rest = full recharge.
- **Staty**: 6 atributů (STR/DEX/CON/INT/WIS/CHA) + odvozené (AC, HP, saving throws, initiative, spell save DC, attack bonus).
- **Combat**: turn-based dice roll — d20 vs AC (hit/miss), damage dice, saving throws, initiative. Idle auto-resolve (hráč nastavuje jen rotaci/priority).
- **Gear**: sloty, rarita common→legendary, soulbound/BoP, D&D enchanty. **Kosmetika** oddělená od statů.
- **Backstory**: D&D Background (skill proficiencies + lore), **veřejně** na profilu.
- **PVE**: Dungeony (SP/group), Raidy (MP, role T/H/DPS, flex 5/10/20). **PVP**: Arény (rated, žebříčky). Content gating dle levelu + quest attunement.
- **Filler**: Gone Questing, Profese (gather/craft), denní/týdenní cíle, **The Gauntlet** (aktivní minihra).
- **Ekonomika**: Auction House, vendoři, P2P trade, banka, mail (přílohy).
- **Sociální**: guilda (od lvl 1), friends, chat, whisper, mail. **Žádné frakce.**

## Architektura & agent-first

```
apps/api   NestJS backend (moduly = herní systémy)   apps/web   SvelteKit (PWA)
packages/shared   sdílené typy, vzorce, konstanty (jediný zdroj pravdy)
docs/   ROADMAP.md · adr/ (rozhodnutí) · systems/ (specy)
```

- **Sdílená pravda jen v `packages/shared`** (žádné duplikované vzorce/konstanty). Náhoda jen přes `SeededRng`.
- **Každý herní systém = NestJS modul** (`controller / service / repository / dto / events`). Přísný TS, ESLint+Prettier, CI brání mergi při červené.
- **Testy jako kontrakt**: unit testy vzorců v `shared`, integrační testy API modulů (pglite, bez Dockeru).
- **Malé vertikální přírůstky**: každý PR samostatně spustitelný a recenzovatelný. Velká rozhodnutí → ADR.

---

# Aktivní fáze — MR (D&D Remaster) 🚧

> Přechod hry z WoW-inspirace na D&D 5e / BG3. Největší architektonický zásah od startu, realizovaný inkrementálně. Cílový stav = sekce „Cílové herní systémy" výše.

## Hotovo

- [x] **MR-1 — D&D staty (STR/DEX/CON/INT/WIS/CHA + AC)** ✅ — WoW staty nahrazeny 6 D&D atributy s modifikátory (`floor((score-10)/2)`), proficiency bonus, odvozené staty dle D&D (AC, saving throws, spell save DC, spell attack, initiative, attack bonus). `spellcastingAbility` per třída. _Magnitudy skóre zatím ad-hoc (balanc = MR-10)._
- [x] **MR-2 (+MR-6) — 12 D&D tříd + subclassy + level-up systém** ✅ — 12 tříd (`data/classes.ts`) s `primaryStat`/`spellcastingAbility`/`resource`/`hitDie` + 1 subclass v MVP. **Talent stromy zrušeny** → D&D **ASI/Feat** na levelech 4/8/12/16/19 + subclass volba (`levelup.ts`, `data/feats.ts`, migrace `0035`). Abilit kit `resolveAbilities`. `LevelUpModule` + web `/levelup`. Race-class matice bez omezení.
- [x] **MR-3 — tvorba postavy + backstory** ✅ — 12 D&D **Backgrounds** (`data/backgrounds.ts`), **standard array** (15/14/13/12/10/8 → `base_scores`), veřejná **backstory** na profilu. Migrace `0036`, web `/characters/new` (array + background picker). _Point-buy = follow-up._
- [x] **MR-4 — spell systém + tiered spell sloty** ✅ — D&D slotová tabulka 1.–9. tier per třída/level (`data/spell-slots.ts`), typy sesilatelů full/half/pact/none, **spellbook** (`spellTier` na abilitách). Idle spotřeba aktivitou + **Long Rest = full recharge při claimu** (`characters.spent_spell_slots`, migrace `0037`). `SpellModule` + web `/spells`. **ADR 0029**, `systems/spells.md`.
- [x] **MR-5 — dice-roll combat** ✅ — d20 + attackBonus vs AC (hit/miss/crit), damage dice, saving throws, initiative. Sdílená primitiva `dice.ts` + `dnd-combat.ts`, jádro `rollHit`/`computeHit`/`resolveAttack` v `combat.ts`. **Increment 1** quest combat (+ spotřeba spell slotů z MR-4), **increment 2** sjednocení **všech** simulátorů (dungeon/raid/PVP/aréna/Gauntlet) na jeden model. Nepřátelé: AC/attackBonus z úrovně obsahu. **ADR 0030**, `systems/dnd-combat.md`. _Combat balanc (čísla) = MR-10._

## Zbývá (seskupeno; pořadí mezi clustery = doladit s PM)

- [x] **Rasy, frakce & homebrew lore** ✅ _(slučuje MR-8 + MR-9 + PHB rasy — „odWoWčení" světa; celý cluster hotový)_:
  - [x] **PHB rasy** ✅ — WoW sada (8 ras) nahrazena **9 D&D PHB rasami** (Human, Elf, Dwarf, Halfling, Gnome, Half-Elf, Half-Orc, Tiefling, Dragonborn) s narovnanými atributovými bonusy **+2/+1** a **rasovými schopnostmi** (`RaceTrait[]`, popisné — mechanická integrace do combatu = follow-up, čísla = MR-10). Data migrace `0039` přemapuje staré race id (nightelf→elf, orc→half_orc, tauren→dragonborn, troll→half_elf, undead→tiefling). UI: race picker ukazuje popis/bonusy/traits, karta postavy sekci „traits". Pixel-art `RACE_LOOK` rekeyed na nové rasy.
  - [x] **Odstranění frakcí** ✅ — `Faction` (Alliance/Horda) smazán z `@game/shared` (races/zones/quests/character), z DB (`characters.faction` drop, migrace `0038`), API views (character/inspect/social/guild/dev) i webu (frakční badge/emblém/portrétové pozadí/backdrop nahrazeny neutrálními). Všech **8 zón sjednoceno na jeden neutrální leveling track** (paralelní A/H questline teď vidí každá postava, gating jen levelem/prereqy). Reputační frakce (`FactionId`: Miners'/Herbalist/Explorers) zůstávají. Lore názvy (Northshire/Durotar…) se narovnají v „Lore přejmenování".
  - [x] **Lore přejmenování** ✅ — WoW lore (zóny/NPC/dungeony/raidy/frakce/tvorové) přejmenováno na homebrew setting **„The Caldmoor Reaches"** (`docs/systems/setting.md`). Engine/`id`/mechaniky/balanc beze změny — jen `name`/`description`/questové narativy (~590 řádků přes zones/dungeons/raids/quests/grind). Aplikováno `scripts/lore-rename.py` (uspořádaná převodní mapa). Generické D&D tvory ponechány. Příklady: Northshire→Dawnhollow Vale, Molten Core→Cinderforge Depths, Ragnaros→Ignaroth, Defias→Ashen Hand, Scourge→Pale Legion, fel→blight.
- [x] **MR-7 — D&D bestiář + CR** ✅ — enemy katalog `data/enemies.ts` (14 creature typů, unikátní ability) + čistá vrstva `data/damage.ts`: **13 damage typů**, **resistance/vulnerability/immunity** math (×0.5/×2/×0, immunity > zbytek), kompletní **Challenge Rating** tabulka 0–30 (CR → AC/HP/attack/damage/save DC/proficiency/XP, DMG). Napojeno do sdíleného jádra `rollHit` → typové poškození + obrany **živé ve všech 6 simulátorech** bez změny call-sites; `computeHit`/`resolveAttack` umí `damageType` override (ability-typed dmg), `buildDndAttackMessage` přidá `(resisted)`/`(vulnerable!)`/`(immune)`. Builder `buildBestiaryEnemy` ze CR doporučení. Bez rebalancu existujícího obsahu (přemapování + D&D damage dice = MR-10). **ADR 0031**, `systems/bestiary.md`. _Hráčské útoky zatím fyzické (per-zbraň typ = MR-10)._
- [x] **MR-10 — Balance pass (převzetí D&D čísel)** ✅ _(rozhodnutí PM: až nakonec; krájeno na slice)_ — místo vlastních čísel převzít D&D 5e: **damage dice per zbraň/kouzlo** (1d8+STR, 8d6 Fireball), **CR-based** AC/HP/damage/XP, spell slot economy, rasové bonusy, recalibrace Elo/wipe/loot drop rate. Sem spadají všechny dosud odložené „balanc = MR-10" položky.
  - [x] **MR-10a — CR-based enemy AC/attackBonus/save DC** ✅ — ad-hoc `~level*0.55` placeholdery nahrazeny **D&D Challenge Ratingem**. `crForContentLevel(level, isBoss)` (`data/damage.ts`) mapuje úroveň obsahu 1–20 na CR (trash = CR level, boss +2; clamp 0–30 i pro Gauntlet vlny nad cap), `crStatGuide` (DMG tabulka) z toho dá AC/attackBonus/save DC. Sjednoceno přes `buildEnemyActor` (combat.ts) i `questFoeStats` (quest-run.ts) → živé ve všech 6 simulátorech. Nový `EnemyStats.challengeRating` (explicitní přepis). HP/poškození (idle pacing) i XP zatím autorská data. `systems/dnd-combat.md`.
  - [x] **MR-10b — per-class weapon dice + typové útoky** ✅ — damage dice dostaly **per-class tvar** (`ClassDef.attackDie` → `CombatActor.attackDie` → `weaponDamageSpec`): Barbarian d12, martial d8, d6 (Rogue/Monk/Cleric/Druid), caster d10; nepřátelé default d6. **Magnitudu drží `attackPower`** (balanc-neutrální, mění se variance + log notace). Hráčské útoky dostaly **typ poškození** (`attackDamageType`): martial fyzické, casteři signature element (fire/force/radiant) → MR-7 resistance/vulnerability/immunity je živá i pro hráče (pro existující obsah inertní — nepřátelé nemají obrany, aktivuje se s bestiářem). `systems/dnd-combat.md`.
  - [x] **MR-10c — loot rarity-driven + arena rescale** ✅ — drop rate srovnán s capem 20 a **odvozen z rarity itemu** (`RARITY_DROP_WEIGHT` v `loot.ts`: common 1 → legendary 0.05) místo ad-hoc čísel per záznam; `anyDropChance` per tabulka (štědrost/pacing) beze změny → legendary „chase" drop vyplyne z rarity. Zastaralé WoW level-range pásma (1–10/…/40–60) opravena na 1–4/4–9/9–14/14–20. `ARENA_MIN_LEVEL` **10 → 3** (nepřeškálováno z MR-11; PVP přístupné brzy). Elo (start 1500, K 32, tiery) i wipe konstanty (−5 %/wipe, floor 0.75/0.3) ponechány — standardní/laděné, bez D&D kotvy.
  - [x] **MR-10d — per-ability typy + typovaný late-game obsah** ✅ — **per-ability damage typy** (`SignatureAbility.damageType`) → caster už není type-locked (Magic Missile = force, Fireball = fire, Moonbeam = radiant, Hex = necrotic…); martial techniky dědí typ zbraně. Engine bere `ability.damageType ?? attacker.damageType` na přímém zásahu (quest/raid/gauntlet/PVP) **i na DoT tikách** (respektují obrany cíle). **Late-game dungeony+raidy (14–20)** dostaly thematické typové obrany (MR-7): Pyrehold undead → vuln radiant (Cleric/Paladin dominují), Maradoth nature → resist physical + vuln fire („bring a caster"), Cinderdeep/Cinderforge fire → resist fire, Flamelord **immune fire** (fér díky off-element kouzlům) → class-counter dynamika + aktivace typového systému v obsahu. Magnitudy nedotčené. `systems/dnd-combat.md`.
  - [x] **MR-10e — literal D&D magnitudy (HP/damage + per-spell dice & saving throwy)** ✅ — poslední, záměrně odložený kus MR-10 (rozhodnutí PM: **plný literal model**). **HP** = D&D hit dice (`dndMaxHp`: hitDie + (level−1)·(avg+CON mod)) u hráče, **CR `hitPoints`** u nepřátel; **nepřátelské poškození** = CR `damagePerRound` × idle 1v1 faktor (`crEnemyMagnitude`); **hráčův útok** = počet útoků/kostek dle levelu (Extra Attack / cantrip scaling). **Kouzla = literal dice** (`SignatureAbility.dice`: Fireball 8d6, Magic Missile 3d4+3 auto-hit, Guiding Bolt 4d6…) **nezávisle na attackPower** + **upcast** (`dicePerSlotAbove`) + **per-spell saving throwy** (`SignatureAbility.save`: DEX-half Fireball, WIS-negate Vicious Mockery…) přes sdílený `applySpellSave` ve všech simulátorech. `attackPower`/`maxHealth` zůstávají serializované nosiče magnitudy (sim-knoby), jen re-derived z D&D. Dungeon/raid data převedena na CR-odvození (idle-scale čísla pryč). **ADR 0032**. _Follow-up tuning: gear stat škála (attack_power/spell_power) vůči nové magnitudě + finální `ENEMY_DPR_TO_SWING`._
- [x] **MR-11 — Level cap 20 + XP křivka** ✅ — `MAX_LEVEL` **60 → 20** (D&D cap). XP křivka překalibrována (`XP_CURVE.scale` 120,8 → **1966,2**, odvozeno `TARGET_HOURS_TO_CAP·600/Σ_{1..19} L^1.5`) → stejné cílové okno **~2200 h perfect-chain (3–5 měsíců)** rozložené do 20 levelů: lvl 1→2 ≈ 3,3 h („level za den"), tvar `time(L) ∝ L^1.5` (pásmo 15–20 ≈ 52 %). **Gating obsahu lineárně přeškálován 1–60 → 1–20** (mapping 1→1, 60→20): questy (`requiredLevel` + přepočet `baseXp`/`baseGold` na referenční rychlost), dungeony/raidy (`requiredLevel`/`recommendedLevel`/attunement), zóny (`min/maxLevel`), mounty, achievementy, faction-rep clamp → hra zůstává **plně hratelná end-to-end** na novém capu. Combat/CR čísla nedotčena (= MR-10). Skript `scripts/rescale-levels-mr11.py`, **ADR/`docs/systems/progression.md`** aktualizováno.
- [ ] **Onboarding / tutoriál** _(byl M11, odloženo)_ — provedení idle smyčkou, redesignované po D&D char creation (rasa/class/background/spell sloty).

> 🔜 **Handoff:** hotovo **MR-1 → MR-7**, **celý cluster deWoWčení** (frakce ✅, PHB rasy ✅, lore „The Caldmoor Reaches" ✅) a **MR-11 — Level cap 20 + XP křivka** ✅ (cap 20, překalibrovaná křivka, obsah přeškálován do 1–20, hra plně hratelná). Combat má D&D dice-roll (MR-5) + bestiář/CR/typové poškození (MR-7). **MR-10 hotové (celý balance pass):** ✅ **MR-10a** (CR-based enemy AC/attackBonus/save DC) + ✅ **MR-10b** (per-class weapon dice + typové útoky) + ✅ **MR-10c** (loot rarity-driven + arena rescale) + ✅ **MR-10d** (per-ability typy + typovaný late-game obsah) + ✅ **MR-10e** (literal D&D magnitudy HP/damage + per-spell dice & saving throwy, ADR 0032). **Zbývá:** **Onboarding/tutoriál** (redesign po D&D char creation) + drobný balanc follow-up (gear stat škála vůči nové D&D magnitudě, finální `ENEMY_DPR_TO_SWING`).

---

# Backlog — post-Remaster fáze (rozhodnutí PM, priorita k doladění)

> Zachycené záměry po dokončení MR (D&D Remaster). Pořadí/krájení na slice se doladí
> s PM. Explicitní rozhodnutí = checkbox; otevřené otázky = **❓ k rozhodnutí**.
> Velká rozhodnutí (vyříznutí raidů, dungeon overhaul, scrap mana, monetizace) → ADR.

## Combat & obsah — overhaul

- [ ] **Raidy úplně vyříznout** — odstranit raid systém (kód `raid.ts`/služby, data `data/raids.ts`, UI, weekly lockout vázaný na raidy, attunement questy jen-pro-raid). Rozhodnout osud raid lootu/achievementů (přemapovat na dungeony, nebo retire). ADR.
- [ ] **Dungeon overhaul → tahové, 3 velikosti** (nahrazuje idle auto-resolve group PVE run interaktivním tahovým bojem — navázat na tahový engine Gauntletu):
  - [ ] **Solo** — tahové.
  - [ ] **3-player** — ručně složené **nebo autofill s AI**; AI parťáci **mimikují hráče** (rotace/role/spell sloty), tahové.
  - [ ] **5-player** — **pouze ručně složené**, tahové.
- [ ] **Gauntlet — overhaul bonusů** (draft odměn): lepší balanc + větší diverzifikace nabízených buffů/směrů.
- [ ] **Arény (PVP) — zatím out of order** — pozastavit, než se rozhodne, co s nimi (směr/formát). ADR až s rozhodnutím.

## Spell sloty & resource

- [ ] **Spell sloty všude** — zavést D&D spell sloty do všech bojových režimů (dungeony/Gauntlet/…); **scrap mana** = odstranit zjednodušený `ResourceType` (mana/energy/rage proxy), sjednotit na D&D spell sloty (+ class resources Rage/Ki/Pact Magic). ADR.
- [ ] **Fix kouzla nesedící na D&D** — narovnat ability, které neodpovídají D&D mechanice (např. **Hunter's Mark** = momentálně jen weapon strike; v D&D je to concentration buff +1d6 na zásah). Audit celého katalogu `abilities.ts` proti D&D 5e.
- [ ] **Kniha kouzel — hráč si volí aktivní spelly** — místo fixního kitu (`resolveAbilities` = class+subclass+level) si hráč **vybere aktivní kouzla**, která má v boji k dispozici. Pool nabídky = **+- všechna kouzla, ke kterým by měl v D&D přístup** (spell list dané classy do jeho úrovně). Navazuje na rotaci (`CharacterRotation`) a spell sloty.
  - **❓ k rozhodnutí — model Wizarda.** V D&D má wizard **spellbook** (učí se kouzla → velký „known" pool, z něj denně **připravuje** podmnožinu), ostatní classy mají „known spells". Vymyslet, jak to namodelovat: učení kouzel wizardem (level-up + scrolls/scribování?), prepared vs known, a sjednocení s ostatními classami.
  - **❓ k rozhodnutí — omezení přehazování.** Swap aktivních kouzel bude **omezený** — kandidáti: **gold cost** za přehození, nebo vázané na Long Rest / downtime / level-up. Vybrat mechaniku (gold sink vs. časové gate).

## Enemy systém

- [ ] **Refactor enemy** — datový model nepřátel (sjednotit `data/enemies.ts` / dungeon / quest foe → jeden zdroj pravdy s CR, typy, schopnostmi).
- [ ] **Enemy schopnosti** — aktivní abilities nepřátel (ne jen boss `damageMult`/special): typované útoky, conditiony, saving-throw efekty proti hráči.
- [ ] **Bestiář pro hráče** — in-game encyklopedie nepřátel (navázat na MR-7 `data/enemies.ts` + CR + typové obrany): odemykání po setkání, lore, staty/odolnosti.

## Ekonomika & gear

- [ ] **Recheck gear** — revize gear systému a stat škály vůči nové D&D magnitudě (navazuje na MR-10e follow-up: `attack_power`/`spell_power` vs literal dice).
- [ ] **Revize gold systému — balance** — zdroje/sinky zlata, inflace, ceny.
- [ ] **Banka: poplatek za vklad/výběr** — uložení i vytažení věcí z banky stojí gold → navádí hráče banku tolik nevyužívat (gold sink + design tlak).

## Platforma & distribuce

- [ ] **Refactor UI pro mobily** — responsivní / mobile-first přepracování (hra je PWA, primárně mobilní idle).
- [ ] **Wrapper PWA → APK** (TWA / Capacitor — rozhodnout) a **release na Google Play**.

## Monetizace

- [ ] **Vymyslet a přidat monetizaci** — kosmetická vrstva (skiny/tituly) je oddělená od statů od M0 (ADR 0003); rozhodnout model (skiny, battle-pass, …) a implementovat. ADR.

## Auth

- [ ] **Email auth** — registrace/login přes e-mail s potvrzením (rozšiřuje stávající průřezový auth follow-up níže).

## RP / D&D / BG3 prvky

- [ ] **Víc RP prvků** — vymyslet a přidat (rozšířit backstory/Background dopady, charakterové volby, …).
- **❓ k rozhodnutí — idle gameplay mimo questing?** Když jsou dungeony tahové (interaktivní), zůstane questing hlavní idle smyčkou. Rozhodnout, zda/jak zachovat **idle progres i mimo questing** (idle profese? idle „expedice"? offline dopočet i u tahových režimů?).
- **❓ k rozhodnutí — revize guild systému?** Posoudit, zda guildy potřebují přepracování (po vyříznutí raidů ztrácí část MP účelu — guild aktivity/perky/cíle?).
- **❓ k rozhodnutí — další RP / D&D / BG3 prvky?** Brainstorm k výběru: conditions (prone/stunned/frightened…), Inspiration, Short/Long Rest mechanika napříč obsahem, downtime aktivity, dialogové volby s skill checky (DC + atribut), companions/origin postavy (BG3), alignment, reaction/concentration, environmentální interakce.

---



> Kompletní hratelná WoW-inspirovaná hra. MR ji postupně přepisuje na D&D — proto kondenzováno (detaily v odkazovaných ADR/systems). Pixel-art, sociální vrstva, ekonomika, idle/combat infra a content infra z těchto milníků **zůstávají**; mění se theming (rasy/lore/frakce), staty, classy, spelly a combat čísla.

| Milník | Co přineslo | Reference |
| ------ | ----------- | --------- |
| **M0** | Monorepo (pnpm+turbo), strict TS, docker-compose (api/web/postgres/redis/Caddy), NestJS+SvelteKit skeleton, healthcheck, Drizzle+Redis, CI, agent-first základ, deploy CI→GHCR→Watchtower | ADR 0001–0004, DEPLOY.md |
| **M1** | Účty (JWT auth) + postava (8 ras / 9 class WoW), DB accounts+characters, auto-migrace | ADR 0005, systems/character.md |
| **M2** | Leveling & jádro idle smyčky — activity model, Questing v1, deterministický dopočet odměn, BullMQ delayed job, lazy claim | ADR 0006, systems/questing.md |
| **M3** | PWA push notifikace (VAPID) + offline progres souhrn, injectManifest service worker | ADR 0007 |
| **M4** | Gear/inventář/equipment, deterministický loot, talent stromy (později zrušeny v MR-2), kosmetické skiny | systems/items.md |
| **M5** | Combat engine (`deriveCombatProfile`/`computeHit`) + 4 dungeony (idle aktivita, živý combat log, boss loot) | ADR 0008, systems/combat-dungeons.md |
| **M6** | Profese — 2 gathering + 2 crafting (skill 1–150), reputace se 3 frakcemi, rep-gated recepty | ADR 0009, systems/professions-reputation.md |
| **M7** | Multiplayer infra + Arény (PVP) — Redis matchmaking, deterministický 1v1, Elo + sezónní ladder, **první WebSocket realtime** (Socket.IO + Redis adaptér) | ADR 0010, systems/arenas-pvp.md |
| **M8** | Raidy (flex 5/10/20, role T/H/DPS, 2 raidy × 3 bossy, attunement) + Auction House (buyout+bidding, deposit, 5 % cut) | ADR 0011/0012, systems/raids.md, auction-house.md |
| **M8.5** | Iterativní wipe/retry combat (determination), sjednocený **group PVE run** (dungeon+raid), personal loot, P2P trade, týmové arény (později nahrazeny party) | ADR 0013/0014/0018/0019/0020, systems/groups.md, trade.md |
| **M8.6** | Ekonomika — soulbound/BoP (`bindType`), weekly lockout (raidy + vyšší dungeony) | ADR 0015 |
| **M9** | Sociální + polish — Friends, Chat, Whisper, **Mail** (přílohy), **Guild** (+ charter), Achievementy, denní/týdenní cíle, **trvalá skupina (party)**, **UI refresh** (design system), **quest narrative + combat overhaul**, **PixiJS scénky** | ADR 0016/0017/0021/0022/0024, systems/social.md, groups.md |
| **M10** | Mounty (travel speed; power z vlastnictví, vizuál = skin → monetizace) | ADR 0023, systems/mounts.md |
| **M12** | Content expansion — 108 story questů, zóny/dungeony/raidy 1–60 (každá instance s attunement questline), combat-objective questy _(WoW lore → přejmenování v MR)_ | systems/combat-dungeons.md, raids.md |
| **M13** | **The Gauntlet** — aktivní tahová roguelite survival minihra (draft odměn, denní strop, server-authoritative) | ADR 0028, systems/gauntlet.md |
| **M14** | Procedurální **pixel-art vrstva** všude — avatary/emblémy, spell/item ikony, pozadí karet/stránek, animace, profil showcase, mounty | ADR 0027, systems/ui-art-assets.md |

---

# Průřezové follow-upy (přežívají theming)

Tech/infra dluhy nezávislé na D&D refaktoru, k dořešení průběžně:

- [ ] **Auth**: httpOnly cookie místo localStorage + refresh rotace/revokace (ADR 0005); email login (potvrzení).
- [ ] **WS realtime** tam, kde je teď REST polling (watch týmových arén, trade okno, lobby pozvánky).
- [ ] **Push**: per-postavová granularita; `docker compose up` ověřit s běžícím daemonem.
- [ ] **Trade-window** pro BoP loot (závisí na MR item redesignu).
- [ ] **Monetizace**: skiny, kosmetické tituly — připraveno od M0, implementace later.

---

# Verifikace

Na konci každého milníku:

- **Build/test/lint/typecheck zelené** (CI brání mergi).
- **Per-fáze**: ruční end-to-end průchod novou smyčkou + unit testy vzorců v `packages/shared` + integrační testy API modulu (pglite).
- **M0+ smoke**: `docker compose up` → app naběhne, healthcheck zelený, PWA instalovatelná.
- Po dokončení: commit + push na **vývojovou větev `main`** + aktualizace tohoto plánu.
  - ℹ️ **Jediné místo, kde je vývojová větev uvedena** — pro změnu cíle pushů uprav jen tento řádek.
