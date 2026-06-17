# Pixel-art assets — procedurální fallback

Všechny vizuály níže jsou generovány procedurálně (deterministicky, `SeededRng`, žádný `Math.random`).
Pokud chceš nahradit konkrétní asset ručním pixel artem, stačí přidat `src` prop do příslušné komponenty
(nebo nahradit URL ve funkci vracející CSS) — procedurální kód zůstane jako fallback.

---

## 1. Character portrait

**Vizuál:** 32–84 px, side-profile busta. Tvar těla, barva kůže a vlasů odvozeny z race+gender.
Vpravo dole class crest, vlevo nahoře faction seal (velká varianta).

| | |
|---|---|
| **Generátor** | `apps/web/src/lib/pixelart/portraits.ts` |
| **Funkce** | `drawPortrait(p, {race, klass, gender, faction})` · `portraitDataUrl(race, klass, gender, faction, dim)` |
| **Komponenty** | `Avatar.svelte` (dim=32), `PortraitShowcase.svelte` (dim=48–84) |
| **Swap** | `Avatar.svelte` má `src` prop — když je nastavena, přeskočí procedurální art |
| **Reálný art** | 1 PNG per `race+gender` (class crest lze overlayovat zvlášť) |

---

## 2. Item slot icons

**Vizuál:** 20–28 px. Slot-specifický glyf (meč, štít, helma, rukavice, boty, prsten, náhrdelník, plášť, trinket).
Barevný rámeček dle rarity: šedá=common, zelená=uncommon, modrá=rare, fialová=epic, oranžová=legendary.
Výplň glyfu tintována dle armor class: béžová=cloth, hnědá=leather, ocelová=mail, stříbrná=plate.

| | |
|---|---|
| **Generátor** | `apps/web/src/lib/pixelart/items.ts` |
| **Funkce** | `drawItemIcon(p, {slot, rarity, armorClass})` · `itemIconDataUrl(slot, rarity, armorClass, dim)` |
| **Lookup** | `itemIconMetaById(itemId)` → `{slot, rarity, armorClass}` |
| **Komponenta** | `PixelItemIcon.svelte` |
| **Kde se renderuje** | inventory, equipped gear, vendor, auctions, combat loot, inspect panel |
| **Swap** | přidat `src?: string` do `PixelItemIcon.svelte` |
| **Reálný art** | 1 PNG per `itemId` (full), nebo per `slot+rarity+armorClass` (generické) |

---

## 3. Ability icons

**Vizuál:** 28 px. Tvar dle `kind`:
- `strike` — zkřížené meče
- `dot` (damage over time) — plamen + tečky
- `drain` — spirála/siphon
- `heal` — zaoblený kříž
- `shield` / `mitigation` — štít

Barva z klíčových slov v názvu: fire=oranžová, frost=světle modrá, shadow=fialová, holy=zlatá, nature=zelená, arcane=violet, physical=rezavá.

| | |
|---|---|
| **Generátor** | `apps/web/src/lib/pixelart/abilities.ts` |
| **Funkce** | `abilityColor(name, kind)` · `drawAbilityIcon(p, {name, kind})` · `abilityIconDataUrl(name, kind, dim)` |
| **Komponenta** | `PixelAbilityIcon.svelte` |
| **Kde se renderuje** | rotation builder, talent capstone nodes, `AbilityDetail.svelte`, `CombatLog.svelte` |
| **Swap** | přidat `src?: string` do `PixelAbilityIcon.svelte` |
| **Reálný art** | 1 PNG per `abilityId` (nebo name slug) |

---

## 4. Mount icons

**Vizuál:** 52 px. Side-profile silueta čelem vpravo. Čtyři druhy dle klíčových slov v id:
- `horse` — tělo + 4 nohy + krk + hlava + hříva + ocas
- `wolf` — nízká hlava + špičaté uši + huňatý ocas (disc)
- `cat` — štíhlé tělo + dvě uši + zahnutý ocas + pruhy
- `gryphon` — 2 nohy + křídla + orlí hlava + zobák

Každý mount id dostane seedovaný tint barvy (stejné id = stejná barva).
**Epic tier** = zlatý rámeček + rohové jiskry; basic = tmavě šedý rámeček.

| | |
|---|---|
| **Generátor** | `apps/web/src/lib/pixelart/mounts.ts` |
| **Funkce** | `mountKind(id)` · `drawMount(p, {id, tier})` · `mountIconDataUrl(id, tier, dim)` |
| **Komponenta** | `PixelMount.svelte` |
| **Kde se renderuje** | mounts page (listing) |
| **Swap** | přidat `src?: string` do `PixelMount.svelte` |
| **Reálný art** | 1 PNG per mount id (nebo per `kind+tier` pro generické skiny) |

