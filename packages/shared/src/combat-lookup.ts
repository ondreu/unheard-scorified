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
import { crForContentLevel } from './data/damage';
import {
  SIGNATURE_ABILITIES,
  CLASS_BASELINE_ABILITIES,
  EXTRA_SPELLS,
  SUBCLASS_ABILITIES,
  type SignatureAbility,
} from './data/abilities';

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
  isBoss: boolean;
  /** Kde se NPC vyskytuje (dungeon/raid název) — flavor do karty. */
  source: string;
  abilities: NpcAbility[];
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
      index.set(e.name, {
        name: e.name,
        maxHealth: mag.maxHealth,
        attackPower: mag.attackPower,
        swingInterval: e.swingInterval,
        armor: e.armor ?? 0,
        isBoss,
        source: d.name,
        abilities: [],
      });
    }
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
  for (const [id, spec] of Object.entries(SIGNATURE_ABILITIES)) {
    if (!index.has(spec.name)) index.set(spec.name, { id, ...spec });
  }
  for (const list of Object.values(CLASS_BASELINE_ABILITIES)) {
    for (const ab of list) {
      const { unlockLevel: _u, ...sig } = ab;
      if (!index.has(sig.name)) index.set(sig.name, sig);
    }
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
