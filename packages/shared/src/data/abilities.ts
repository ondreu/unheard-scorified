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

/** Baseline ability classy (odemčená levelem, ne talentem). */
export interface BaselineAbility extends SignatureAbility {
  /** Minimální level, od kterého je ability dostupná. */
  unlockLevel: number;
}

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

// ── Baseline ability kit per class (MIL) ────────────────────────────────────
//
// Každá classa má základní sadu abilit odemčených LEVELEM (nezávisle na
// talentech) → rotace nikdy není prázdná. Capstone signature ability (talent)
// se přidává navrch. Spec identitu dál odlišují capstone + pasivní talenty.
// Heal-kind ability využije jen healer role (viz engine); offensive ability
// (strike/drain/dot) používá tank/dps i healer jako filler.

function ba(
  id: string,
  name: string,
  kind: AbilityKind,
  cooldownSec: number,
  damageMult: number,
  unlockLevel: number,
  dot?: { dotDurationSec: number; dotTicks: number; dotTickMult: number },
  drainHealFraction?: number,
): BaselineAbility {
  return { id, name, kind, cooldownSec, damageMult, unlockLevel, ...dot, ...(drainHealFraction ? { drainHealFraction } : {}) };
}

export const CLASS_BASELINE_ABILITIES: Record<string, BaselineAbility[]> = {
  warrior: [
    ba('warrior_heroic_strike', 'Heroic Strike', 'strike', 4, 1.3, 1),
    ba('warrior_rend', 'Rend', 'dot', 8, 0.5, 6, { dotDurationSec: 9, dotTicks: 3, dotTickMult: 0.3 }),
    ba('warrior_overpower', 'Overpower', 'strike', 6, 1.5, 14),
    ba('warrior_execute', 'Execute', 'strike', 8, 2.2, 30),
  ],
  paladin: [
    ba('paladin_crusader_strike', 'Crusader Strike', 'strike', 5, 1.3, 1),
    ba('paladin_consecration', 'Consecration', 'dot', 8, 0.4, 12, { dotDurationSec: 8, dotTicks: 4, dotTickMult: 0.25 }),
    ba('paladin_holy_light', 'Holy Light', 'heal', 6, 2.2, 1),
    ba('paladin_flash_of_light', 'Flash of Light', 'heal', 4, 1.3, 20),
  ],
  hunter: [
    ba('hunter_arcane_shot', 'Arcane Shot', 'strike', 5, 1.4, 1),
    ba('hunter_serpent_sting', 'Serpent Sting', 'dot', 9, 0.4, 10, { dotDurationSec: 10, dotTicks: 5, dotTickMult: 0.25 }),
    ba('hunter_aimed_shot', 'Aimed Shot', 'strike', 8, 1.9, 30),
  ],
  rogue: [
    ba('rogue_sinister_strike', 'Sinister Strike', 'strike', 4, 1.3, 1),
    ba('rogue_rupture', 'Rupture', 'dot', 9, 0.45, 12, { dotDurationSec: 8, dotTicks: 4, dotTickMult: 0.3 }),
    ba('rogue_eviscerate', 'Eviscerate', 'strike', 7, 1.9, 20),
  ],
  priest: [
    ba('priest_smite', 'Smite', 'strike', 5, 1.3, 1),
    ba('priest_shadow_word_pain', 'Shadow Word: Pain', 'dot', 9, 0.4, 8, { dotDurationSec: 12, dotTicks: 6, dotTickMult: 0.2 }),
    ba('priest_greater_heal', 'Greater Heal', 'heal', 6, 2.4, 1),
    ba('priest_renew', 'Renew', 'heal', 5, 1.4, 14),
  ],
  shaman: [
    ba('shaman_lightning_bolt', 'Lightning Bolt', 'strike', 5, 1.4, 1),
    ba('shaman_flame_shock', 'Flame Shock', 'dot', 8, 0.4, 10, { dotDurationSec: 9, dotTicks: 3, dotTickMult: 0.3 }),
    ba('shaman_healing_wave', 'Healing Wave', 'heal', 6, 2.3, 1),
    ba('shaman_chain_heal', 'Chain Heal', 'heal', 8, 1.8, 30),
  ],
  mage: [
    ba('mage_fireball', 'Fireball', 'strike', 4, 1.4, 1),
    ba('mage_frostbolt', 'Frostbolt', 'strike', 4, 1.2, 1),
    ba('mage_scorch', 'Scorch', 'dot', 8, 0.4, 14, { dotDurationSec: 6, dotTicks: 3, dotTickMult: 0.25 }),
    ba('mage_arcane_blast', 'Arcane Blast', 'strike', 7, 1.9, 30),
  ],
  warlock: [
    ba('warlock_shadow_bolt', 'Shadow Bolt', 'strike', 5, 1.4, 1),
    ba('warlock_corruption', 'Corruption', 'dot', 9, 0.45, 6, { dotDurationSec: 12, dotTicks: 6, dotTickMult: 0.22 }),
    ba('warlock_drain_life', 'Drain Life', 'drain', 6, 1.0, 10, undefined, 0.5),
    ba('warlock_immolate', 'Immolate', 'dot', 9, 0.4, 20, { dotDurationSec: 8, dotTicks: 4, dotTickMult: 0.25 }),
  ],
  druid: [
    ba('druid_wrath', 'Wrath', 'strike', 5, 1.3, 1),
    ba('druid_moonfire', 'Moonfire', 'dot', 8, 0.45, 8, { dotDurationSec: 9, dotTicks: 3, dotTickMult: 0.3 }),
    ba('druid_healing_touch', 'Healing Touch', 'heal', 6, 2.4, 1),
    ba('druid_rejuvenation', 'Rejuvenation', 'heal', 5, 1.4, 14),
  ],
};

/**
 * Sestaví kompletní seznam abilit postavy: **baseline** (gated levelem) +
 * **capstone signature** (gated alokovaným talentem). Jediný zdroj pravdy pro
 * combat engine (`deriveCombatProfile`) i editor rotace (API) → nemůžou se
 * rozejít. Pořadí: baseline (dle katalogu), pak capstone.
 */
export function resolveAbilities(
  klass: string,
  level: number,
  tags: readonly { tag: string }[],
): SignatureAbility[] {
  const out: SignatureAbility[] = [];
  const seen = new Set<string>();
  for (const ab of CLASS_BASELINE_ABILITIES[klass] ?? []) {
    if (level < ab.unlockLevel) continue;
    const { unlockLevel: _u, ...sig } = ab;
    out.push(sig);
    seen.add(sig.id);
  }
  for (const { tag } of tags) {
    const spec = SIGNATURE_ABILITIES[tag];
    if (spec && !seen.has(tag)) {
      out.push({ id: tag, ...spec });
      seen.add(tag);
    }
  }
  return out;
}

/**
 * Tagy poskytující absorpční štít (pohlcuje příchozí poškození, než se „rozbije").
 * Hodnota = násobek, kterým se škáluje velikost štítu (viz `deriveCombatProfile`).
 * Kurátorováno; ostatní obranné capstone tagy zůstávají no-op pro štít.
 */
export const SHIELD_TAGS: Record<string, number> = {
  ice_barrier: 1.6,
  holy_shield: 1.2,
};
