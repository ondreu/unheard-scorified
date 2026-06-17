# UI Art Assets — zadání pro malířku (M9 vizuální refresh)

> Seznam veškerého potřebného grafického artu pro nové UI. Dokud art nedorazí,
> používá web **funkční procedurální placeholdery** (barevné rámečkové avatary
> z rasy/classy, emoji emblémy). Tento dokument je **single source of truth** pro
> to, co se má namalovat, v jakém rozměru a kam to v kódu patří.
>
> **Styl:** tmavé fantasy, vanilla-WoW inspirace. Převážně **pixel art** (čitelný
> i v malých velikostech), barevně laděný do palety UI (viz níže). Konzistentní
> světelný zdroj (shora-vlevo), výrazné obrysy, omezená paleta.

## Paleta (sjednoceno s `apps/web/src/app.css`)

| Token            | Hex / význam                  |
| ---------------- | ----------------------------- |
| Pozadí (obsidián)| `#120d09` / `#1a1410`         |
| Zlato (akcent)   | `#d4a04c` → `#f0c870`         |
| Pergamen (text)  | `#f4e9d6`                     |
| Alliance         | `#4a90d9`                     |
| Horde            | `#c0392b`                     |
| Rarity           | common `#c8c8c8`, uncommon `#4ad14a`, rare `#4a90d9`, epic `#b860e0`, legendary `#f0a020` |

---

## 1. Profilové portréty (avatary) — **priorita 1**

Kde: `apps/web/src/lib/components/Avatar.svelte` + registr v
`apps/web/src/lib/cosmetics.ts` → `SHOWCASE_PORTRAITS`.

- **Formát:** PNG s průhledností, čtverec, **256×256 px** (downscaluje se na
  22–84 px → musí být čitelné i malé). Volitelně 2× varianta 512×512.
- **Umístění souborů:** `apps/web/static/portraits/<race>_<class>.png`
  (klíč v `SHOWCASE_PORTRAITS` = `"<race>_<class>"`, např. `human_warrior`).
  Lze dodat i generický per-rasa portrét: `static/portraits/<race>.png`.
- **Rozsah (ideál):** 8 ras × jejich povolené classy (viz `data/races.ts`).
  Pro showcase stačí **pár kombinací** (PM doplní zbytek):
  - `human_warrior`, `human_mage`, `nightelf_druid`, `dwarf_paladin`,
    `orc_warrior`, `undead_warlock`, `tauren_shaman`, `troll_hunter`.
- **Kompozice:** poprsí/hlava postavy zpříma, hrdinský výraz, neutrální pozadí
  (průhledné — rámeček dodá UI). Frakční tón v barvě brnění (Alliance modř /
  Horde červeň) je vítaný, ale ne nutný.
- **Rámeček:** dodává UI (`.frame`, faction barva). Art **bez** rámečku.

## 2. Class emblémy (ikony) — **priorita 1**

Nahrazují emoji v `cosmetics.ts` → `CLASS_EMBLEM`.

- **Formát:** PNG/SVG, **64×64 px**, průhledné pozadí, 1-barevné + jemný stín.
- **Umístění:** `apps/web/static/emblems/class/<classId>.png`.
- **Seznam (9):** warrior, paladin, hunter, rogue, priest, shaman, mage,
  warlock, druid. Symboly à la vanilla class crests.

## 3. Frakční znaky — priorita 2

- Alliance lev, Horde znak. **128×128 px** PNG.
- Umístění: `apps/web/static/emblems/faction/{alliance,horde}.png`.
- Použití: login/landing hero, character select, group strip.

## 4. Role ikony (tank/healer/dps) — priorita 2

Nahrazují emoji v `cosmetics.ts` → `ROLE_META`.

- **32×32 px** PNG. tank = štít (modrá), healer = kříž/lístek (zelená),
  dps = meče (oranžová).
- Umístění: `apps/web/static/emblems/role/{tank,healer,dps}.png`.

## 5. Item slot / rarity rámečky — priorita 2

Pro inventář, inspect a loot.

- Slot ikony (prázdný slot): head, neck, shoulder, chest, waist, legs, feet,
  wrist, hands, back, main_hand, off_hand, finger, trinket — **48×48 px**.