---

## 5. Zone / dungeon / raid card backgrounds

**Vizuál:** 96×54 px mini-scene thumbnail jako CSS background (`::before`, 16% opacity).
Každý zone theme má vlastní krajinu:

| Téma | Krajina |
|---|---|
| `forest` | stromy, travnatá půda, nebe |
| `cave` | stalaktity, skalnatý strop, skály |
| `city` | budovy, kamenná dlažba |
| `desert` | písečné duny, slunce |
| `mountain` | zasněžené vrcholy, mraky |
| `swamp` | bahnité bubliny, mlha |
| `sky` | oblaka, vzdušný vzduch |
| `undead` | kosti, šedá mlha |
| `demonic` | fel oheň, temnota |
| `celestial` | hvězdy, vesmírné pozadí |
| `underwater` | korály, bubliny |

Seedováno per zone id — stejná zóna = stejné pozadí.

| | |
|---|---|
| **Generátor** | `apps/web/src/lib/pixelart/scene-bg.ts` |
| **Funkce** | `sceneCardUrl(id, faction)` · `sceneCardStyle(id, faction)` (vrací CSS custom property) |
| **Kde se renderuje** | dungeon cards, raid cards, quest cards |
| **Swap** | nahradit URL v `sceneCardStyle()` za `/assets/scenes/${id}.png` |
| **Reálný art** | 1 PNG (96×54 nebo 2× pro retina) per dungeon/raid/zone id |

---

## 6. Faction backdrop tile

**Vizuál:** 64×64 px tileable textura jako full-page pozadí (fixed, z-index:-1, 128px render).
Teplé tečky + zlaté jiskry. Alliance tint = chladná modro-šedá, Horde tint = teplá červeno-hnědá.

| | |
|---|---|
| **Generátor** | `apps/web/src/lib/pixelart/backdrop.ts` |
| **Funkce** | `drawBackdropTile(ctx, faction)` · `backdropDataUrl(faction)` · `backdropStyle(faction)` |
| **Kde se renderuje** | `characters/[id]/+layout.svelte` → `.app-backdrop` div |
| **Swap** | nahradit URL v `backdropStyle()` za `/assets/backdrop-${faction}.png` |
| **Reálný art** | 2 PNG (64×64 seamless): `backdrop-alliance.png`, `backdrop-horde.png` |

---

## 7. Card hover particles (PixiJS animace)

**Vizuál:** Animované plovoucí částice v `<canvas>` overlay přes dungeon/raid/quest kartu, jen při hoveru.
Částice stoupají nahoru, vytrácejí se, barva dle zone accent color. Respektuje `prefers-reduced-motion`.

| | |
|---|---|
| **Komponenta** | `apps/web/src/lib/components/CardAccent.svelte` |
| **Kde se renderuje** | dungeon/raid/quest card lists (`{#if hoverId === id}<CardAccent/>`) |
| **Swap** | čistě kosmetická animace, nehradí se pixelart; pro vypnutí smazat `<CardAccent>` z routů |

---

## Přehledová tabulka

| Asset | Velikost | Generátor | Komponenta | Swap |
|---|---|---|---|---|
| Character portrait | 32–84 px | `pixelart/portraits.ts` | `Avatar`, `PortraitShowcase` | `src` prop na Avatar |
| Item slot icon | 20–28 px | `pixelart/items.ts` | `PixelItemIcon` | přidat `src` prop |
| Ability icon | 28 px | `pixelart/abilities.ts` | `PixelAbilityIcon` | přidat `src` prop |
| Mount icon | 52 px | `pixelart/mounts.ts` | `PixelMount` | přidat `src` prop |
| Zone scene card bg | 96×54 px | `pixelart/scene-bg.ts` | CSS via `sceneCardStyle()` | nahradit URL |
| Faction backdrop tile | 64×64 px | `pixelart/backdrop.ts` | CSS via `backdropStyle()` | nahradit URL |
| Card hover particles | canvas overlay | `CardAccent.svelte` | inline v dungeon/raid/quest routech | smazat komponentu |

---

## Priorita náhrady ručním artem

1. **Character portrait** — nejviditelněji, nejvíce charakter
2. **Item slot icons** — zobrazují se všude (inventory, loot, vendor, auctions)
3. **Zone scene backgrounds** — vizuální nálada karet
4. **Ability icons** — v rotaci, talentech, combat logu
5. **Mount icons** — jen na mount stránce
6. **Faction backdrop tile** — subtilní, stačí jednoduchá textura
7. **Card particles** — čistá animace, nevyžaduje náhradu
