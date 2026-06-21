/**
 * Lookup helpery pro combat log UI (klik na jméno NPC / ability → detail).
 * Combat eventy nesou jen jména (stringy), ne id — tyhle helpery dohledají
 * statická data podle jména z existujících katalogů (jediný zdroj pravdy:
 * `data/dungeons.ts`, `data/abilities.ts`).
 *
 * Web (PlayerProfile-like NPC karta + ability detail) z nich jen čte; žádná
 * herní logika tu není (čistá data) → bezpečné importovat na FE i BE.
 */
import { DUNGEONS, dungeonEnemies } from './data/dungeons';
import { crEnemyMagnitude } from './combat';
import { crForContentLevel, crStatGuide } from './data/damage';
import { bestiaryEntry, type BestiaryEntry } from './bestiary';
import {
  SIGNATURE_ABILITIES,
  CLASS_BASELINE_ABILITIES,
  EXTRA_SPELLS,
  SUBCLASS_ABILITIES,
  type SignatureAbility,
} from './data/abilities';
import { BESTIARY, BESTIARY_IDS, enemyAbilityToSignature } from './data/enemies';

/** Ability NPC bosse (jen jméno + cooldown + damage mult — z raid dat). */
export interface NpcAbility {
  name: string;
  cooldownSec: number;
  damageMult: number;
}

/** Public NPC view pro „inspect" kartu nepřítele (staty + případné ability). */
export interface NpcInfo {
  name: string;
  maxHealth: number;
  attackPower: number;
  swingInterval: number;
  armor: number;
  /** Armor Class (d20 vs AC) — z CR doporučení (DMG, `crStatGuide`). */
  armorClass: number;
  isBoss: boolean;
  /** Kde se NPC vyskytuje (dungeon/raid název) — flavor do karty. */
  source: string;
  abilities: NpcAbility[];
  /**
   * Katalogový stat-block (creature type / resistance / vulnerability / immunity /
   * ability popisy), když NPC nese katalogovou identitu (`templateId`,
   * `instantiateEnemy`). Sdílí datový základ s bestiářem (`bestiaryEntry`) →
   * inspect karta v combatu = stejný stat-block jako bestiář. `undefined` =
   * ad-hoc nepřítel mimo katalog.
   */
  bestiary?: BestiaryEntry;
}

let enemyIndex: Map<string, NpcInfo> | null = null;

/** Lazy index všech NPC (dungeon trash/bossové) podle jména. */
function buildEnemyIndex(): Map<string, NpcInfo> {
  const index = new Map<string, NpcInfo>();
  for (const d of Object.values(DUNGEONS)) {
    for (const e of dungeonEnemies(d)) {
      if (index.has(e.name)) continue;
      // HP/poškození se odvozují z Challenge Ratingu (ADR 0032) — stejně jako v
      // boji (`buildEnemyActor`). Explicitní CR přebíjí, jinak z levelu (+boss).
      const isBoss = e.isBoss ?? false;
      const cr = e.challengeRating ?? crForContentLevel(e.level ?? d.requiredLevel, isBoss);
      const mag = crEnemyMagnitude(cr, isBoss);
      // Katalogová identita (`templateId`) → bestiářový stat-block (creature type,
      // obrany, popsané ability). AC z CR doporučení (DMG), shodně s `buildEnemyActor`.
      const template = e.templateId ? BESTIARY[e.templateId] : undefined;
      const entry = template ? bestiaryEntry(template) : undefined;
      index.set(e.name, {
        name: e.name,
        maxHealth: mag.maxHealth,
        attackPower: mag.attackPower,
        swingInterval: e.swingInterval,
        armor: e.armor ?? 0,
        armorClass: e.armorClass ?? crStatGuide(cr).armorClass,
        isBoss,
        source: d.name,
        abilities: (template?.abilities ?? []).map((a) => ({
          name: a.name,
          cooldownSec: a.cooldownSec,
          damageMult: a.damageMult,
        })),
        ...(entry ? { bestiary: entry } : {}),
      });
    }
  }
  // Fallback: katalogové šablony, které nejsou v žádném dungeonu (gauntlet/quest
  // nepřátelé táhnou jména z katalogu). Magnituda z CR, AC z `crStatGuide`. Dungeon
  // záznamy mají přednost (mají konkrétní zdroj + swing).
  for (const id of BESTIARY_IDS) {
    const template = BESTIARY[id]!;
    if (index.has(template.name)) continue;
    const isBoss = template.isBoss ?? false;
    const mag = crEnemyMagnitude(template.cr, isBoss);
    index.set(template.name, {
      name: template.name,
      maxHealth: template.maxHealth ?? mag.maxHealth,
      attackPower: template.attackPower ?? mag.attackPower,
      swingInterval: template.swingInterval ?? 2.4,
      armor: 0,
      armorClass: crStatGuide(template.cr).armorClass,
      isBoss,
      source: 'Bestiary',
      abilities: (template.abilities ?? []).map((a) => ({
        name: a.name,
        cooldownSec: a.cooldownSec,
        damageMult: a.damageMult,
      })),
      bestiary: bestiaryEntry(template),
    });
  }
  return index;
}

