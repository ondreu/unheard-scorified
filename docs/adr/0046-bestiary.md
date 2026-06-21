# ADR 0046 — Bestiář pro hráče (in-game encyklopedie nepřátel)

- **Stav:** přijato (Slice 1 hotový — jádro: browse + odemčení z questů/dungeonů)
- **Kontext:** navazuje na sjednocený enemy model (`data/enemies.ts` katalog,
  ADR 0043), CR + typové obrany (MR-7, ADR 0031) a enemy schopnosti/conditiony
  (ADR 0044/0045). Backlog položka „Bestiář pro hráče". Rozhodnutí PM:
  **odemykání po dokončení obsahu** + **všechny záznamy viditelné** (neobjevené
  zašedlé/grayscale) + **počítadlo zabití** per nepřítel.
- **Rozsah:** `packages/shared` (nový `bestiary.ts`, `templateId` na `EnemyStats`),
  `apps/api` (modul `bestiary/`, migrace `0044`, hooky v `ActivityService` +
  `DungeonService`), `apps/web` (route `/characters/[id]/bestiary`, nav).

## Kontext

Katalog nestvůr (`BESTIARY` v `enemies.ts`) už nese kompletní stat-blocky
(creature type, CR, typ útoku, resistance/vulnerability/immunity, abilities), ale
hráč je nikde neviděl. Chybělo: (1) per-postava sledování „co jsem potkal/zabil",
(2) API read-model, (3) UI.

Instance nepřítele se staví přes `instantiateEnemy(templateId, …)`, ale výsledný
`EnemyDef.id` se může lišit od `templateId` (variantní spawny, např.
`rfc_cultist_b`). Spárovat „poraženou instanci" s katalogovým záznamem proto
nešlo spolehlivě z `id`.

## Rozhodnutí

1. **`EnemyStats.templateId`** — `instantiateEnemy` nově přenáší id šablony do
   instance. Combat/balanc beze změny (jen metadata). Umožní spolehlivě odvodit,
   které katalogové šablony daný obsah obsahuje.

2. **Odemykání po dokončení obsahu** (rozhodnutí PM) — žádné protahování
   `templateId` všemi 6 simulátory ani serializace do run výsledků. Místo toho
   čisté shared helpery odvodí katalogové šablony z definice obsahu:
   - `questTemplateCounts(questId)` — z combat kroků + poolu událostí (`foe.template`).
   - `dungeonTemplateCounts(dungeonId)` — z `encounters[].enemies[].templateId`.
   Generický foe bez `template` (není v katalogu) se ignoruje.

3. **Kill counter + objeveno** — per-postava tabulka `character_bestiary`
   (PK `characterId + enemyTemplateId`, `kills`, `discoveredAt`). Řádek = objeveno;
   `kills` se inkrementuje upsertem při **úspěšném** claimu questu / **vítězném**
   clearu dungeonu (best-effort — selhání zápisu nesmí shodit odměnu). Chybějící
   řádek = neobjevený.

4. **Všechny záznamy viditelné** (rozhodnutí PM) — UI ukáže celý katalog;
   neobjevené v **grayscale + ztlumené**, s počítadlem zabití. Žádné skrývání
   statů. Seskupeno dle creature typu, řazeno dle CR.

5. **Čistá vrstva v `shared`** — `bestiary.ts` (jediný zdroj pravdy): view typy
   (`BestiaryEntry`/`BestiaryEntryView`/`BestiaryView`), `bestiaryEntry`/
   `allBestiaryEntries` (stat-block z katalogu), `buildBestiaryView(progress)`,
   labely/ikony creature typů. Kontraktní testy `bestiary.test.ts`.

## Důsledky

- Migrace `0044_…` (nová tabulka, žádný dopad na stávající data).
- API modul `bestiary/` exportuje `BestiaryService` → `ActivityModule` /
  `DungeonModule` ho injektují pro zápis killů.
- **Pokrytí Slice 1:** idle quest claim + idle/group dungeon clear. **Zbývá
  (Slice 2):** Gauntlet, tahový dungeon (`dungeon-turn`), dungeon-party, aréna/PVP
  + indikátor „nově objeveno". **Slice 3:** filtry (creature type / CR), detail
  stat-block polish, pixel-art rámeček.
- `EnemyStats.templateId` je obecně užitečné (budoucí „kde nepřítele potkat",
  analytika), balanc-neutrální.