- Rarity rámeček/glow overlay (5 rarit) — **64×64 px**, 9-slice friendly.
- Umístění: `apps/web/static/items/slots/`, `apps/web/static/items/rarity/`.

## 6. Item ikony — priorita 3 (velký balík)

- Per item v `packages/shared/src/data/items.ts` (~30+ a poroste).
- **48×48 px** PNG. Lze začít sdílenými ikonami dle slotu+rarity, postupně
  nahrazovat unikátními.
- Umístění: `apps/web/static/items/icons/<itemId>.png`.

## 7. Zóny / aktivity bannery — priorita 3

- Quest zóny (viz `data/zones.ts`), dungeon/raid hlavičky (viz
  `data/dungeons.ts`, `data/raids.ts`).
- **Šířkové bannery 640×200 px** (pixel art scenérie), tmavnoucí dolů kvůli textu.
- Umístění: `apps/web/static/scenes/<zoneId|dungeonId|raidId>.png`.
- Pozn.: cílově PixiJS scénky (ROADMAP M9) — statický banner je mezikrok.
- **Stav (M9): hotová PixiJS procedurální vrstva.** Místo plochého CSS placeholderu
  se teď renderuje **deterministická procedurální pixel-art scenérie** (`PixiScene.svelte`
  + datový katalog témat `apps/web/src/lib/scenes.ts`; zapojeno přes `SceneBanner.svelte`
  v hlavičkách quests/dungeons/raids + watch). Reálný malovaný banner ji kdykoli
  nahradí — stačí přidat `<img>`/texturu; procedurální scéna je default mezikrok.

## 8. App / PWA ikony — priorita 1 (blokuje M0 TODO)

- PWA ikony **192×192** a **512×512** PNG (+ maskable varianta) do
  `apps/web/static/` (viz ROADMAP M0 „PWA ikony").
- Favicon 32×32.

---

## Jak art zapojit (pro vývojáře/agenta)

1. Soubory nahrát do `apps/web/static/...` dle cest výše.
2. Portréty: doplnit klíč→cestu do `SHOWCASE_PORTRAITS` v `cosmetics.ts`.
   `Avatar.svelte` automaticky preferuje `src` před procedurálním defaultem.
3. Emblémy/role/rarity: nahradit emoji v `CLASS_EMBLEM` / `ROLE_META` cestami
   na `<img>` (komponenty už počítají s budoucí výměnou — drží se v cosmetics).
4. Žádná změna herní logiky — vše je čistě kosmetická vrstva (viz ROADMAP
   princip „cosmetic odděleno od statů").

## Stav placeholderů (co je teď)

> **M14 (ADR 0027):** spuštěna **procedurální pixel-art vrstva** — místo emoji/
> gradientů se generuje deterministický pixel art (2D-canvas pro malé prvky,
> PixiJS pro scénky). Reálný malovaný art ji kdykoli nahradí přes `src` override.

- **Avatary:** **procedurální pixel-art portrét** (`pixelart/portrait.ts` přes
  `PixelPortrait.svelte` v `Avatar.svelte`) — silueta dle rasy (uši/rohy/kly/kůže/
  oči), brnění dle classy, tón dle frakce, deterministicky dle jména. `src`
  override (`SHOWCASE_PORTRAITS`) má přednost pro reálný art.
- **Class / faction / role emblémy:** **procedurální glyfy** (`pixelart/emblems.ts`
  přes `PixelEmblem.svelte`); class crest zapojený v avatar badge, frakční crest
  na `/characters/new`. Emoji (`CLASS_EMBLEM`/`ROLE_META`) zůstává fallback pro
  místa bez zapojeného `PixelEmblem` (postupně se nahradí — viz ROADMAP M14).
- **Rarity:** CSS barvy (rámečky/glow = M14 increment 6).
- **Item/slot ikony:** zatím bez artu (M14 increment 6).
- **Zóna/dungeon/raid scénky:** **PixiJS procedurální pixel art** (deterministický,
  seedovaný) — viz sekce 7. Reálné malované bannery je nahradí později.
