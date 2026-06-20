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
  - [x] **MR-10e — literal D&D magnitudy (HP/damage + per-spell dice & saving throwy)** ✅ — poslední, záměrně odložený kus MR-10 (rozhodnutí PM: **plný literal model**). **HP** = D&D hit dice (`dndMaxHp`: hitDie + (level−1)·(avg+CON mod)) u hráče, **CR `hitPoints`** u nepřátel; **nepřátelské poškození** = CR `damagePerRound` × idle 1v1 faktor (`crEnemyMagnitude`); **hráčův útok** = počet útoků/kostek dle levelu (Extra Attack / cantrip scaling). **Kouzla = literal dice** (`SignatureAbility.dice`: Fireball 8d6, Magic Missile 3d4+3 auto-hit, Guiding Bolt 4d6…) **nezávisle na attackPower** + **upcast** (`dicePerSlotAbove`) + **per-spell saving throwy** (`SignatureAbility.save`: DEX-half Fireball, WIS-negate Vicious Mockery…) přes sdílený `applySpellSave` ve všech simulátorech. `attackPower`/`maxHealth` zůstávají serializované nosiče magnitudy (sim-knoby), jen re-derived z D&D. Dungeon/raid data převedena na CR-odvození (idle-scale čísla pryč). **ADR 0032**. _Follow-up tuning ✅ dokončen — viz „Recheck gear" níže (ADR 0035): D&D-věrný gear rescale + bounded ability skóre (cap 20, zrušen per-level růst) + finální `ENEMY_DPR_TO_SWING`._
