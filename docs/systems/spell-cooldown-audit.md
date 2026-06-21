# Audit cooldownů spellů

> **Účel:** projít cooldowny **všech** combat abilit (`packages/shared/src/data/abilities.ts`)
> a ověřit (1) konzistenci s D&D modelem — **spell slot = zdroj, cooldown = pacing** —
> a (2) vzájemnou vyváženost. Audit-only položka z roadmapy. Regresní kontrakt drží
> `spell-cooldown-audit.test.ts`.
>
> Navazuje na `spell-audit.md` (ADR 0036 — magnitudy/mechaniky). Tady **neřešíme damage**,
> jen `cooldownSec` a jeho převod na tahy.

## Jak engine cooldown používá

`SignatureAbility.cooldownSec` má **dvě role** podle simulátoru:

| Simulátor | Model | Použití `cooldownSec` |
| --- | --- | --- |
| quest-run / raid / pvp (**spojité**) | timeline (sekundy) | `readyAt[id] = t + cooldownSec` — reálná prodleva mezi sesláními |
| dungeon-run / dungeon-party / gauntlet (**tahové**) | kola | `cooldownTurns = max(1, round(cooldownSec / 3))` (TURN_SEC = 3 všude) |

Leveled kouzlo (tier ≥ 1) je navíc gatované **spell slotem** (MR-4): cooldown řídí, jak
často ho můžeš seslat *uvnitř* boje, slot řídí, kolikrát *celkem* mezi Long Resty.
Cantripy (tier 0) a martial techniky slot nemají → gatuje je **jen** cooldown (+ Ki/Rage).
Tenhle dvojí model je **v pořádku a D&D-konzistentní**: slot = zdroj (5e), cooldown =
herní pacing, aby hráč nevysypal celý nuke list v 1. kole.

## Datová mapa (140 abilit)

Distinktní cooldowny v katalogu a jejich převod na tahy:

| cooldownSec | tahy (round/3) | typické použití |
| --- | --- | --- |
| 0 | 0 (vždy) | basic úder |
| 3 | 1 | Martial Arts |
| 4 | 1 | cantripy (blaster), Magic Missile, Sneak Attack, Reckless |
| 5 | 2 | Healing Word, cantripy (cleric/druid/bard), Divine Smite |
| 6 | 2 | Cure Wounds, Chromatic Orb |
| 7 | 2 | Guiding Bolt, Thunderwave, smity, tier-1/2 striky |
| 8 | 3 | Scorching Ray, Shatter, tier-2/3 nuky, DoTy |
| 9 | 3 | Fireball, Lightning Bolt, tier-3/4 nuky |
| 10 | 3 | Cone of Cold, Flame Strike, tier-5 nuky |
| 11 | 4 | Disintegrate (tier 6) |
| 22 / 24 / 26 | 7 / 8 / 9 | no-slot „big" abilities (Shield of Faith, Bear Spirit, Lay on Hands) |

Spread leveled kouzel per tier: t1 = 4–9, t2 = 6–10, t3 = 6–9, t4 = 9, t5 = 10, t6 = 11.
Hrubě monotónní s tierem (vyšší tier → delší cd) → **základní vzorec sedí**.

## Nálezy

Legenda: ✅ opraveno · ⚠️ doporučení k rozhodnutí PM (balanc-citlivé, neaplikováno) · ℹ️ poznámka.

### ✅ F1 — Paladin Cure Wounds měl odlišný cooldown (opraveno)

