# ADR 0039 — Kniha kouzel: hráč si volí aktivní (prepared) kouzla

- **Stav:** přijato
- **Kontext:** navazuje na MR-4 (spell sloty, ADR 0029) + ADR 0036 (D&D-věrné abilities)
- **Rozsah:** `packages/shared` (spell pool + resolve), `apps/api` (SpellModule + persistence), `apps/web` (`/spells`)

## Kontext

Dosud měla postava **fixní abilit kit** — `resolveAbilities(class, subclass, level)`
vracela pevnou sadu (3–4 baseline + subclass signature), která se odemykala
automaticky úrovní. Hráč **nic nevolil**: žádná „kniha kouzel", žádné rozhodnutí
o tom, co má v boji k dispozici. Roadmapa (backlog „Kniha kouzel") to flaguje
jako další feature spell-slot clusteru, se dvěma otevřenými PM rozhodnutími
(model Wizarda; omezení swapu).

## Rozhodnutí (PM)

1. **Pool** — „velký, ale ne kompletní": rozšířit baseline kit o `EXTRA_SPELLS`
   (~7–9 kouzel/caster) → dohromady ~10–13 volitelných kouzel per caster napříč
   tiery. Ne celý PHB (objem/balanc). Dice/typy/saves D&D-věrné (styl ADR 0036).
2. **Model** — **jednotný known/prepared** pro všechny castery. Wizard se
   mechanicky neliší (spellbook/scribování = případný pozdější follow-up).
3. **Swap** — **zdarma** při Long Rest / level-up (idle-friendly, žádný gold sink;
   gold-cost varianta zamítnuta — závisela by na revizi gold systému).
4. **Level-up overhaul** — vyčleněn jako **samostatná** budoucí položka (rozhodnutí
   PM), není součástí téhle feature.

## Architektura

### `packages/shared`

- **`EXTRA_SPELLS: Record<ClassId, BaselineAbility[]>`** (`data/abilities.ts`) —
  rozšiřující pool nad baseline kit. Martialové (`CASTER_TYPE === 'none'`) prázdné.
- **`classSpellCatalog(klass)`** = baseline ∪ extra (dedup dle `id`), bez subclass.
- **`spellPoolFor(klass, level)`** (`data/spell-slots.ts`) — volitelná kouzla
  (cantrip / leveled) classy do levelu, bez subclass/martial techniky.
- **`preparedLimits(klass, level)`** — kolik cantripů a leveled kouzel smí být
  připraveno. Štědré (rozhodnutí PM): full `cantripy 2→3→4`, `leveled 4 + ⌊lvl/2⌋`;
  pact/half méně; non-caster `0/0`.
- **`isValidPreparedSelection(klass, level, ids)`** — gating poolem + limity + bez duplicit.
- **`defaultPreparedSpellIds(klass, level)`** = legacy baseline kit (auto výchozí).
- **`resolvePreparedAbilities(klass, subclass, level, prepared)`** — bojový set:
  **always-on** (baseline bez `spellTier` = martial techniky + subclass signature)
  **+ vybraná kouzla**. `prepared == null` → přesně `resolveAbilities` (legacy,
  zpětná kompatibilita; žádná regrese v boji). Neplatná id se defenzivně ignorují.

### Combat engine

`CombatProfileInput.preparedSpells?` → `deriveCombatProfile` používá
`resolvePreparedAbilities` místo `resolveAbilities`. Tím se prepared volba propíše
do **všech** simulátorů (quest/dungeon/PVP/Gauntlet) přes jediný profil-builder,
bez změny call-sites. `undefined` = legacy chování.

### API + web (následné slices)

- DB `character_prepared_spells` (per-postava ids), `SpellModule` `GET/PUT prepared`
  s validací (`isValidPreparedSelection`) a swap-gate (rested / čerstvý level-up).
- `rotation.service` načte prepared a předá do `buildCombatProfile`.
- `/spells` rozšířen o editor výběru (cantripy + leveled, počítadlo X/N).

## Důsledky

- **Zpětná kompatibilita:** postavy bez uložené volby běží na legacy kitu →
  žádná bojová regrese. Rozšiřující pool je čistě opt-in.
- **Determinismus zachován** — výběr je jen filtr nad statickým katalogem.
- **Mimo scope (follow-up):** plný PHB list, Wizard spellbook/scribování,
  gold-cost swap, level-up overhaul, výběr cantripů u half-casterů (žádné nemají).
