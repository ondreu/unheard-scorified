# Bug log — známé chyby k pozdějšímu fixu

> Lehký seznam nalezených bugů, které čekají na opravu. Po fixnutí přesuň do
> „Vyřešeno" se zmínkou commitu/PR.

## Otevřené

### BUG-001 — Activity karta zobrazuje jen quest/gather, ne dungeon/raid/arénu

- **Symptom:** Na hlavním přehledu postavy (`characters/[id]`) se v „Activity"
  kartě ukazují jen běžící **quest** a **gather/craft** aktivity. Běžící
  **dungeon / raid / arena** se v kartě nezobrazí. Navíc když přepnu kartu/stránku,
  běžící aktivita „skončí" (zmizí z přehledu).
- **Příčina (pravděpodobná):** Overview čte jen `GET /characters/:id/activity`
  (model `character_activities` → quest/gather/craft). Dungeon/raid/arena běží přes
  vlastní run/match modely (`raid_runs`, `arena_*`), které activity endpoint nezná.
  „Skončí při přepnutí" = stav je jen v komponentě, ne sdílený; po navigaci se
  nenačte zpět běžící run.
- **Návrh fixu:** Sjednotit „co právě běží" do jednoho přehledu — overview by měl
  dotázat i aktivní dungeon/raid/arena run (nebo zavést `GET /characters/:id/current`
  agregující všechny běžící aktivity) a zobrazit odkaz „Watch fight →". Stav držet
  ve sdíleném storu, ať přežije navigaci.
- **Priorita:** střední (UX/čitelnost běžících aktivit).
