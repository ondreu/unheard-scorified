# ADR 0027 — Procedurální pixel-art vrstva (avatary, emblémy, ikony, scénky)

Status: Accepted · Datum: 2026-06-17

## Kontext

M9 přinesla první PixiJS rendering vrstvu (`PixiScene.svelte` + katalog
`scenes.ts`): deterministická procedurální pixel-art **scenérie** pro hlavičky
zón/dungeonů/raidů. Funguje dobře a vypadá slušně. Zbytek UI ale vizuálně
zaostává — kosmetické prvky jsou **emoji + CSS gradienty** (placeholdery z asset
specu `docs/systems/ui-art-assets.md`):

- **Avatary**: CSS gradient z rasy+classy + iniciála jména + emoji emblém.
- **Class / role / faction emblémy**: emoji (`CLASS_EMBLEM`, `ROLE_META`).
- **Spelly / abilities**: žádný vizuál (jen text v combat logu / talentech).
- **Pozadí karet a stránek**: ploché panely, scénky jen v top banneru.
- **Itemy**: bez ikon.

PM zadal **výrazné rozšíření pixel-art grafiky „všude"** — od oživení karet, přes
pozadí (celková i per-karta dle zóny), obrázky spellů, class, ras, frakcí až po
profilové portréty — a vlastní milník na roadmapě (**M14**) s hlubokou
implementací. Volba přístupu (rozhodnutí PM): **plně procedurální, deterministické**
(žádné externí PNG; pokračovat ve směru z M9).

## Rozhodnutí

### Dva renderery, jedno sdílené jádro

1. **2D `<canvas>` sprite vrstva** (`apps/web/src/lib/pixelart/`) pro **malé,
   statické, hojně se opakující** prvky — avatary, emblémy, (budoucí) ikony
   spellů/itemů. Záměrně **NE PixiJS/WebGL**: takových prvků je na stránce mnoho
   (top bar, group strip, chat, profily, inventář) a počet WebGL kontextů je v
   prohlížeči tvrdě omezený → desítky Pixi `Application` by appku položily.
   Canvas2d je levný a škáluje.
2. **PixiJS vrstva** (`PixiScene.svelte`) zůstává pro **velké/animované scénky**
   (bannery, budoucí pozadí, oživení karet částicemi).

Obě sdílejí princip: **deterministické** (vše přes `SeededRng`/`seedFromString`
ze `@game/shared` — žádný `Math.random`, viz CLAUDE.md) a **data-driven**
(katalog vzhledu = jediný zdroj pravdy; přidání varianty = úprava dat, ne
rendereru).

### Pixel-art jádro (`pixelart/core.ts`)

`Painter` — tenký wrapper nad `CanvasRenderingContext2D` kreslící v logických
pixelech (canvas `dim×dim`, CSS upscale s `image-rendering: pixelated`).
Primitiva: `px/rect/sym(metrický)/disc/ellipse/line(Bresenham)/triangle` +
barevné helpery `hex/shade/mix`. Reexport `SeededRng/seedFromString`.

### Portréty (`pixelart/portrait.ts` + `PixelPortrait.svelte`)

`drawPortrait` vykreslí bystu deterministicky dle rasy/classy/frakce a `seedKey`
(jméno → varianta vlasů/vousů). Katalogy:

- `RACE_LOOK` (8 ras): barva kůže, pool vlasů, oči (+ `eyeGlow` u nightelf/
  undead), uši (`short`/`long`), `horns` (tauren), `tusks` (orc/troll), proporce
  hlavy, vousy (`always`/`maybe`/`none`).
- `CLASS_LOOK` (9 class): barva brnění + lemu (ramena/pauldrony).
- Frakce → tón pozadí.

### Emblémy (`pixelart/emblems.ts` + `PixelEmblem.svelte`)

Deterministické **geometrické glyfy** (žádná náhoda): 9 class crestů (meče/
kladivo/luk/dýka/kříž/blesk/hvězda/lebka/tlapa), 2 frakční znaky (štít),
3 role ikony (tank/healer/dps). Barvy v `CLASS_GLYPH_COLOR` (vanilla-style).

### Zapojení (increment 1)

- `Avatar.svelte` default = `PixelPortrait` + class crest badge (`PixelEmblem`).
  Override reálným artem (`AvatarLook.src` / `SHOWCASE_PORTRAITS`) má dál přednost
  → kompatibilní s pozdější malovanou grafikou i monetizací skinů.
- `/characters/new`: frakční crest v hlavičce (reaguje na zvolenou rasu).
- Avatar se používá napříč appkou → portréty se projeví všude (top bar, group
  strip, chat, inspect profil, výběr/tvorba postavy).

## Důsledky

- **Pozitivní:** konzistentní vizuál zdarma škálující na nový obsah (nová rasa/
  class = pár řádků dat); žádné externí assety/CDN; deterministické (testovatelné,
  cache-friendly); kosmetika oddělená od statů (monetizace later beze změny jádra).
- **Náklady / kompromisy:** procedurální art nedosáhne kvality ručně malovaného →
  `src` override zůstává cestou k upgradu; canvas2d (ne WebGL) je vědomá volba
  kvůli počtu prvků.
- **Bez dopadu na herní logiku, API, DB ani determinismus simulace** — čistě
  prezentační vrstva ve `web`.

## Rozsah po krocích (viz ROADMAP M14)

Increment 1 (toto ADR): **avatary + emblémy**. Další increment­y (spelly,
pozadí karet/stránek dle zóny, animované oživení karet, ikony itemů/slotů/
rarity) staví na témže jádře — viz milník **M14** v `docs/ROADMAP.md`.
