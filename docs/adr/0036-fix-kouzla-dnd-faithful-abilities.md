# ADR 0036 — „Fix kouzla": D&D 5e-věrný audit abilit

- **Stav:** přijato
- **Kontext:** navazuje na ADR 0032 (literal magnitudy) a ADR 0035 (D&D gear + bounded accuracy)
- **Rozsah:** `packages/shared/src/data/abilities.ts` + combat engine + simulátory

## Kontext

Po balance passu (MR-10/ADR 0035) zůstal katalog abilit z části na **ne-D&D**
mechanikách: heady jako „% healing power" (Cure Wounds 230 %), všudypřítomný
**WoW execute** („pod 30 % HP → 2.8×"), a **mislabely** (Hunter's Mark / Hex jako
single údery místo koncentračních buffů; Scorching Ray jako DoT místo 3 okamžitých
paprsků; „Drain Life" = neexistující kouzlo). PM požadavek: **plná D&D 5e věrnost** —
žádné „heal za 140 %". Audit ability-po-abilitě je v `docs/systems/spell-audit.md`.

## Rozhodnutí

Literal D&D **u všeho včetně martial**. Magnitudu kouzel/heads nese **literal dice +
atribut modifikátory**, ne `attackPower × %`. Martial techniky = weapon attack +
případné **bonus kostky** (D&D maneuvery). WoW execute **smazán úplně**.

### Engine (combat.ts / dice.ts)

- **`bonusDice`** (+ `bonusDicePerLevels` scaling) — kostky přičtené k weapon hitu:
  Sneak Attack `+⌈lvl/2⌉d6`, Divine Smite `+2d8`, superiority `+1d8`. Crit zdvojí.
- **`dotDice`** — literal per-tik kostky DoTů (Moonbeam 2d10, Spirit Guardians 3d8);
  `dotTickRaw` = `diceAverage` (deterministicky). Pure-aura DoT = `damageMult 0`.
- **`healDiceSpec`** — literal heal dice + spellcasting mod (`actorSpellMod`) + upcast.
- **`advantage`** — `rollAttack` mode (2× d20): Reckless Attack, Assassinate.
- **`weaponRiderDice`** (`kind: 'buff'`) — koncentrační buff (Hunter's Mark/Hex)
  aplikovaný **pasivně** na celý encounter → +1d6 na každý zásah (`rollHit`).
- **`aoe`** — AoE flag: mass heal ošetří všechny zraněné spojence (raid hned),
  AoE damage „se rozsvítí" s multi-enemy souboji (dungeon overhaul).
- **DoT ticking v quest-run** — quest dosud DoT netickoval (1 zásah); teď reálné tiky.
- **Execute pole smazána** (`executeBelowPct`/`executeDamageMult`) z typu i call-sites.

Všechny cesty napojeny do **všech simulátorů** (quest-run / raid / gauntlet / pvp).
PVP dostal i literal spell dice (dosud chyběly); PVP balanc zůstává per roadmap
pozastaven.

### Data (vybrané)

- **Heady → literal:** Cure Wounds 1d8+mod, Healing Word 1d4+mod (+upcast);
  Lay on Hands / Preserve Life = flat pool bez slotu (Channel Divinity).
- **Martial → weapon + bonus dice / extra-attack:** Sneak Attack `+⌈lvl/2⌉d6`,
  Trip/Brutal/Colossus `+1d8/1d10`, Action Surge/Frenzy/Flurry = `damageMult` = počet
  útoků; Reckless/Assassinate advantage. **Execute pryč.**
- **Mislabely opraveny:** Hunter's Mark / Hex = koncentrační buff `+1d6`/hit;
  Scorching Ray = 6d6 fire instant (3 paprsky); Drain Life → Vampiric Touch;
  Inflict Wounds neléčí; Shield of Faith zůstává defensive (AC-buff = follow-up).

## Důsledky

- **Balanc:** literal-heal healeři vedou delší attrition souboje (D&D: léčení v boji
  je pomalé) — caster swing strop v `gear-balance.test.ts` 16→18. Rogue se Sneak
  Attack 10d6 je naked-viable burst → kontrakt „gear má váhu" bere i HP margin.
  Geared on-level boss win drží (martial > 0.85, caster > 0.65).
- **Magnitudy gearu/base/enemy z ADR 0035 nedotčené** (jen ability mechanika).
- **Conditions** (stun/prone/frightened/disadvantage z Vicious Mockery) = mimo rozsah
  → backlog „Enemy schopnosti / conditions".
- **AoE damage multi-target** čeká na multi-enemy souboje (dungeon overhaul).
- **AC-buff** ability (Sacred Weapon, Shield of Faith) = follow-up (engine zatím
  nemá dočasný AC buff).

Verifikace: `pnpm typecheck/test/lint` zelené (shared 497 testů + harness kontrakt),
web/api typecheck zelené.