/** Dohledá NPC podle (přesného) jména z combat logu. */
export function findEnemyByName(name: string): NpcInfo | undefined {
  if (!enemyIndex) enemyIndex = buildEnemyIndex();
  return enemyIndex.get(name);
}

let abilityIndex: Map<string, SignatureAbility> | null = null;

function buildAbilityIndex(): Map<string, SignatureAbility> {
  const index = new Map<string, SignatureAbility>();
  const add = (sig: SignatureAbility): void => {
    if (!index.has(sig.name)) index.set(sig.name, sig);
  };
  // Baseline + prepared-pool + subclass: konkrétní katalogy se `spellTier` jako
  // primární zdroj (každé seslání hráče v logu → karta).
  for (const list of Object.values(CLASS_BASELINE_ABILITIES)) {
    for (const ab of list) {
      const { unlockLevel: _u, ...sig } = ab;
      add(sig);
    }
  }
  for (const list of Object.values(EXTRA_SPELLS)) {
    for (const ab of list) {
      const { unlockLevel: _u, ...sig } = ab;
      add(sig);
    }
  }
  for (const sig of Object.values(SUBCLASS_ABILITIES)) add(sig);
  // Enemy abilities (bossové/trash) — aby i nepřátelská seslání v logu měla kartu.
  for (const id of BESTIARY_IDS) {
    for (const a of BESTIARY[id]?.abilities ?? []) add(enemyAbilityToSignature(a));
  }
  // Draft-pool `SIGNATURE_ABILITIES` jako fallback (id-keyed záznamy bez spellTier).
  for (const [id, spec] of Object.entries(SIGNATURE_ABILITIES)) {
    add({ id, ...spec });
  }
  return index;
}

/** Dohledá detail ability podle jména (z combat logu). */
export function findAbilityByName(name: string): SignatureAbility | undefined {
  if (!abilityIndex) abilityIndex = buildAbilityIndex();
  return abilityIndex.get(name);
}

let abilityByIdIndex: Map<string, SignatureAbility> | null = null;

/**
 * Index abilit podle `id` (na rozdíl od `findAbilityByName`) — combat UI
 * (Gauntlet/dungeon tlačítka) nese `id`, a id je jednoznačné (jméno se může opakovat
 * mezi tříd-variantami / draft-poolem, viz `sorc_fireball` vs `wiz_fireball`). Prochází
 * **konkrétní** katalogy (baseline + extra spells + subclass) jako primární zdroj
 * pravdy se `spellTier`; draft-pool `SIGNATURE_ABILITIES` se přidá až jako fallback.
 */
function buildAbilityByIdIndex(): Map<string, SignatureAbility> {
  const index = new Map<string, SignatureAbility>();
  const addBaseline = (ab: SignatureAbility & { unlockLevel?: number }): void => {
    const { unlockLevel: _u, ...sig } = ab;
    if (!index.has(sig.id)) index.set(sig.id, sig);
  };
  for (const list of Object.values(CLASS_BASELINE_ABILITIES)) list.forEach(addBaseline);
  for (const list of Object.values(EXTRA_SPELLS)) list.forEach(addBaseline);
  for (const ab of Object.values(SUBCLASS_ABILITIES)) addBaseline(ab);
  for (const [id, spec] of Object.entries(SIGNATURE_ABILITIES)) {
    if (!index.has(id)) index.set(id, { id, ...spec });
  }
  return index;
}

/** Dohledá detail ability podle `id` (combat tlačítka nesou id, ne jméno). */
export function findAbilityById(id: string): SignatureAbility | undefined {
  if (!abilityByIdIndex) abilityByIdIndex = buildAbilityByIdIndex();
  return abilityByIdIndex.get(id);
}
