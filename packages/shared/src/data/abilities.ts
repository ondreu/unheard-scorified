/**
 * Katalog combat abilit (MIL — combat overhaul). Jediný zdroj pravdy pro to,
 * jakého *druhu* je která signature ability (strike / drain / dot / heal /
 * shield) → engine podle toho generuje **bohatý WoW-like combat log** a aplikuje
 * mechaniku (DoT tiky, lifesteal „drain", absorpční štíty).
 *
 * Catalog je čistá data (žádný import z `combat.ts`) → žádný cyklus; `combat.ts`
 * i ostatní simulátory (raid/dungeon/pvp) z něj jen čtou.
 *
 * Capstone talent tagy (M4) odemykají signature ability — mapování níže. Druhy
 * abilit jsou kurátorované; nenamapovaný tag = no-op (žádná ability).
 */

/** Druh abilit — řídí log i mechaniku v enginu. */
export type AbilityKind = 'strike' | 'drain' | 'dot' | 'heal' | 'shield';

/**
 * Signature ability odemčená capstone talentem. Plně serializovatelná (součást
 * snapshotu bojového profilu). Rozšířeno (MIL) o `kind` + parametry DoT/drain,
 * aby engine dokázal generovat divácky zajímavý log a hloubku pro min-max.
 */
export interface SignatureAbility {
  id: string;
  name: string;
  /** Druh — strike (přímý úder), drain (úder + self-heal), dot (úder + krvácení), … */
  kind: AbilityKind;
  cooldownSec: number;
  /** Násobek poškození (strike/drain/dot) resp. healu (heal) na úder. */
  damageMult: number;
  /** DoT: celková doba krvácení v sekundách. */
  dotDurationSec?: number;
  /** DoT: počet tiků rozložených přes `dotDurationSec`. */
  dotTicks?: number;
  /** DoT: násobek poškození jednoho tiku (z attack power útočníka). */
  dotTickMult?: number;
  /** Drain: podíl uděleného poškození, který útočníka vyléčí (navíc k lifestealu). */
  drainHealFraction?: number;
}

/** Šablona katalogu (id se doplní z klíče = combat tag). */
type AbilitySpec = Omit<SignatureAbility, 'id'>;

/**
 * Capstone combat tag → signature ability (kurátorováno). Druhy:
 *  - `strike` — silný okamžitý úder.
 *  - `drain`  — úder, který útočníka i vyléčí (lifesteal classy).
 *  - `dot`    — úder + následné krvácení/hoření (tiky v čase).
 */
export const SIGNATURE_ABILITIES: Record<string, AbilitySpec> = {
  // Warrior
  mortal_strike: { name: 'Mortal Strike', kind: 'strike', cooldownSec: 6, damageMult: 1.8 },
  bloodthirst: {
    name: 'Bloodthirst',
    kind: 'drain',
    cooldownSec: 6,
    damageMult: 1.6,
    drainHealFraction: 0.2,
  },
  // Hunter
  bestial_wrath: { name: 'Bestial Wrath', kind: 'strike', cooldownSec: 10, damageMult: 2.0 },
  silencing_shot: { name: 'Silencing Shot', kind: 'strike', cooldownSec: 8, damageMult: 1.7 },
  // Rogue
  mutilate: { name: 'Mutilate', kind: 'strike', cooldownSec: 8, damageMult: 2.2 },
  blade_flurry: { name: 'Blade Flurry', kind: 'strike', cooldownSec: 10, damageMult: 1.5 },
  // Shaman
  stormstrike: { name: 'Stormstrike', kind: 'strike', cooldownSec: 8, damageMult: 2.0 },
  thunderstorm: { name: 'Thunderstorm', kind: 'strike', cooldownSec: 12, damageMult: 2.4 },
  // Mage — Pyroblast zapálí cíl (úder + hoření).
  pyroblast_mastery: {
    name: 'Pyroblast',
    kind: 'dot',
    cooldownSec: 10,
    damageMult: 2.5,
    dotDurationSec: 6,
    dotTicks: 3,
    dotTickMult: 0.25,
  },
  // Warlock
  chaos_bolt: { name: 'Chaos Bolt', kind: 'strike', cooldownSec: 10, damageMult: 2.5 },
  unstable_affliction: {
    name: 'Unstable Affliction',
    kind: 'dot',
    cooldownSec: 9,
    damageMult: 1.9,
    dotDurationSec: 8,
    dotTicks: 4,
    dotTickMult: 0.3,
  },
  // Druid
  starfall: { name: 'Starfall', kind: 'strike', cooldownSec: 12, damageMult: 2.3 },
  berserk: { name: 'Berserk', kind: 'strike', cooldownSec: 10, damageMult: 1.8 },
  // Paladin
  repentance: { name: 'Repentance', kind: 'strike', cooldownSec: 9, damageMult: 1.6 },
};

/**
 * Tagy poskytující absorpční štít (pohlcuje příchozí poškození, než se „rozbije").
 * Hodnota = násobek, kterým se škáluje velikost štítu (viz `deriveCombatProfile`).
 * Kurátorováno; ostatní obranné capstone tagy zůstávají no-op pro štít.
 */
export const SHIELD_TAGS: Record<string, number> = {
  ice_barrier: 1.6,
  holy_shield: 1.2,
};
