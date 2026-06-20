# ADR 0044 — Enemy schopnosti: napojení do enginu (Slice 1, jen infra)

- **Stav:** přijato (Slice 1 hotový — infra, bez contentu)
- **Kontext:** navazuje na MR-7 (bestiář + `EnemyAbility`, ADR 0031), sjednocení
  enemy modelu (ADR 0043) a dice-roll combat (MR-5) + saving throwy (ADR 0032).
  Rozhodnutí PM: **jen infra, bez contentu** — napojit, aby abilities *mohly*
  fungovat napříč simulátory, ale **nepřidávat** je živému obsahu → nulový balanc
  dopad. Přiřazení abilit konkrétním nepřátelům + conditiony = další slice.
- **Rozsah:** `packages/shared` — `data/enemies.ts` (konvertor), `combat.ts`
  (`EnemyStats.signatureAbilities` + `buildEnemyActor` + `selectEnemyAbility`),
  `raid.ts`, `quest-run.ts`, `dungeon-run.ts`, `dungeon-party.ts`. **Bez DB
  migrace** (tahové simy: `cooldowns` v JSON stavu, staré běhy graceful).

## Kontext

`EnemyAbility` (id, name, damageMult, damageType, cooldownSec, save) žila v
katalogu (`EnemyTemplate.abilities`), ale **engine ji nikdy neviděl**:
`buildEnemyActor` natvrdo nastavoval `signatureAbilities: []`. Nepřátelé tak
uměli jen základní úder (+ hardcoded boss „special" v questu). `raid.ts` přitom
už měl timer infrastrukturu, která `enemy.signatureAbilities` čte — jen byla
prázdná.

## Rozhodnutí

1. **Napojit katalog → bojový aktér.** Nový `enemyAbilityToSignature(EnemyAbility)`
   → `SignatureAbility` (`kind: 'strike'`, `damageMult` škáluje přes attackPower,
   `damageType` aktivuje MR-7 obrany hráče, `save` → `effect: 'half'`).
   `instantiateEnemy`/`buildBestiaryEnemy` propíšou `signatureAbilities` ze šablony;
   `EnemyStats` dostal pole `signatureAbilities?`, `buildEnemyActor` ho přenese do
   `CombatActor` (`def.signatureAbilities ?? []`).

2. **Sdílený výběr `selectEnemyAbility(actor, isReady)`** — vrátí první ready
   **útočnou** ability (strike/drain/dot; heal/shield/buff se přeskočí). `isReady`
   zapouzdřuje cooldown per simulátor (čas vs. tahy).

3. **Vystřelení napříč simulátory** (typové poškození + per-ability saving throw
   přes sdílený `applySpellSave` → cíl si hodí proti enemy spell save DC):
   - **`raid.ts`** (group/dungeon auto-resolve): timer infra už ability fire-ovala;
     doplněn `damageType` + `applySpellSave` do enemy větve.
   - **`quest-run.ts`** (timeline): cooldown podle času (`enemyAbilityReady`).
     **Legacy boss „special" (1.6× / DEX save) zachován jako fallback**, když
     nepřítel nemá `signatureAbilities` → dnešní questy beze změny.
   - **`dungeon-run.ts` / `dungeon-party.ts`** (tahové): `DungeonRunEnemy` dostal
     `cooldowns?` (tikají v `tickEnemyDots`, 1×/kolo); `enemyAttackParty` vybere
     ready ability, jinak základní úder.
   - **`gauntlet.ts`**: nepřátelé jsou procedurální bez katalogových abilit →
     **mimo tento slice** (aktivuje se, až bude Gauntlet brát abilities z katalogu).

## Proč je to balanc-neutrální (Slice 1)

Žádný **živý** nepřítel zatím abilities nemá: dungeon šablony (ADR 0043) je
nedefinují, quest foes je nedědí (žádný quest neodkazuje `template`), Gauntlet je
procedurální. Generických 16 bestiář kreatur (s abilitami) žádný obsah nepoužívá.
Nové cesty jsou tedy **dormantní** — všech 635 shared + 199 API testů zelených bez
změny výsledků. Kontraktní testy ověřují, že ability **vystřelí**, *když* ji
nepřítel má (`grave_wraith` Life Drain v questu, `buildEnemyActor` kit).

## Důsledky

- **+** `EnemyAbility` z katalogu je teď živá ve všech catalog-backed simulátorech
  → stačí přiřadit abilities nepřátelům (content slice) a „rozsvítí se".
- **+** Typové poškození enemy abilit ctí MR-7 obrany hráče; saving throwy proti
  hráči (poloviční poškození) sjednocené přes `applySpellSave`.
- **−** **Conditiony** (stun/prone/frightened/slow…) zatím **neimplementované** —
  `EnemyAbility.save.description` je flavor; save dělá jen „half". Status-effect
  machinery = samostatný slice (turn-skip/disadvantage napříč simy).
- **Follow-up:** (a) přiřadit abilities dungeon bossům + bestiáři (content, rebalance
  proti `gear-balance` kontraktu), (b) conditiony, (c) Gauntlet draw abilit z katalogu,
  (d) drain/dot enemy ability (self-heal / krvácení) — `kind` už podporováno.

## Verifikace

Build/test/lint/typecheck zelené. Kontrakt: `data/enemies.test.ts`
(threading + prázdný kit), `quest-run.test.ts` (Life Drain fire).
