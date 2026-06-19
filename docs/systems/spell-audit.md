# Spell & ability audit — „Fix kouzla" (D&D 5e věrnost)

> **Účel:** jediný zdroj pravdy pro přepis katalogu `packages/shared/src/data/abilities.ts`
> na **D&D 5e-věrné** mechaniky. Cíl PM: žádné „heal za 140 %", žádné WoW-ismy
> (execute „pod 30 % HP"), magnitudy = literal D&D kostky / saving throwy / koncentrace.
>
> Navazuje na ADR 0032 (literal magnitudy — strike kouzla už hotová) a ADR 0035
> (D&D-věrný gear + bounded accuracy, balanc hlídá `gear-balance.test.ts`).
> Implementace = **ADR 0036** (až se začne kódovat), krájeno na slices níže.
>
> **Rozhodnutí PM (závazná):** literal D&D **u všeho včetně martial**; martial
> techniky = weapon attack + případné **bonus kostky** (Sneak Attack, Divine Smite),
> ne `damageMult` proxy. Magnitudu už nenese `attackPower`, ale literal kostky +
> attribut modifikátory — re-kalibrace enemy faktorů dle harnessu.

## Jak to engine počítá dnes (výchozí stav)

| Kind | Současný výpočet | Literal `dice` aplikováno? |
| --- | --- | --- |
| `strike` | `dice` → literal (ADR 0032); jinak `weaponDamageSpec(attackPower) × damageMult` | ✅ jen tady |
| `dot` | `attackPower × dotTickMult` za tik | ❌ |
| `heal` | `attackPower × damageMult × HEAL_POWER_FACTOR × falloff` | ❌ |
| `drain` | strike amount × `drainHealFraction` (heal část) | ❌ (damage část = strike) |
| `mitigation` | `mitigationPct` po dobu `mitigationDurationSec` | n/a |

`weaponDamageSpec` (combat.ts) hází `count`d`sides`+`bonus` kalibrované na `attackPower`;
`abilityDamageSpec` vrací literal kostky jen když má ability `dice`. Magnitudu nese
`attackPower` (sim-knob). Cílový stav: damage/heal kouzel = **literal kostky + modifikátor**,
nezávisle na `attackPower`; martial weapon damage zůstává `weaponDamageSpec` (= weapon die)
+ bonus kostky maneuverů.

## Engine gapy (co je potřeba doplnit) — Slice A

1. **Literal dice pro `heal`** — `Cure Wounds 1d8 + spellMod`, upcast `+1d8/slot`,
   `Healing Word 1d4 + spellMod`. Nový `healDiceSpec(ability, slotTier, actor)` analog
   `abilityDamageSpec`, čte spellcasting mod (`actorSpellMod`). Nahradí `damageMult ×
   HEAL_POWER_FACTOR` cestu ve **všech** simulátorech (quest-run / raid / pvp / gauntlet).
2. **Literal dice pro `dot` tiky** — `Moonbeam 2d10`, `Spirit Guardians 3d8` za tik
   (recurring), `Searing Smite 1d6/turn`. `dice` na DoT = poškození **jednoho tiku**
   (literal), `dotTicks`/`dotDurationSec` řídí počet/rozložení. Save (CON/WIS) per tik
   nebo „ends on save" (zatím: půlí dle `save.effect`).
3. **Bonus kostky na weapon hit** (`bonusDice`) — Divine Smite `+2d8`, Sneak Attack
   `+(ceil(level/2))d6`, superiority die `+1d8`. Strike = weapon dice (`weaponDamageSpec`)
   **+** literal `bonusDice`. Nový volitelný `bonusDice?: DiceSpec` + `bonusDicePerLevel?`
   (sneak scaling). Crit zdvojí i bonus kostky (D&D).
4. **Koncentrační buff** (`kind: 'buff'`, nebo `weaponRiderDice`) — Hunter's Mark / Hex
   = `+1d6` na **každý** weapon hit po dobu trvání (concentration). Engine: aktér dostane
   `riderDice` na okno → každý strike přičte. Jeden rider naráz (concentration).
5. **Advantage na hod** (`advantage: true`) — Reckless Attack (a Assassinate vs „nejednavší").
   `rollAttack` hodí 2× d20, vezme vyšší. (Disadvantage analog pro Vicious Mockery rider.)
6. **`actorSpellMod(actor)`** — spellcasting modifikátor (pro heal/spell bonusy);
   dnes je v profilu jen `spellSaveDc`/`damageBonus`. Odvodit z `spellSaveDc − 8 − prof`
   nebo přidat pole do `CombatActor`.
7. **Odstranit execute pattern** (`executeBelowPct`/`executeDamageMult`) — WoW-ismus,
   v D&D neexistuje. Nahradit reálnými maneuvery (viz tabulka). Pole se z typu odstraní
   po migraci všech call-sites.
8. **Conditions (stun/prone/frightened)** — Stunning Strike, Trip Attack, Vicious Mockery
   (disadvantage). **Mimo tento slice** → backlog „Enemy schopnosti / conditions"; zatím
   se modeluje jen damage + save, condition = `description` flavor + TODO hook.

> **Strategie zachování balancu:** Slice A přidá engine cesty, ale ponechá `attackPower`
> fallback pro nekonvertované ability → žádná regrese. Konverze kategorií (B–G) se
> ladí proti `gear-balance.test.ts` (martial i `CASTER_CLASSES` kontrakt) — každý slice
> zelený před mergem. `spellMod`/weapon die magnitudy se kalibrují tak, aby on-level
> geared souboje držely okno z ADR 0035 (martial 3–8 úderů, caster boss win > 0.65).

---

## Audit katalogu — ability po abilitě

Legenda verdiktu: ✅ D&D-věrné (jen drobnost) · 🔧 přepsat na literal · 🏷️ mislabel
(špatná mechanika/název) · ❌ WoW-ismus (execute) k odstranění.

### Barbarian (martial, STR, d12)

| Ability | Dnes | D&D 5e RAW | Verdikt → návrh |
| --- | --- | --- | --- |
| Reckless Attack | 1.2× strike | Advantage na melee STR útoky (a nepřítel má advantage vs tobě); **žádný bonus damage** | 🏷️ → weapon attack s `advantage:true`, bez mult |
| Rage (lvl5) | 1.6× strike | Rage = bonus action **buff**: rage damage +2/+3/+4, resist phys, advantage STR — už modelováno jako class-resource (`applyRage`) | 🏷️ duplicitní → odstranit jako strike; Rage řeší class-resource. Slot nahradit weapon maneuverem (např. **Frenzied Strike** weapon attack) |
| Brutal Strike (lvl11) | 1.8×/2.8× execute | Brutal Strike (2024, lvl9): místo Reckless přidá **+1d10** (+2d10 lvl17) + efekt | ❌ execute → weapon attack + `bonusDice 1d10` (2d10 @17) |

### Bard (full caster, CHA, d8)

| Ability | Dnes | D&D 5e RAW | Verdikt → návrh |
| --- | --- | --- | --- |
| Vicious Mockery | cantrip DoT 1.1×, WIS negate | Cantrip: **1d4 psychic** + disadvantage na příští útok cíle; WIS save negates; škálí 1d4/2d4/3d4/4d4 | 🔧 → cantrip strike `dice 1d4` psychic, `save WIS negate`, cantrip scaling; DoT pryč; disadvantage = condition TODO |
| Healing Word | heal 2.0×, tier1 | **1d4 + spellMod**, bonus action; upcast +1d4 | 🔧 → heal `dice 1d4+mod`, `dicePerSlotAbove 1` |
| Dissonant Whispers | 3d6 psychic, WIS half, tier1 | 3d6 psychic, WIS save half (+ nucený pohyb); upcast +1d6 | ✅ (kostky/save sedí; pohyb = condition TODO) |

### Cleric (full, WIS, d6)

| Ability | Dnes | D&D 5e RAW | Verdikt → návrh |
| --- | --- | --- | --- |
| Sacred Flame | cantrip 1d8, DEX negate | 1d8 **radiant**, DEX save negates, scaling 1d8→4d8 | ✅ jen doplnit `damageType radiant` |
| Cure Wounds | heal 2.3×, tier1 | **1d8 + spellMod**, touch; upcast +1d8 | 🔧 → heal `dice 1d8+mod`, upcast +1d8 |
| Guiding Bolt | 4d6 radiant, tier1 | 4d6 radiant spell attack; upcast +1d6 | ✅ doplnit `damageType radiant` |
| Spirit Guardians (lvl14) | DoT 0.4×, tier3, WIS half | **3d8** radiant/necrotic AoE, WIS save half, recurring | 🔧 → DoT `dice 3d8` radiant per tik, save WIS half |

### Druid (full, WIS, d6)

| Ability | Dnes | D&D 5e RAW | Verdikt → návrh |
| --- | --- | --- | --- |
| Produce Flame | cantrip 1d8 fire | ✅ ranged spell attack 1d8 fire, scaling | ✅ |
| Healing Word | heal 2.2×, tier1 | 1d4 + spellMod; upcast +1d4 | 🔧 → heal `dice 1d4+mod` |
| Moonbeam | DoT 0.5×, tier2, CON half | **2d10** radiant, CON save half, recurring; upcast +1d10 | 🔧 → DoT `dice 2d10` radiant per tik, upcast +1d10 |
| Call Lightning | 3d10 lightning, DEX half, tier3 | 3d10 lightning, DEX save half; upcast +1d10 | ✅ |

### Fighter (martial, STR/DEX, d8)

| Ability | Dnes | D&D 5e RAW | Verdikt → návrh |
| --- | --- | --- | --- |
| Weapon Strike | 1.15× strike | Základní weapon attack | ✅ → weapon attack (mult 1.0) |
| Action Surge (lvl6) | 1.7× strike | Extra **action** = další Attack (víc úderů), ne bonus damage | 🏷️ → weapon attack reprezentující extra úder (případně 2× hit) |
| Trip Attack (lvl12) | DoT 0.5× + bleed | Battlemaster: weapon **+1d8** superiority die, STR save → prone | 🔧/❌ → weapon attack + `bonusDice 1d8`, STR save; bleed pryč, prone = condition TODO |
| Killing Blow (lvl20) | 1.8×/2.7× execute | (není RAW; lvl20 = 4. útok Extra Attack) | ❌ execute → silný weapon attack (reprezentuje extra útoky), bez execute |

### Monk (martial, DEX, d6, Ki)

| Ability | Dnes | D&D 5e RAW | Verdikt → návrh |
| --- | --- | --- | --- |
| Martial Arts | 1.2× strike | Unarmed strike Martial Arts die (1d4→1d10) | ✅ → weapon attack |
| Stunning Strike (1 Ki) | 1.75× strike | Weapon hit + 1 Ki → **CON save or stunned**; žádný bonus damage | 🔧 → weapon attack + CON save (stun TODO), `kiCost 1`; bonus mult pryč |
| Quivering Palm (3 Ki) | 2.0×/3.0× execute | lvl17: CON save → **drop to 0 HP**, success = 10d10 necrotic | ❌ execute → `dice 10d10`, CON save (negate→0; zatím half), `kiCost 3` |

### Paladin (half caster, STR/CHA, d8)

| Ability | Dnes | D&D 5e RAW | Verdikt → návrh |
| --- | --- | --- | --- |
| Divine Smite | 1.8× strike, tier1 | Na melee hit expenduj slot: **+2d8 radiant** (+1d8/slot, +1d8 vs undead/fiend) | 🔧 → weapon attack + `bonusDice 2d8` radiant, `dicePerSlotAbove 1` |
| Lay on Hands | heal 2.2×, tier1 | Pool HP = **5×level**, bonus action, **bez slotu**, flat (žádné kostky) | 🔧/🏷️ → heal flat ze poolu (škálí levelem), `spellTier` pryč (není slot) |
| Searing Smite | DoT 0.4×, tier2 | tier**1**: +1d6 fire na hit + 1d6 fire/turn (CON save ends); upcast +1d6 | 🔧 → DoT `dice 1d6` fire (initial+tik), CON save, `spellTier 1` |
| Flash of Light (lvl20) | heal 1.3×, tier1 | (není RAW — duplikuje Cure Wounds) | 🏷️ → přejmenovat na Cure Wounds, heal `dice 1d8+mod` |

### Ranger (half caster, DEX/WIS, d8)

| Ability | Dnes | D&D 5e RAW | Verdikt → návrh |
| --- | --- | --- | --- |
| **Hunter's Mark** | 1.55× strike, tier1 | Bonus action **concentration buff**: +1d6 na každý weapon hit vs cíl (1h) | 🏷️ (flagged) → `kind:'buff'`, `riderDice 1d6`, concentration; ne single strike |
| Serpent Arrow | DoT poison, tier1 | (není RAW; ~Hail of Thorns / flavor) | 🔧 → DoT `dice` poison literal, nebo přejmenovat na **Hail of Thorns** (1d10 + AoE) |
| Volley (lvl14) | 1.85× strike, tier2 | Hunter subclass lvl11 feature (**ne kouzlo**): AoE útok | 🏷️ → weapon attack (AoE flavor), `spellTier` pryč |
| Cure Wounds | heal 1.7×, tier1 | 1d8 + spellMod; upcast +1d8 | 🔧 → heal `dice 1d8+mod` |

### Rogue (martial, DEX, d6)

| Ability | Dnes | D&D 5e RAW | Verdikt → návrh |
| --- | --- | --- | --- |
| Sneak Attack | 1.4×/2.5× execute | +**(ceil(level/2))d6** na qualifying hit (1d6@1 → 10d6@19) | ❌ execute → weapon attack + `bonusDice` scaling `ceil(level/2)d6` |
| Poisoned Blade | DoT poison | (flavor) | 🔧 → DoT literal dice poison, nebo retire |
| Assassinate (lvl14) | 2.0×/3.2× execute | Assassin: advantage vs nejednavší, **crit na surprised** | ❌ execute → `advantage:true` + (guaranteed crit první kolo = TODO) |

### Sorcerer (full, CHA, d10)

| Ability | Dnes | D&D 5e RAW | Verdikt → návrh |
| --- | --- | --- | --- |
| Fire Bolt | cantrip 1d10 fire | ✅ scaling | ✅ doplnit `damageType fire` |
| Chromatic Orb | 3d8, tier1 | 3d8 zvoleného elementu, spell attack; upcast +1d8 | ✅ |
| Scorching Ray | DoT 0.4×, tier2 | **3 paprsky × 2d6 fire** (= až 6d6), spell attack **instant**; upcast +1 paprsek (+2d6) | 🏷️🔧 → strike `dice 6d6` fire, upcast +2d6; DoT pryč |
| Fireball | 8d6 fire, DEX half, tier3 | ✅ | ✅ |

### Warlock (pact, CHA, d10)

| Ability | Dnes | D&D 5e RAW | Verdikt → návrh |
| --- | --- | --- | --- |
| Eldritch Blast | cantrip 1d10 force | ✅ paprsky 1/2/3/4 (= cantrip scaling) | ✅ doplnit `damageType force` |
| **Hex** | DoT necrotic, tier1 | Bonus action **concentration**: +1d6 necrotic na každý hit vs cíl | 🏷️ → `kind:'buff'`, `riderDice 1d6` necrotic, concentration; DoT pryč |
| Drain Life | drain 1.0×, tier3 | (není warlock spell) → nejbližší **Vampiric Touch**: 3d6 necrotic, heal half | 🏷️🔧 → přejmenovat **Vampiric Touch**, `dice 3d6` necrotic, `drainHealFraction 0.5` z literal dmg, upcast +1d6 |
| Hunger of Hadar (lvl20) | DoT necrotic, tier3 | AoE zóna: 2d6 cold + 2d6 acid recurring | 🔧 → DoT `dice 2d6` (cold), literal per tik |

### Wizard (full, INT, d10)

| Ability | Dnes | D&D 5e RAW | Verdikt → návrh |
| --- | --- | --- | --- |
| Fire Bolt | cantrip 1d10 fire | ✅ | ✅ doplnit `damageType fire` |
| Magic Missile | 3d4+3 force auto-hit | ✅ (3 darty 1d4+1, +dart/slot) | ✅ |
| Scorching Ray | DoT, tier2 | 6d6 fire (3 paprsky), instant; upcast +2d6 | 🏷️🔧 → strike `dice 6d6` fire, upcast +2d6; DoT pryč |
| Fireball | 8d6, DEX half, tier3 | ✅ | ✅ |

### Subclass signature abilities

| Ability | Dnes | D&D 5e RAW | Verdikt → návrh |
| --- | --- | --- | --- |
| Frenzy (berserker) | 2.5× strike | Frenzy: bonus melee attack/turn při Rage | 🏷️ → weapon attack (extra úder) |
| Song of Rest (lore) | heal 2.7×, tier2 | Short-rest heal (mimo combat); Lore ho nemá | 🏷️ → nahradit **Cutting Words** (reaction −dice na enemy roll) nebo heal `dice` flavor |
| Preserve Life (life) | heal 3.0×, tier2 | Channel Divinity: heal 5×level rozdělené, max do půlky HP | 🔧 → heal flat (5×level), bez slotu (Channel Divinity) |
| Wild Shape: Dire Bear (moon) | 2.4× strike | Transform → boj jako šelma | ✅ flavor → weapon attack |
| Heroic Surge (champion) | 2.3× strike | Champion = improved crit (19–20), žádný „surge" | 🏷️ → weapon attack + crit-range passive (TODO) nebo plain attack |
| Flurry of Blows (open hand, 1 Ki) | 2.6× strike | Bonus action: **2 unarmed strikes** za 1 Ki | 🔧 → 2 weapon attacky, `kiCost 1`, bez 2.6× |
| Sacred Weapon (devotion) | 2.4× strike, tier1 | Channel Divinity **buff**: +CHA k attack rolls, 1 min | 🏷️ → buff (attack bonus) nebo weapon attack flavor |
| Colossus Slayer (hunter) | 2.3×/3.2× execute | +1d8 1×/turn vs zraněný cíl | ❌ → weapon attack + `bonusDice 1d8` |
| Backstab (thief) | 2.3×/3.2× execute | (thief nemá; = sneak flavor) | ❌ → weapon attack + sneak `bonusDice` |
| Elemental Burst (draconic) | 2.5× strike, tier2 | Draconic = +CHA na damage roll kouzla | 🔧 → caster nuke literal `dice` (např. 4d6 element) |
| Dark One's Own Luck (fiend) | 2.3× drain, tier2 | (mislabel) DOOL = +d10 na save; Dark One's Blessing = temp HP na kill | 🏷️ → přejmenovat/model temp HP nebo drain literal |
| Overchannel (evocation) | 2.7× strike, tier3 | **Max damage** kouzla ≤5. tier | 🔧 → max-damage nuke (literal dice, max roll) |

### `SIGNATURE_ABILITIES` (Gauntlet draft pool)

| Ability | Dnes | D&D 5e RAW | Verdikt → návrh |
| --- | --- | --- | --- |
| fireball / lightning_bolt | 8d6 + save | ✅ | ✅ |
| guiding_bolt | 4d6 radiant | ✅ | ✅ |
| ice_storm | DoT 1.75× | **2d8 bludgeon + 4d6 cold**, DEX half | 🔧 → strike `dice` (2d8+4d6 ≈ 6d6 cold), DEX half |
| inflict_wounds | drain 2.0×, heal 25 % | Inflict Wounds = **3d10 necrotic** melee spell attack, **NEléčí** | 🏷️ → strike `dice 3d10` necrotic, `drainHealFraction` pryč |
| spiritual_weapon | 1.85× strike | 1d8 + spellMod force, bonus action | 🔧 → strike `dice 1d8+mod` force |
| mass_healing_word | heal 2.8× | 1d4 + spellMod (více cílů) | 🔧 → heal `dice 1d4+mod` |
| flame_blade | 2.0× strike | 3d6 fire melee spell attack (scaling) | 🔧 → strike `dice 3d6` fire |
| vampiric_touch | drain 1.6×, heal 40 % | 3d6 necrotic, heal **half** | 🔧 → `dice 3d6` necrotic, `drainHealFraction 0.5` |
| shield_of_faith | mitigation 40 %/10s | **+2 AC** buff (concentration) | 🏷️ → buff +2 AC (ne 40 % mitigace) |

---

## Stav implementace ✅ (ADR 0036)

Slices A–H **hotové** (commity na větvi `claude/keen-lamport-qoo7nu`, PR #87):
A (engine cesty) · B (caster instant spells) · B2 (DoT tiking + literal) · C (heady
literal) · D (martial + smazat execute) · E (koncentrační buffy) · F (subclass) ·
G (cleanup execute + docs + tento ADR) · H (AoE flag + mass heal). Viz `docs/adr/0036`.
**Mimo rozsah (follow-up):** conditions, AC-buff ability, AoE-damage multi-target,
kniha kouzel (výběr aktivních spellů).

## Slice plán (implementace = ADR 0036)

Každý slice samostatně mergovatelný, **`gear-balance.test.ts` + nové ability testy zelené**.

- **Slice A — engine cesty.** `healDiceSpec`, literal DoT tiky, `bonusDice`(+scaling),
  `riderDice` (concentration buff), `advantage`, `actorSpellMod`. `attackPower` fallback
  zachován → bez regrese. Kontraktní testy primitiv.
- **Slice B — caster damage spells → literal.** Scorching Ray fix (DoT→6d6), Spirit
  Guardians/Moonbeam/Hunger DoT literal, Inflict/Vampiric/Spiritual Weapon/Flame Blade/
  Ice Storm, damageType + save cleanup. Ladit `CASTER_CLASSES` kontrakt.
- **Slice C — heady → literal.** Cure Wounds/Healing Word 1d8/1d4+mod, Lay on Hands /
  Preserve Life flat pool. Re-tune healer self-sustain (ADR 0035) proti harnessu.
- **Slice D — martial → weapon attack + bonus dice.** Sneak Attack (Nd6 scaling),
  Divine Smite (+2d8), Trip/Brutal/Colossus (+1d8/1d10), Reckless/Assassinate advantage,
  Action Surge/Flurry extra attack. **Odstranit `executeBelowPct`/`executeDamageMult`**.
- **Slice E — koncentrační buffy.** Hunter's Mark, Hex (`riderDice +1d6`), Sacred Weapon
  / Shield of Faith (buff AC/attack). Jeden concentration rider naráz.
- **Slice F — subclass + signature pool cleanup** (zbytek tabulek výše).
- **Slice G — docs + ADR 0036.** Aktualizovat `dnd-combat.md`, `spells.md`; conditions
  (stun/prone/disadvantage) explicitně přesunuté do backlogu „Enemy schopnosti".

**Mimo rozsah (follow-up):** conditions (stun/prone/frightened/disadvantage), prepared
spellbook výběr (= „Kniha kouzel", samostatná feature), Wizard learning model.