- [x] **MR-11 — Level cap 20 + XP křivka** ✅ — `MAX_LEVEL` **60 → 20** (D&D cap). XP křivka překalibrována (`XP_CURVE.scale` 120,8 → **1966,2**, odvozeno `TARGET_HOURS_TO_CAP·600/Σ_{1..19} L^1.5`) → stejné cílové okno **~2200 h perfect-chain (3–5 měsíců)** rozložené do 20 levelů: lvl 1→2 ≈ 3,3 h („level za den"), tvar `time(L) ∝ L^1.5` (pásmo 15–20 ≈ 52 %). **Gating obsahu lineárně přeškálován 1–60 → 1–20** (mapping 1→1, 60→20): questy (`requiredLevel` + přepočet `baseXp`/`baseGold` na referenční rychlost), dungeony/raidy (`requiredLevel`/`recommendedLevel`/attunement), zóny (`min/maxLevel`), mounty, achievementy, faction-rep clamp → hra zůstává **plně hratelná end-to-end** na novém capu. Combat/CR čísla nedotčena (= MR-10). Skript `scripts/rescale-levels-mr11.py`, **ADR/`docs/systems/progression.md`** aktualizováno.
> 🔜 **Handoff:** hotovo **MR-1 → MR-7**, **celý cluster deWoWčení** (frakce ✅, PHB rasy ✅, lore „The Caldmoor Reaches" ✅) a **MR-11 — Level cap 20 + XP křivka** ✅ (cap 20, překalibrovaná křivka, obsah přeškálován do 1–20, hra plně hratelná). Combat má D&D dice-roll (MR-5) + bestiář/CR/typové poškození (MR-7). **MR-10 hotové (celý balance pass):** ✅ **MR-10a** (CR-based enemy AC/attackBonus/save DC) + ✅ **MR-10b** (per-class weapon dice + typové útoky) + ✅ **MR-10c** (loot rarity-driven + arena rescale) + ✅ **MR-10d** (per-ability typy + typovaný late-game obsah) + ✅ **MR-10e** (literal D&D magnitudy HP/damage + per-spell dice & saving throwy, ADR 0032). **MR-10e follow-up ✅** — D&D-věrný gear rescale + bounded ability skóre (cap 20, zrušen per-level růst) + enemy re-tune (ADR 0035, backlog „Recheck gear"); martialové vyladěni, **casteři odloženi** na „Fix kouzla" (literal spell dice). **Onboarding/tutoriál** přesunut do post-Remaster backlogu (sekce Platforma & distribuce, před Google Play release) — redesign po D&D char creation dává smysl až po dokončení backlog overhaulu.

---

# Backlog — post-Remaster fáze (rozhodnutí PM, priorita k doladění)

> Zachycené záměry po dokončení MR (D&D Remaster). Pořadí/krájení na slice se doladí
> s PM. Explicitní rozhodnutí = checkbox; otevřené otázky = **❓ k rozhodnutí**.
> Velká rozhodnutí (vyříznutí raidů, dungeon overhaul, scrap mana, monetizace) → ADR.

## 🐞 Fixes — rozbité shipnuté featury (priorita)

> Bugy ve featurách, které jsou v roadmapě označené jako **hotové** (hlavně **Level-up
> overhaul**, Slice B/C). Opravit dřív, než se pustí nový backlog níže. Malé související
> opravy řešit společně.

- [x] **Class-feature volby nejdou zvolit (Slice B2)** ✅ — příčina: slot id `cf:<group>#<index>` obsahuje `#`, který prohlížeč ve `fetch` URL strhl jako fragment → API dostalo zkomolené id a vyhodilo „slot not available". Fix: `encodeURIComponent(slotId)` ve `choose()` (web `/levelup`). Eldritch Invocations / Metamagic / Fighting Style se teď ukládají. _(engine/`isValidChoice`/unikátnost byly OK — pouze transport)._
- [x] **Feat & ASI volba: matoucí UX + feat stacking** ✅ — (1) **ASI prefill**: zvolené staty zůstávají vizuálně vybrané (nový `syncAsiPicks()` inicializuje lokální picky z persistovaných voleb po load/choose/reset — dřív se po uložení vyčistily). (2) **Feat dedup napříč sloty**: web zašedne feat zvolený jinde (`featTakenElsewhere`, štítek „Already taken") + API `choose()` odmítne duplicitní feat (mirror class_feature unikátnosti).
- [x] **Improved Cantrips se neprojevuje v combatu** ✅ — engine byl **správně**: `cantripDiceMultiplier` (5/11/17) teče přes `abilityDamageSpec(…, player.level)` do **všech 6 simulátorů** (`level` se propaguje i přes `deriveRaidActor`). Skutečný problém = **zobrazení**: detail ability (`AbilityDetail.svelte`) ukazoval statické `a.dice` (1d8) bez level-scalingu. Fix: detail počítá cantrip dice přes `abilityDamageSpec` z levelu aktivní postavy (nový store `activeCharacterLevel`) → L17 ukáže 4d8, sedí s enginem.

## Combat & obsah — overhaul

- [x] **Raidy úplně vyříznout** ✅ _(ADR 0033)_ — raid systém odstraněn: API (controller/service/gateway/events), data `data/raids.ts`, web UI (routy/nav/group launch/overview/scény), `RAID_LOOT_TABLES`, raid achievementy + metrika `raidClears`, raid větev group launch (`GROUP_ACTIVITY_TYPES` = dungeon/arena). **Minimální řez** (rozhodnutí PM): sdílený group-run **engine** (`simulateRaidRun`, `RaidActor`/role, wipe/retry) + run tabulky (`raid_runs`) + matchmaking fronta **přežívají** pod legacy názvy `raid_*` a obsluhují už jen **dungeony**; `RaidModule` osekán na repo+frontu. **Loot i achievementy = retire** (rozhodnutí PM): raid-exkluzivní item **definice zůstávají** (vlastněné kusy se nedropují, jen neobtainable), odemčené achievementy zůstávají jako historická data. Weekly lockout nově jen pro dungeony. Attunement questy ponechány jako běžný obsah. **Žádná DB migrace** (sdílené tabulky zůstávají; stará raid data inertní). Build/test/lint/typecheck zelené.
- [ ] **Dungeon overhaul → tahové + multi-enemy** 🚧 _(ADR 0037; rozhodnutí PM: solo zůstává i idle, multi-enemy encountery)_ — vedle zachovaného idle auto-resolve přidat **interaktivní tahový** boj (navázat na tahový engine Gauntletu) + **skupiny nepřátel** na encounter (trash packy / boss+adds):
  - [x] **Slice 1 — multi-enemy model + idle auto-resolve** ✅ — `DungeonDef.encounters` = pole **skupin** (`EncounterDef { enemies: EnemyDef[] }`); engine `fightEncounter` (party vs skupina, fokus nejslabšího / threat targeting, per-enemy timery, AoE). Trash = **oslabení minioni** (nižší CR), konzervativní packy (2–3) + boss+adds. `simulateRaidRun` zpětně kompatibilní (`(CombatActor|CombatActor[])[]`). Wipe/retry determination drží clearovatelnost. 10 dungeonů přepsáno.
  - [x] **Slice 2 — tahový solo engine** ✅ — interaktivní tahový run `dungeon-run.ts` (1 hráč vs sekvence multi-enemy encounterů, **výběr ability + cíle**, short rest mezi encountery, persistovaný stav `dungeon_turn_runs`, migrace `0041`). API `dungeons/turn/*` + web `dungeon-turn/[runId]` (klik na nepřítele = cíl). Odměna sdílí `computeGroupReward`+lockout+reputaci s auto-resolve. Idle solo zůstává jako alternativní mód.
  - [x] **3-player (autofill s AI)** ✅ _(Slice 3, ADR 0037)_ — tahový group boj rozšířen z 1 aktéra na **partu N** (hráč + AI parťáci). Pevný **D&D companion roster** (`data/companions.ts`: Gareth tank / Lyra healer / Vex dps) stavěný **stejnou cestou jako hráč** (`deriveCombatProfile`→`deriveRaidActor`) → parťáci **mimikují hráče** (role/rotace/spell sloty/Ki/rage). Hráč zvolí roli, autofill doplní zbytek do **1/1/1**; parťáci jednají automaticky (`allyTakeTurn`), nepřátelé útočí na **threat** (tank). `enterGroup` + route `turn/enter-group`, web party panel + volba role. **Down hrdiny = konec runu**; pád parťáka jen vyřadí (party bojuje dál). Solo = zpětně kompatibilní. _Ruční 3-player party reálných hráčů = Slice 4._
  - [x] **5-player / reální hráči** ✅ _(Slice 4, ADR 0038 — model: živé sezení + AI fallback)_ — ✅ **4a** deterministické jádro `dungeon-party.ts` (multi-owner party = lidé + AI, `submitPartyAction`/`resolvePartyRound`, simultánní kolo s buffrovanými akcemi, AI fallback za nečinné, wipe = celá party). ✅ **4b** API + persistence + REST: tabulky `dungeon_party_runs`/`participants` (migrace 0042), `DungeonPartyService` (launch z party 3/5, submit, deadline → AI fallback, per-člen reward), živá web stránka `dungeon-party/[runId]` + „⚔️ Live" launch v group page. ✅ **4c** WebSocket živé push: `DungeonPartyGateway` + relay (room `party-run:{id}`, signál `party:updated` → `party:state`), BullMQ deadline scheduler (`tickDeadline` + atomický `claimDueRound` CAS proti dvojímu vyhodnocení), web na WS push + REST safety-net. ✅ **4d** initiative ordering (d20+DEX per encounter) + reconnection (idempotentní join). _Follow-up: 5-player content tuning (technicky funkční přes škálování)._
- [ ] **Gauntlet — overhaul bonusů** (draft odměn): lepší balanc + větší diverzifikace nabízených buffů/směrů.
- [ ] **Arény (PVP) — zatím out of order** — pozastavit, než se rozhodne, co s nimi (směr/formát). ADR až s rozhodnutím.
- [x] **Akční ekonomika — action surge, bonus action, „once per combat"** ✅ _(D&D action economy, ADR 0042; krájeno na 3 slice)_:
  - [x] **Slice 1 — „once per combat" gating** ✅ — nový `SignatureAbility.oncePerCombat` + sdílené helpery (`abilityOnceAvailable`/`markAbilityUsed`, `OnceUsedTracker`) protažené **všemi simulátory** (quest/pvp duel+team/raid/dungeon/dungeon-party/gauntlet). Per-aktér okno s **resetem na začátku encounteru** (short rest mezi encountery / nová vlna / nový pull); promítnuto i do `canCast*`/`submitPartyAction` (UI zašedne). Otagováno **Action Surge** (Fighter) + opener **Assassinate** (Rogue) → vystřelí 1× za boj, pak se „drží". Persistované tahové simy nesou `usedOncePerCombat` v JSON stavu (**bez DB migrace**, staré běhy graceful). Magnitudy beze změny; kontraktní testy + `action-economy.test.ts` zelené.
  - [x] **Slice 2 — Action Surge / Onslaught jako reálná akce navíc** ✅ — `SignatureAbility.grantsExtraAction` + `extraActions` + sdílené `extraActionCount`/pseudo-ability `EXTRA_ATTACK_ABILITY`. Po seslání aktér hned provede extra úder(y) zbraní v **tomtéž kole/okamžiku** (Action Surge 1×, Onslaught 2×), než jedná soupeř — sjednoceno přes **všech 6 simulátorů** (hráč i AI parťáci/raid členové). Action Surge přeladěn z `damageMult 2.0` na `1.0 + 1 extra útok` (≈ stejná magnituda, ale teď reálná akce navíc); Onslaught na `1.0 + 2 extra`. Extra útoky jsou v logu pojmenované „Extra Attack". Kontraktní + `action-economy.test.ts` zelené.
  - [x] **Slice 3 — bonus action jako samostatný akční slot** ✅ — `SignatureAbility.actionCost` (`'action'` default / `'bonus'`) + sdílený `isBonusAction`; **Healing Word / Mass Healing Word** otagovány jako bonus action. **Plně interaktivní** napříč všemi tahovými simy (dungeon-run solo, dungeon-party MP, **Gauntlet**): hráč si bonus action **vědomě zvolí** vedle hlavní akce (D&D „1 akce + 1 bonus / kolo") — engine přijímá volitelné `bonusAbilityId`, API validuje (ready/zdroje/„musí být bonus"), web má lištu „Bonus action". **Nic se neděje automaticky za hráče**; AI parťáci/členové si bonus volí sami (AI hra). 1 bonus/kolo; shodný s hlavní akcí se odmítne/neduplikuje. V **Gauntletu** bonus heal čerpá run-wide `healsUsed` → podléhá `healFalloff` (diminishing), takže nerozbije roguelite heal-scarcity (balanc křivkou). Spojité (timeline) simy: `actionCost` kosmetický (žádné kolo). **`oncePerTurn` záměrně nezaváděno** — Sneak Attack je diskrétní ability (1× za aktivaci) a bonus akce je cap 1/kolo, takže pravidlo „1× za kolo" je strukturálně splněné (viz ADR 0042). Testy `action-economy.test.ts` + build/typecheck/lint zelené.
  - _Follow-up (mimo tento ADR): další bonus-action ability (Misty Step, Cunning Action, two-weapon, Second Wind)._
- [ ] **Výběr targetů v combatu** — umožnit hráči volit cíl útoku i mimo tahový dungeon (kde už cílení je); zvážit napříč režimy (quest auto-resolve = rotace/priority, ne ruční cíl).
- [ ] **Combat log — overhaul (všechny části hry)** — přehlednější a čitelnější bojový log:
  - lepší rozlišení **spellů / nepřátel / spojenců** (jména/ikony/barvy místo generických hlášek).
  - **pomalejší, čitelné tempo** — ve skupinovém boji (např. 2v2 v dungeonu) log skáče moc rychle a nejde číst (throttle / krokování / pauza).
  - celkově vyšší struktura a čitelnost.

## Spell sloty & resource

- [x] **Spell sloty všude** ✅ — D&D spell sloty ve všech bojových režimech + **scrap mana** (`ResourceType` proxy pryč) + class resources Rage/Ki/Pact. **ADR 0034** (4 slices, vše hotovo):
  - [x] **Slice 1 — scrap mana** ✅ — `ResourceType` (mana/energy/rage proxy) smazán z `@game/shared` (`ClassDef.resource` + `DerivedStats.resource`), byl to mrtvý kosmetický stav (nikdy se v boji nečetl). Resource ekonomika = spell sloty (MR-4) zůstává jediným zdrojem pravdy. Web sheet/inspect ukazuje „Spell Slots" (součet max; martial = „—") místo mrtvého resource. Bez DB migrace, bez změny bojových výsledků.
  - [x] **Slice 2 — sloty do idle auto-resolve combatu (dungeon + PVP)** ✅ — per-encounter slot spotřeba (vzor `quest-run.ts`) v dungeon enginu (`raid.ts` `fightBoss`) i PVP/arénách (`pvp.ts` duel + team). Sdílený primitiv `spendSlotForTier` vytažen do `data/spell-slots.ts`. Kouzlo (tier ≥ 1) čerpá slot, cantrip/martial zdarma; bez slotu se „drží" (basic úder/cantrip). Healer má free basic-swing heal (žádný kolaps). Dungeon dostal i **upcast** (trackuje slot tier). Kontraktní testy v `raid.test.ts`/`pvp.test.ts`. Build/test/lint/typecheck zelené, dungeon+arena flows beze změny.
  - [x] **Slice 2b — sloty v Gauntletu** ✅ — **rozpočet na celý run** (rozhodnutí PM: NEresetuje se po vlně → roguelite hospodaření), persistovaný v JSON run-stavu (`GauntletPlayerState.spellSlots`, bez migrace, lazy init starých běhů). UI „zobrazit + zablokovat": kouzlo bez slotu je zašedlé (`outOfSlots`, štítek „No slot"), panel hráče ukazuje ✨ zbývá/max; server validuje (`canCastGauntletAbility`). Gauntlet dostal i upcast. Bez refill draftu (ventil = follow-up). Kontraktní testy v `gauntlet.test.ts`. Build/test/lint/typecheck zelené.
  - [x] **Slice 3 — class resources** ✅ — `data/class-resources.ts`: **Ki** (Monk, bodový pool = level; techniky mají `kiCost`, gating jako sloty), **Rage** (Barbarian, buff okno: `applyRage` = fyzické resistance ×0.5 + damage bonus, auto-zuření charge-gated přes `computeHit`), **Pact** (Warlock per-wave short-rest recharge v Gauntletu). `CombatActor`/`DerivedStats` rozšířeny; Gauntlet UI (🌀 Ki / 💢 rage, „No Ki"), character sheet Ki/Rage řádek. Kontraktní testy (`class-resources.test.ts` + raid/gauntlet). Build/test/lint/typecheck zelené.
- [x] **Fix kouzla nesedící na D&D** ✅ _(ADR 0036, audit `docs/systems/spell-audit.md`)_ — kompletní audit `abilities.ts` proti D&D 5e RAW. Heady = literal dice + spellMod (konec „% healing power"); martial = weapon + bonus kostky (Sneak +⌈lvl/2⌉d6, Smite +2d8) + extra-attack/advantage; **WoW execute smazán úplně**; DoT reálně tiká (i v quest-run) přes literal `dotDice`; **Hunter's Mark / Hex = koncentrační buffy** (+1d6/hit, pasivní rider); mislabely opraveny (Scorching Ray 6d6 instant, Drain Life→Vampiric Touch). Nové engine cesty (`bonusDice`/`dotDice`/`healDiceSpec`/`advantage`/`weaponRiderDice`/`aoe`) napojeny do všech simulátorů. **AoE flag** (mass heal → všichni spojenci hned; AoE damage čeká na multi-enemy souboje). _Follow-up: conditions (stun/prone/frightened) → „Enemy schopnosti"; AC-buff ability; AoE-damage multi-target → dungeon overhaul; kniha kouzel (výběr aktivních) = další slice této feature._
  - [x] **🔥 Caster magnitudy (blocker z balance passu, ADR 0035)** ✅ — wizard/cleric byli po D&D-ifikaci base neviable na high-level bossech (cantripy/leveled kouzla na literal kostkách pod martial `attackPower`, cantripy bez level-scalingu). Vyřešeno třemi D&D-věrnými pákami: **cantrip scaling** (1→2→3→4 kostek na 5/11/17, `cantripDiceMultiplier` v `abilityDamageSpec`) + **upcast nuke nejvyšším slotem** (`spendSlotForTier(…, preferHighest)` pro kouzla s `dicePerSlotAbove` → high-level sloty škálují damage) + **healer self-sustain v solo questu** (healer ošetří sebe; **řízeno rotací** `shouldCastHeal` — podmínka `self_hp_below` „když pod N % HP použij X spell", default 0.5, `quest-run.ts`). Sjednoceno přes všechny simulátory (quest/dungeon/PVP/Gauntlet). Ověřeno harnessem `gear-balance.test.ts` (nový kontrakt `CASTER_CLASSES`): geared L20 boss BiS wizard ~72 %, cleric ~84 % win se ztrátou HP (z ~0–11 % před fixem). Gear/base/enemy magnitudy nedotčeny. `docs/systems/dnd-combat.md`.
- [x] **Kniha kouzel — hráč si volí aktivní spelly** ✅ _(ADR 0039)_ — místo fixního kitu si caster **vybere aktivní (prepared) kouzla** z poolu classy. Rozšířený pool `EXTRA_SPELLS` (~7–9/caster → ~10–13 volitelných kouzel napříč tiery, D&D-věrné dice/typy/saves). **Model:** jednotný *known/prepared* pro všechny castery (rozhodnutí PM — Wizard se mechanicky neliší; spellbook/scribování = případný follow-up). **Swap:** zdarma při **Long Rest** (gate = plně odpočatá postava; žádný gold sink — rozhodnutí PM). Sdílené jádro: `spellPoolFor`/`preparedLimits`/`isValidPreparedSelection`/`resolvePreparedAbilities`; `deriveCombatProfile` bere `preparedSpells` → volba živá ve **všech simulátorech** (quest/dungeon/PVP/Gauntlet) i v editoru rotace. `prepared == null` → legacy baseline kit (zpětná kompatibilita, žádná regrese). DB `characters.prepared_spells` (migrace 0043), `PUT /spells/prepared`, web `/spells` editor (počítadla X/N, limity, swap-gate). _Follow-up: plný PHB list, Wizard spellbook/scribování, gold-cost swap, výběr cantripů u half-casterů._
- [ ] **Level-up overhaul — víc D&D, přehlednější** 🔜 _(vyčleněno z Knihy kouzel — rozhodnutí PM; velké → ADR)_ — současný Level Up (`levelup.ts`, `data/feats.ts`, web `/levelup`) dává **volbu jen na 5 levelech** (subclass + ASI/Feat na 4/8/12/16/19); na zbylých ~14 levelech se na obrazovce neděje **nic** (žádný feedback, co level přinesl) a **featy jsou jeden plochý globální seznam** abstraktních combat-tagů dostupný všem třídám stejně (ne moc D&D). Cíl PM: **víc D&D-like a přehledné.** Krájeno na slice (pořadí s PM):
  - [x] **Slice A — UI redesign (přehlednost)** ✅ — `/levelup` předělán na čitelný **level track 1–20**: u každého levelu se ukazuje, co přináší (HP z hit dice, proficiency bonus, nové spell sloty, nově dostupná kouzla do Knihy kouzel, class/subclass feature) — **každý level = událost s feedbackem**, ne prázdno. Milníkové volby (subclass / ASI / Feat) vizuálně zvýrazněné a interaktivní po dosažení levelu. Mobile-first svislá časová osa (PWA). Sdílený pure builder `buildLevelTrack` (`packages/shared/src/level-track.ts`, jediný zdroj pravdy, kontraktní testy) agreguje existující data — **bez změny mechanik**. API `LevelUpView` rozšířen o `track`.
  - [x] **Slice B — D&D-věrné featy + class-feature volby + víc subclass** ✅ _(ADR 0040; rozhodnutí PM: kurátorský feat list, class-feature volby ANO, 2–3 subclassy per classa)_. Krájeno:
    - [x] **B1 — D&D feat roster (kurátorský)** ✅ — `data/feats.ts` přepsán: **filtrování dle classy** (`classes`/`featsForClass` — martial vs caster), **prerekvizity** (`prerequisites` + `meetsFeatPrerequisites`: min level/atribut/caster, vyhodnocuje API service nad efektivními staty), **half-featy** (`effect.statChoice` → `FeatChoice.abilityChoice` = +1 do zvoleného atributu; agregace + validace). ~20 featů (13 původních zachováno → žádná regrese uložených voleb + ~7 nových). Efekty stále přes `COMBAT_TAG_EFFECTS`/`SHIELD_TAGS` (kontraktní test). API `LevelUpView.feats` filtrováno + `eligible`/`prerequisite`/`abilityOptions`; web ukazuje prereq label (zašednutí ineligible) + half-feat picker.
    - [x] **B2 — class-feature volby** ✅ — nový typ level-up slotu `class_feature` (`data/class-features.ts`): **Fighting Style** (Fighter L1, Paladin/Ranger L2), **Metamagic** (Sorcerer, škáluje 2/3/4 na L3/10/17), **Eldritch Invocations** (Warlock, 2→7 přes L2–18), **Battle Master manévry** (Fighter, gated subclassem `battle_master`, 3→6). Model: skupina (`ClassFeatureGroup`) s rozvrhem → každá volba = vlastní slot (`cf:<groupId>#<index>`), recykluje persistenci `character_levelup_choices` (bez DB migrace). Efekty voleb = stejný `FeatEffect` tvar → engine combat-tagy (žádný nový kód v enginu). `levelUpSlots(klass, level, subclass?)` rozšířeno o subclass-gating; `isValidChoice` ověří skupinu+option, API service unikátnost napříč sourozeneckými sloty + pruning osiřelých voleb po změně subclassi. Level track zobrazuje class-feature milníky; web picker (multi-slot, zašednutí již zvolené volby). Kontraktní testy (`class-features.test.ts`). **Celý Slice B hotový.**
    - [x] **B3 — víc subclass (2 per classa)** ✅ — ke stávající 1 subclass přidána **1 nová D&D subclass ke každé z 12 tříd** (24 celkem) se signature ability: Totem Warrior (Bear Spirit mitigation), College of Valor, War Domain (Guided Strike), Circle of the Land, Battle Master (maneuver), Way of Shadow, Oath of Vengeance, Beast Master, Assassin, Wild Magic, Great Old One, School of Abjuration (Arcane Ward). Signature ability na `subclassLevel` dané classy, využívá existující engine cesty (strike/mitigation, dice/save/advantage/bonusDice/kiCost/aoe — ADR 0036) → živé ve všech simulátorech, magnitudy v úrovni stávajících signatur. Subclassy udělující *nové* sesílání (Eldritch Knight/Arcane Trickster) vynechány (spell sloty vázané na classu). Picker (`/levelup`, char creation) ukazuje obě volby; kontraktní testy (`subclasses.test.ts`). Bez DB migrace (`SubclassId` string sloupec).
  - [x] **Slice C — class features po levelech (D&D progrese)** ✅ _(ADR 0041)_ — nový čistý modul `class-progression.ts` deriváuje **automatické class features** z jediného zdroje pravdy a `buildLevelTrack` je vystaví v novém poli `LevelTrackEntry.classFeatures`: **Extra Attack** (martial 5/11/20 z `basicAttackDiceCount`), **Improved Cantrips** (full/pact caster 5/11/17 z `cantripDiceMultiplier`), **Rage** uses/damage (`rageChargesFor`/`rageDamageBonus`), **Ki** (`kiPointsFor`), **Sneak Attack** scaling (baseline ability s `bonusDicePerLevels`, odvozeno přesně jako `bonusDiceSpec`). **Žádné duplikované magnitudy** (kontraktní testy ověřují shodu popisů s enginem). Surfaceujeme **jen reálně modelované** features — čistě flavorové (Channel Divinity uses, Second Wind, Wild Shape…) odloženy na jejich mechanickou implementaci (backlog). Slice C je prezentační (volby pokryl Slice B) → **bez DB migrace, bez API změn**; web `/levelup` vykreslí class features se štítkem „Class feature". **Tím je Level-up overhaul kompletní.**
- [ ] **Spell karty — redesign (všechny části hry)** — místo „AI-slop" tlačítek udělat z kouzel skutečné **karty spellu**. Na hover/tap ukázat plnou grafickou kartu: **název, dmg, cooldown, typ poškození** — a poškození nejen jako kostky, ale i jako **rozptyl reálného čísla** (min–max). Navazuje na deslopifikaci UI.
- [ ] **Spell sloty — přehledné UI** — hráč momentálně nevidí, **jaké spell sloty mu zbývají** ani **kolik kterého slotu které kouzlo spotřebuje**. Vyřešit zobrazení (zbývající/max per tier + cena kouzla, vč. upcastu) ve všech bojových režimech.
- [ ] **Audit cooldownů spellů** — projít cooldowny všech kouzel, ověřit konzistenci s D&D modelem (spell sloty vs. cooldown) a vzájemnou vyváženost.

## Enemy systém

- [ ] **Refactor enemy** — datový model nepřátel (sjednotit `data/enemies.ts` / dungeon / quest foe → jeden zdroj pravdy s CR, typy, schopnostmi).
- [ ] **Enemy schopnosti** — aktivní abilities nepřátel (ne jen boss `damageMult`/special): typované útoky, conditiony, saving-throw efekty proti hráči.
- [ ] **Bestiář pro hráče** — in-game encyklopedie nepřátel (navázat na MR-7 `data/enemies.ts` + CR + typové obrany): odemykání po setkání, lore, staty/odolnosti.

## Ekonomika & gear

- [x] **Recheck gear** ✅ _(ADR 0035, dokončuje MR-10e follow-up)_ — gear stat škála narovnána na D&D magnitudu. **D&D-věrný model** (rozhodnutí PM): gear dává `attack_power`/`spell_power` + `armor` (AC), raw ability skóre jen vzácně (epic+ trinket +1). Katalog `items.ts` (≈340 kusů) přepsán skriptem `scripts/rescale-gear.py` z budgetu (itemLevel/rarity/slot/role) → full BiS na lvl 20 ≈ **1.5–2× efektivní síla** nahé postavy. Zároveň **D&D-ifikace base** (rozhodnutí PM): zrušen per-level růst skóre, innate clampnuto na 20 (`ABILITY_SCORE_CAP`) → bounded accuracy (naked lvl 20 AC ~13, DC ~17). `armor`→AC sjednoceno (`ARMOR_PER_AC=40`), **přeladěny** enemy 1v1 faktory (`ENEMY_HP_FACTOR` 0.26/0.40, `ENEMY_DPR_TO_SWING` 0.08/0.10). Kalibrační harness + kontrakt `gear-balance.test.ts`. _Martialové vyladěni; **casteři odloženi** na „Fix kouzla" (literal spell dice — viz blocker výše)._
- [ ] **Revize gold systému — balance** — zdroje/sinky zlata, inflace, ceny.
- [ ] **Banka: poplatek za vklad/výběr** — uložení i vytažení věcí z banky stojí gold → navádí hráče banku tolik nevyužívat (gold sink + design tlak).

## UI / UX

- [ ] **Deslopifikace UI** — celkové pročištění UI od „AI-slop" vzhledu; konzistentní vizuální jazyk, méně generických tlačítek. Zastřešuje redesign **spell karet** a **combat logu** (viz výše) i obecný polish napříč obrazovkami.
- [ ] **Notifikace / oznámení — chování jako u seriózní hry** — opravit chování, které mate:
  - po loginu **vyskakují i už přečtená** oznámení — nemají.
  - **přečtené, ale nesmazané** oznámení nesmí znovu vyskakovat.
  - hráč musí mít možnost **zavřít jednotlivé karty** s upozorněním, které právě vyskočily.

## Platforma & distribuce

- [ ] **Refactor UI pro mobily** — responsivní / mobile-first přepracování (hra je PWA, primárně mobilní idle).
- [ ] **Onboarding / tutoriál** _(byl M11, odloženo; přesunuto sem z MR)_ — provedení idle smyčkou, redesignované po D&D char creation (rasa/class/background/spell sloty). Poslední polish před releasem.
- [ ] **Wrapper PWA → APK** (TWA / Capacitor — rozhodnout) a **release na Google Play**.

## Monetizace

- [ ] **Vymyslet a přidat monetizaci** — kosmetická vrstva (skiny/tituly) je oddělená od statů od M0 (ADR 0003); rozhodnout model (skiny, battle-pass, …) a implementovat. ADR.

## Auth

- [ ] **Email auth** — registrace/login přes e-mail s potvrzením (rozšiřuje stávající průřezový auth follow-up níže).
- [ ] **Logout bug — session se neudrží** — hra hráče **neustále odhlašuje**, jako by byl login v `sessionStorage` (mizí po zavření tabu / vyprší moc brzy). Ověřit perzistenci session / refresh tokenu; souvisí s průřezovým auth follow-upem (httpOnly cookie + refresh rotace).

## Questy & příběh

- [ ] **Přepis questového příběhu + rozšíření** _(slučuje „rozšířit questy" + „nový příběh")_ — smazat texty stávajících questů a napsat **nový koherentní příběh** v settingu The Caldmoor Reaches, **přidat nové questy** (především na **začátek hry** — onboarding příběhem) a celkově rozšířit questový obsah. Engine/mechaniky beze změny, jen narativ + nové záznamy.
- [ ] **Skill checky v questování** _(slučuje „přidat checky" + „skill check do questování")_ — dialogové/questové volby s **D&D skill checky** (DC + atribut/skill): Charisma check, Intimidation, Persuasion, … s úspěch/neúspěch větvením. Navazuje na „❓ dialogové volby s skill checky" v RP sekci níže.

## RP / D&D / BG3 prvky

- [ ] **Víc RP prvků** _(slučuje „přidat více RP možností")_ — vymyslet a přidat (rozšířit backstory/Background dopady, charakterové volby, …).
- [ ] **Guilda — custom role s custom oprávněními** — umožnit ve guildě vytvářet **vlastní role** s **konfigurovatelnými oprávněními** (kdo může zvát/kickovat, spravovat banku, …). Souvisí s „❓ revize guild systému" níže.
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
