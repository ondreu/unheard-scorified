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
  /** Hráči viditelný popis (anglicky, EN = jazyk hry). Volitelný u boss abilit. */
  description?: string;
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
  /** Execute: pod tímto podílem HP cíle (0..1) se použije `executeDamageMult`. */
  executeBelowPct?: number;
  /** Execute: zvýšený damage multiplier proti cíli pod `executeBelowPct`. */
  executeDamageMult?: number;
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
  mortal_strike: {
    name: 'Mortal Strike',
    description: 'A brutal strike for 180% weapon damage.',
    kind: 'strike',
    cooldownSec: 6,
    damageMult: 1.8,
  },
  bloodthirst: {
    name: 'Bloodthirst',
    description: 'Strikes for 160% weapon damage, healing you for 20% of the damage dealt.',
    kind: 'drain',
    cooldownSec: 6,
    damageMult: 1.6,
    drainHealFraction: 0.2,
  },
  // Hunter
  bestial_wrath: {
    name: 'Bestial Wrath',
    description: 'Sends your beast into a frenzy for 200% damage.',
    kind: 'strike',
    cooldownSec: 10,
    damageMult: 2.0,
  },
  silencing_shot: {
    name: 'Silencing Shot',
    description: 'Silences the target and deals 170% weapon damage.',
    kind: 'strike',
    cooldownSec: 8,
    damageMult: 1.7,
  },
  // Rogue
  mutilate: {
    name: 'Mutilate',
    description: 'A flurry of blades for 220% weapon damage.',
    kind: 'strike',
    cooldownSec: 8,
    damageMult: 2.2,
  },
  blade_flurry: {
    name: 'Blade Flurry',
    description: 'Whirls into the target for 150% weapon damage.',
    kind: 'strike',
    cooldownSec: 10,
    damageMult: 1.5,
  },
  // Shaman
  stormstrike: {
    name: 'Stormstrike',
    description: 'An elemental melee strike for 200% damage.',
    kind: 'strike',
    cooldownSec: 8,
    damageMult: 2.0,
  },
  thunderstorm: {
    name: 'Thunderstorm',
    description: 'Calls down lightning for 240% spell damage.',
    kind: 'strike',
    cooldownSec: 12,
    damageMult: 2.4,
  },
  // Mage — Pyroblast zapálí cíl (úder + hoření).
  pyroblast_mastery: {
    name: 'Pyroblast',
    description: 'A massive fireball for 250% damage that burns for a further 75% over 6s.',
    kind: 'dot',
    cooldownSec: 10,
    damageMult: 2.5,
    dotDurationSec: 6,
    dotTicks: 3,
    dotTickMult: 0.25,
  },
  // Warlock
  chaos_bolt: {
    name: 'Chaos Bolt',
    description: 'Unstoppable chaos for 250% spell damage.',
    kind: 'strike',
    cooldownSec: 10,
    damageMult: 2.5,
  },
  unstable_affliction: {
    name: 'Unstable Affliction',
    description: 'Afflicts the target for 190% damage plus 120% over 8s.',
    kind: 'dot',
    cooldownSec: 9,
    damageMult: 1.9,
    dotDurationSec: 8,
    dotTicks: 4,
    dotTickMult: 0.3,
  },
  // Druid
  starfall: {
    name: 'Starfall',
    description: 'Calls down starlight for 230% spell damage.',
    kind: 'strike',
    cooldownSec: 12,
    damageMult: 2.3,
  },
  berserk: {
    name: 'Berserk',
    description: 'Enters a frenzy, striking for 180% damage.',
    kind: 'strike',
    cooldownSec: 10,
    damageMult: 1.8,
  },
  // Paladin
  repentance: {
    name: 'Repentance',
    description: 'Smites the target for 160% weapon damage.',
    kind: 'strike',
    cooldownSec: 9,
    damageMult: 1.6,
  },
};

// ── Baseline ability kit per class (MIL) ────────────────────────────────────
//
// Každá classa má základní sadu abilit odemčených LEVELEM (nezávisle na
// talentech) → rotace nikdy není prázdná. Capstone signature ability (talent)
// se přidává navrch. Spec identitu dál odlišují capstone + pasivní talenty.
// Heal-kind ability využije jen healer role (viz engine); offensive ability
// (strike/drain/dot) používá tank/dps i healer jako filler.