Jediná **objektivní** nekonzistence: `paladin_cure_wounds` měl `cooldownSec: 4`, zatímco
**všechny** ostatní Cure Wounds (bard/cleric/druid/ranger) mají `6`. Stejné kouzlo →
stejný cooldown. Opraveno na `6`. Zamčeno testem („same spell name shares one cooldown").

### ⚠️ R1 — Turn-bucket collapse (hlavní nález pro tahové režimy)

`round(cooldownSec / 3)` slévá jemný cd gradient do hrubých kbelíků:

- cd **3, 4** → **1 tah**
- cd **5, 6, 7** → **2 tahy**
- cd **8, 9, 10** → **3 tahy**
- cd **11** → 4 tahy

Důsledek: pečlivě odstupňované cooldowny **8 / 9 / 10** (tier-2 Scorching Ray vs tier-3
Fireball vs tier-5 Cone of Cold) jsou v **dungeon-turn / dungeon-party / Gauntletu**
**nerozlišitelné** — všechny 3 tahy. Stejně tak 5/6/7 = 2 tahy. Rozdíl je živý **jen**
ve spojitých simech (quest/raid/pvp). Tahové režimy = tam, kde hráč cooldown reálně
vnímá, ho ignorují.

**Možnosti (rozhodnutí PM):**
- **A (doporučeno) — cooldowny na násobky TURN_SEC (3):** posunout leveled cd na
  `{6, 9, 12}` (= 2 / 3 / 4 tahy) místo `{6,7,8,9,10}`, aby každá hodnota přežila `/3`.
  Předvídatelné v obou modelech, minimální posun magnitud.
- **B — opřít se plně o sloty:** leveled kouzla dostanou **uniform cd per tier**
  (cooldown přestane být balanc-pákou, slot je jediný gate). Nejčistší vůči D&D, ale
  ztratí within-fight pacing nuků.
- **C — nechat tak:** akceptovat, že tahové režimy rozlišují cooldown jen hrubě.

### ⚠️ R2 — Magic Missile (tier 1) má cantripový cooldown

`Magic Missile` cd **4** = 1 tah → castuje se **každé kolo** (dokud jsou sloty), stejně
často jako cantrip. Je to jediné leveled kouzlo v 1-tahovém kbelíku. Obhajitelné
(auto-hit, nízký dmg 3d4+3), ale „leveled spell na cadenci cantripu" je odchylka.
Návrh: zvážit cd 6 (= 2 tahy), pokud má být seslání slotu znát. **Neaplikováno** (balanc).

### ⚠️ R3 — DoT cooldown < doba trvání DoT

Pár DoTů lze přeseslat **dřív, než doběhne** předchozí (cd < `dotDurationSec`):
Vicious Mockery (5/6s), Witch Bolt (7/8s), Moonbeam (8/9s), Spirit Guardians (8/9s),
Serpent Arrow (9/10s). Může vést k překryvu/refreshi DoTu (závisí na enginu). Pokud
overlap není záměr, srovnat `cooldownSec ≥ dotDurationSec`. **Neaplikováno** (balanc).

### ℹ️ N1 — Gauntlet draft pool běží o ~1s déle

`SIGNATURE_ABILITIES` (Gauntlet draft, samostatný pool) má u shodných kouzel mírně
delší cd než class verze (fireball 10 vs 9, ice_storm 10 vs 9, inflict_wounds 8 vs 7).
Jiný balanc kontext (roguelite draft) → **akceptováno**, jen zaznamenáno (kontrakt
same-name se na tento pool záměrně nevztahuje).

### ℹ️ N2 — No-slot „big" abilities tvoří koherentní vrstvu

Lay on Hands / Preserve Life (26s), Bear Spirit (24s), Arcane Ward / Shield of Faith
(22s) = dlouhý cooldown **bez slotu** (D&D: per-rest pool / Channel Divinity / koncentrace).
Vzájemně konzistentní, oddělené od slot-gated kouzel. Kontrakt navíc hlídá, že žádné
**slot-gated** kouzlo do téhle „big cooldown" pásmy nespadne (ceiling 12s).

## Regresní kontrakt (`spell-cooldown-audit.test.ts`)

Zamčené invarianty (hlídají hrubé regrese, ne přesné balanc číslo):

1. Každý cooldown je konečné nezáporné číslo.
2. Nenulový cooldown je ≥ TURN_SEC (3 s) → vždy dá ≥ 1 tah (žádný „phantom" sub-turn cd).
3. **Stejné kouzlo (jméno) má napříč class pooly jeden cooldown** (F1).
4. Cantripy (tier 0) ≤ 6 s (at-will filler, ne slot-gated).
5. Žádné leveled kouzlo (tier ≥ 1) není levnější než nejlevnější cantrip (slot už gatuje).
6. Leveled kouzla ≤ 12 s (dlouhé cd = jen no-slot abilities, viz N2).

## Závěr

Cooldown model je **zdravý a D&D-konzistentní** (slot = zdroj, cooldown = pacing) a
vzorec „vyšší tier → delší cd" drží. Našla se **1 objektivní chyba** (F1, opravena) a
**3 balanc-citlivá doporučení** (R1–R3) k rozhodnutí PM, z nichž **R1 (turn-bucket
collapse)** má největší dopad — pokud chce PM, aby byl cooldown v tahových režimech
reálně cítit, stojí za zvážení varianta A (cooldowny na násobky 3).
