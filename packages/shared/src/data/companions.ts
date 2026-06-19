/**
 * AI companion roster (dungeon overhaul Slice 3, ADR 0037).
 *
 * Pevná sada pojmenovaných **D&D companion NPC** (BG3-style origin parťáci), kteří
 * **autofillnou** group tahový dungeon, když hráč nemá reálnou partu. Každý companion
 * je definovaný classou + subclassou + rolí; jeho bojový profil se staví **stejnou
 * cestou jako u hráče** (`deriveCombatProfile` → `deriveRaidActor`) na úrovni hráče,
 * se standard-array atributy a bez gearu. Tím parťák „mimikuje hráče" (role, ability
 * kit, spell sloty, rotace) místo aby byl ad-hoc balík čísel.
 *
 * Slice 3 = **3-player autofill** (1 tank / 1 healer / 1 dps); reální hráči = Slice 4.
 * Herní stringy anglicky (EN), komentáře česky.
 */
import { baseStatsFor } from '../character';
import { deriveCombatProfile, type CombatActor } from '../combat';
import { deriveRaidActor, type RaidActor, type RaidRole } from '../raid';
import { defaultRotation } from '../rotation';
import type { ClassId, SubclassId } from './classes';

/** Definice jednoho companiona (pevný roster). */
export interface CompanionDef {
  id: string;
  /** Jméno zobrazené v partě / combat logu (EN). */
  name: string;
  /** Krátký lore popis (EN). */
  title: string;
  klass: ClassId;
  subclass: SubclassId;
  role: RaidRole;
}

/**
 * Roster autofill parťáků — jeden „signature" companion na roli (stačí pro 1/1/1
 * autofill 3-player). Tematicky D&D origin postavy.
 */
export const COMPANIONS: Record<RaidRole, CompanionDef> = {
  tank: {
    id: 'companion_gareth',
    name: 'Gareth',
    title: 'Shieldsworn Knight',
    klass: 'fighter',
    subclass: 'champion',
    role: 'tank',
  },
  healer: {
    id: 'companion_lyra',
    name: 'Lyra',
    title: 'Dawnlight Cleric',
    klass: 'cleric',
    subclass: 'life_domain',
    role: 'healer',
  },
  dps: {
    id: 'companion_vex',
    name: 'Vex',
    title: 'Shadowfoot Rogue',
    klass: 'rogue',
    subclass: 'thief',
    role: 'dps',
  },
};

/** Bojový profil companiona na dané úrovni — stejná derivace jako u hráče. */
export function buildCompanionActor(def: CompanionDef, level: number): RaidActor {
  const primary = baseStatsFor('human', def.klass, level);
  const base: CombatActor = deriveCombatProfile({
    name: def.name,
    level,
    klass: def.klass,
    subclass: def.subclass,
    primary,
    equipment: {},
    progression: { statBonus: {}, healthBonus: 0, tags: [] },
  });
  // Default rotace (always) — parťák kouzlí/útočí, kdykoli může (jako fresh hráč).
  const withRotation: CombatActor = {
    ...base,
    rotation: defaultRotation(base.signatureAbilities.map((a) => a.id)),
  };
  return deriveRaidActor(withRotation, def.role);
}

/**
 * Sestaví AI parťáky (autofill) pro group tahový dungeon: doplní role, které
 * hráč neobsadil, do kompozice **1 tank / 1 healer / 1 dps** (3-player). Hráčova
 * role se vynechá. Vrací parťáky v pořadí tank → healer → dps (bez hráčovy role).
 */
export function buildCompanionParty(playerRole: RaidRole, level: number): RaidActor[] {
  const order: RaidRole[] = ['tank', 'healer', 'dps'];
  return order
    .filter((role) => role !== playerRole)
    .map((role) => buildCompanionActor(COMPANIONS[role], level));
}
