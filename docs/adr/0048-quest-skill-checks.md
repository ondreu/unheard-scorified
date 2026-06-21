# ADR 0048 — Skill checky v questování (D&D ability checks, auto-resolved)

- **Stav:** přijato (hotovo)
- **Kontext:** backlog položka „Skill checky v questování" (sekce Questy & příběh).
  Navazuje na quest narrative engine (M9, ADR 0024), D&D staty/proficiency bonus
  (MR-1) a Backgrounds se `skillProficiencies` (MR-3, dosud jen lore na profilu).
  Připravuje půdu pro **MIL 1 — Kampaně** (dialogové volby s checky) a „Přepis
  questového příběhu".
- **Rozsah:** `packages/shared` (nový `skills.ts` + `QuestSkillCheckStep` +
  engine), `apps/api` (proficiency z Backgroundu do profilu, reward gating),
  `apps/web` (render skill-check kroku v quest logu). **Bez DB migrace.**

## Kontext

Questy jsou **idle, auto-resolved** (rozhodnutí PM, ADR 0024): hráč pošle postavu,
ta se na pozadí „odehraje" a při claimu se deterministicky ze seedu vygeneruje
příběhový log (narativní beaty + auto-resolved combaty). Combat **nelze prohrát**
(flavor) kromě opt-in combat-objective questů.

Skill proficiencies z Backgroundu (`BACKGROUNDS[].skillProficiencies`, např.
Persuasion/Insight) byly dosud jen lore na profilu — **mechanicky se nikde
nepoužívaly**. Chyběla kanonická mapa skill → atribut a aplikace proficiency bonusu.

## Rozhodnutí PM (volba režimu)

1. **Auto-resolved (idle), ne interaktivní volba.** Skill check se vyhodnotí sám
   při claimu (jako auto-resolved combat) — hráč nevolí přístup, jen sleduje, co se
   stalo. Interaktivní volba přístupu (Persuade/Intimidate/Sneak) porušuje idle
   smyčku a patří až do **MIL 1 — Kampaně**.
2. **Dopad = bonus/penalta k odměně** (ne jen flavor, ne gating dokončení). Úspěch
   zvyšuje a neúspěch snižuje XP+zlato, ale quest se **vždy dokončí** (idle-safe).

## Rozhodnutí (implementace)

1. **`skills.ts` (sdílené jádro).** 18 D&D skillů → řídící atribut
   (`SKILL_ABILITY`, stringy se shodují s `BACKGROUNDS[].skillProficiencies`).
   `skillCheck(actor, rng, skill, dc)` = d20 + atribut modifikátor (+ proficiency
   bonus, je-li postava ve skillu proficient) vs DC. Sdílí `rollSave` primitiv
   (d20 + bonus vs DC) → žádná duplikace hodu. `skillModifier`/`isProficientInSkill`
   helpery. Determinismus přes `SeededRng` (anti-cheat, reprodukovatelnost).

2. **Proficiency zdroj = Background.** `CombatActor.skillProficiencies` +
   `CombatProfileInput.skillProficiencies` (optional, graceful). `deriveCombatProfile`
   je protáhne; `RotationService.buildCombatProfile` je naplní z
   `BACKGROUNDS[character.background].skillProficiencies`. Class/race skill
   proficiencies = **follow-up**.

3. **`QuestSkillCheckStep`** (`data/quests.ts`): `{ kind:'skill_check', skill, dc,
   intro, success, failure, reward? }`. Auto-resolved při claimu: hod **větví
   narativ** (`success`/`failure` text) a **upraví odměnu**. Default delty:
   úspěch `+0.15`, neúspěch `-0.10` (laditelné per krok přes `reward`).

4. **Engine** (`quest-run.ts`): `simulateQuestRun` obslouží skill-check krok —
   hodí check, do logu dá výsledek + detail hodu (`QuestStepResult.skill/dc/
   rollTotal/rollNatural/success/proficient`), sčítá `rewardDelta`. Výstup nese
   `QuestRunResult.rewardMultiplier` (clamp `0.5..2.0`); `1.0` = žádné checky.

5. **Reward gating** (`ActivityService.claim`): pro úspěšný (ne-failed) quest se
   `reward.xp`/`reward.gold` vynásobí `run.rewardMultiplier` (loot beze změny).
   Quest se vždy dokončí — idle progres nikdy nezamrzne.

6. **Web**: quest log dostal větev pro `skill_check` (🎲 skill + DC + výsledek +
   `✦` proficiency indikátor + větvený narativ).

## Důsledky

- **Balanc**: skill check mění XP/zlato o ±10–15 % per check (clamp), loot ani
  combat beze změny. Questy bez checku mají `rewardMultiplier === 1` (zpětně
  kompatibilní — žádná regrese).
- **Background dostal mechanický dopad** (dosud čistě kosmetický) — proficient
  postava uspěje v checku častěji.
- **Bez DB migrace, bez změny API tvaru** (nové pole jsou optional, graceful).
- **Idle zachováno**: žádná nová nutná interakce; check je deterministický flavor
  nad odměnou, jako auto-resolved combat.

## Follow-up

- Class/race skill proficiencies (teď jen Background).
- Interaktivní volba přístupu (Persuade/Intimidate/…) → MIL 1 Kampaně.
- Skill-check kroky v repeatable událostech (`QuestEventDef`) a v grindu.
- Bohatší rozsetí checků napříč questline (zatím ukázky v Dawnhollow Vale).