interface BaselineOpts {
  dot?: { dotDurationSec: number; dotTicks: number; dotTickMult: number };
  drainHealFraction?: number;
  execute?: { executeBelowPct: number; executeDamageMult: number };
}

function ba(
  id: string,
  name: string,
  description: string,
  kind: AbilityKind,
  cooldownSec: number,
  damageMult: number,
  unlockLevel: number,
  opts: BaselineOpts = {},
): BaselineAbility {
  return {
    id,
    name,
    description,
    kind,
    cooldownSec,
    damageMult,
    unlockLevel,
    ...opts.dot,
    ...(opts.drainHealFraction ? { drainHealFraction: opts.drainHealFraction } : {}),
    ...(opts.execute ?? {}),
  };
}

export const CLASS_BASELINE_ABILITIES: Record<string, BaselineAbility[]> = {
  warrior: [
    ba('warrior_heroic_strike', 'Heroic Strike', 'A forceful blow for 130% weapon damage.', 'strike', 4, 1.3, 1),
    ba('warrior_rend', 'Rend', 'Wounds the target for 50% weapon damage and bleeds for 90% over 9s.', 'dot', 8, 0.5, 6, { dot: { dotDurationSec: 9, dotTicks: 3, dotTickMult: 0.3 } }),
    ba('warrior_overpower', 'Overpower', 'Seizes an opening to strike for 150% weapon damage.', 'strike', 6, 1.5, 14),
    ba('warrior_execute', 'Execute', 'A finishing blow for 220% weapon damage, increased to 330% against targets below 30% health.', 'strike', 8, 2.2, 30, { execute: { executeBelowPct: 0.3, executeDamageMult: 3.3 } }),
  ],
  paladin: [
    ba('paladin_crusader_strike', 'Crusader Strike', 'A righteous strike for 130% weapon damage.', 'strike', 5, 1.3, 1),
    ba('paladin_consecration', 'Consecration', 'Sanctifies the ground, burning the enemy for 100% damage over 8s.', 'dot', 8, 0.4, 12, { dot: { dotDurationSec: 8, dotTicks: 4, dotTickMult: 0.25 } }),
    ba('paladin_holy_light', 'Holy Light', 'A potent heal restoring 220% of your healing power to a wounded ally.', 'heal', 6, 2.2, 1),
    ba('paladin_flash_of_light', 'Flash of Light', 'A fast heal restoring 130% of your healing power to a wounded ally.', 'heal', 4, 1.3, 20),
  ],
  hunter: [
    ba('hunter_arcane_shot', 'Arcane Shot', 'An instant shot dealing 140% weapon damage.', 'strike', 5, 1.4, 1),
    ba('hunter_serpent_sting', 'Serpent Sting', 'Poisons the target for 40% on impact and 125% over 10s.', 'dot', 9, 0.4, 10, { dot: { dotDurationSec: 10, dotTicks: 5, dotTickMult: 0.25 } }),
    ba('hunter_aimed_shot', 'Aimed Shot', 'A carefully aimed shot dealing 190% weapon damage.', 'strike', 8, 1.9, 30),
  ],
  rogue: [
    ba('rogue_sinister_strike', 'Sinister Strike', 'A vicious strike for 130% weapon damage.', 'strike', 4, 1.3, 1),
    ba('rogue_rupture', 'Rupture', 'Tears the target, dealing 45% on impact and 120% over 8s.', 'dot', 9, 0.45, 12, { dot: { dotDurationSec: 8, dotTicks: 4, dotTickMult: 0.3 } }),
    ba('rogue_eviscerate', 'Eviscerate', 'A finishing move dealing 190% weapon damage, increased to 280% against targets below 30% health.', 'strike', 7, 1.9, 20, { execute: { executeBelowPct: 0.3, executeDamageMult: 2.8 } }),
  ],
  priest: [
    ba('priest_smite', 'Smite', 'Holy energy dealing 130% spell damage.', 'strike', 5, 1.3, 1),
    ba('priest_shadow_word_pain', 'Shadow Word: Pain', 'A creeping agony dealing 120% damage over 12s.', 'dot', 9, 0.4, 8, { dot: { dotDurationSec: 12, dotTicks: 6, dotTickMult: 0.2 } }),
    ba('priest_greater_heal', 'Greater Heal', 'A powerful heal restoring 240% of your healing power to a wounded ally.', 'heal', 6, 2.4, 1),
    ba('priest_renew', 'Renew', 'Heals a wounded ally for 140% of your healing power.', 'heal', 5, 1.4, 14),
  ],
  shaman: [
    ba('shaman_lightning_bolt', 'Lightning Bolt', 'A bolt of lightning for 140% spell damage.', 'strike', 5, 1.4, 1),
    ba('shaman_flame_shock', 'Flame Shock', 'Sears the target for 40% on impact and 90% over 9s.', 'dot', 8, 0.4, 10, { dot: { dotDurationSec: 9, dotTicks: 3, dotTickMult: 0.3 } }),
    ba('shaman_healing_wave', 'Healing Wave', 'A strong heal restoring 230% of your healing power to a wounded ally.', 'heal', 6, 2.3, 1),
    ba('shaman_chain_heal', 'Chain Heal', 'Restores 180% of your healing power to a wounded ally.', 'heal', 8, 1.8, 30),
  ],
  mage: [
    ba('mage_fireball', 'Fireball', 'Hurls a fiery ball for 140% spell damage.', 'strike', 4, 1.4, 1),
    ba('mage_frostbolt', 'Frostbolt', 'A frozen bolt for 120% spell damage that chills the target.', 'strike', 4, 1.2, 1),
    ba('mage_scorch', 'Scorch', 'Burns the target for 40% on impact and 75% over 6s.', 'dot', 8, 0.4, 14, { dot: { dotDurationSec: 6, dotTicks: 3, dotTickMult: 0.25 } }),
    ba('mage_arcane_blast', 'Arcane Blast', 'A surge of arcane power for 190% spell damage.', 'strike', 7, 1.9, 30),
  ],
  warlock: [
    ba('warlock_shadow_bolt', 'Shadow Bolt', 'A bolt of shadow for 140% spell damage.', 'strike', 5, 1.4, 1),
    ba('warlock_corruption', 'Corruption', 'Corrupts the target for 45% on impact and 132% over 12s.', 'dot', 9, 0.45, 6, { dot: { dotDurationSec: 12, dotTicks: 6, dotTickMult: 0.22 } }),
    ba('warlock_drain_life', 'Drain Life', 'Drains the target for 100% damage, healing you for 50% of the damage dealt.', 'drain', 6, 1.0, 10, { drainHealFraction: 0.5 }),
    ba('warlock_immolate', 'Immolate', 'Engulfs the target for 40% on impact and 100% over 8s.', 'dot', 9, 0.4, 20, { dot: { dotDurationSec: 8, dotTicks: 4, dotTickMult: 0.25 } }),
  ],
  druid: [
    ba('druid_wrath', 'Wrath', "Nature's wrath for 130% spell damage.", 'strike', 5, 1.3, 1),
    ba('druid_moonfire', 'Moonfire', 'Arcane fire dealing 45% on impact and 90% over 9s.', 'dot', 8, 0.45, 8, { dot: { dotDurationSec: 9, dotTicks: 3, dotTickMult: 0.3 } }),
    ba('druid_healing_touch', 'Healing Touch', 'A potent heal restoring 240% of your healing power to a wounded ally.', 'heal', 6, 2.4, 1),
    ba('druid_rejuvenation', 'Rejuvenation', 'Heals a wounded ally for 140% of your healing power.', 'heal', 5, 1.4, 14),
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
 * Efektivní damage multiplier ability proti cíli s daným HP% (0..1). Aplikuje
 * **execute** bonus (víc poškození pod prahem HP cíle, např. Execute 220 % → 330 %
 * pod 30 %). Bez execute polí vrací base `damageMult`.
 */
export function abilityDamageMult(ability: SignatureAbility, targetHpPct: number): number {
  if (ability.executeBelowPct != null && targetHpPct <= ability.executeBelowPct) {
    return ability.executeDamageMult ?? ability.damageMult;
  }
  return ability.damageMult;
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
