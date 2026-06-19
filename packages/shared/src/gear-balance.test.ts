/**
 * Kalibrační harness pro gear & balance follow-up (MR-10e dokončení).
 *
 * Verification-first nástroj: měří (a) poměr efektivní síly full-BiS vs nahá
 * postava (cíl PM: ~1.5–2× na lvl 20) a (b) délku on-level 1v1 souboje (TTK)
 * + win-rate / zbylé HP pro ladění gear budgetu a `ENEMY_DPR_TO_SWING`.
 *
 * Vše deterministické (seedovaný RNG). Tabulky se vypisují přes `console.log`
 * (spusť `pnpm --filter @game/shared test gear-balance`). Spodní `describe`
 * drží tvrdá kontraktní očekávání (cíle balancu).
 */
import { describe, expect, it } from 'vitest';
import {
  buildEnemyActor,
  deriveCombatProfile,
  resolveAttack,
  type CombatActor,
} from './combat';
import { baseStatsFor } from './character';
import { EMPTY_PROGRESSION } from './levelup';
import { crForContentLevel } from './data/damage';
import {
  ITEMS,
  SLOT_TO_ITEM_SLOT,
  EQUIPMENT_SLOTS,
  sumEquipmentStats,
  type ItemDef,
  type ItemStats,
} from './data/items';
import { simulateQuestEncounter } from './quest-run';
import { SeededRng } from './rng';

/** Mapování úrovně postavy (1–20) na ~itemLevel (katalog jde do ~68). */
function ilvlCapFor(level: number): number {
  return level * 3.5;
}

/** Vybere „best in slot" set pro daný level — nejvyšší itemLevel ≤ cap se staty. */
function bisStats(level: number): ItemStats {
  const cap = ilvlCapFor(level);
  const chosen: ItemDef[] = [];
  for (const slot of EQUIPMENT_SLOTS) {
    const itemSlot = SLOT_TO_ITEM_SLOT[slot];
    let best: ItemDef | undefined;
    for (const item of Object.values(ITEMS)) {
      if (item.slot !== itemSlot) continue;
      if (Object.keys(item.stats).length === 0) continue; // přeskoč batohy
      if (item.itemLevel > cap) continue;
      if (!best || item.itemLevel > best.itemLevel) best = item;
    }
    if (best) chosen.push(best);
  }
  return sumEquipmentStats(chosen);
}

function hero(level: number, klass: Parameters<typeof baseStatsFor>[1], equipment: ItemStats): CombatActor {
  return deriveCombatProfile({
    name: 'Hero',
    level,
    klass,
    primary: baseStatsFor('human', klass, level),
    equipment,
    progression: EMPTY_PROGRESSION,
  });
}

/** On-level nepřítel (trash/boss) přes Challenge Rating. */
function onLevelEnemy(level: number, isBoss: boolean): CombatActor {
  return buildEnemyActor({
    name: isBoss ? 'Boss' : 'Foe',
    swingInterval: isBoss ? 2.8 : 2.4,
    isBoss,
    challengeRating: crForContentLevel(level, isBoss),
  });
}

/**
 * Efektivní síla = offense × defense (sim-měřeno, ať to zahrne AC/crit/mitigation):
 *  - offense = průměrné poškození hráče za úder vs on-level AC,
 *  - defense = kolik úderů hráč přežije proti on-level nepříteli.
 */
function effectivePower(player: CombatActor, level: number): number {
  const ref = onLevelEnemy(level, false);
  // Offense: N úderů hráče na nesmrtelný cíl s on-level AC.
  let dmg = 0;
  const rngO = new SeededRng(12345 + level);
  const dummy: CombatActor = { ...ref, maxHealth: 1_000_000 };
  const N = 4000;
  for (let i = 0; i < N; i++) dmg += resolveAttack(player, dummy, rngO).amount;
  const dpsPerSwing = dmg / N;

  // Defense: kolik úderů on-level nepřítel potřebuje na zabití hráče.
  let totalSwings = 0;
  const M = 600;
  const rngD = new SeededRng(54321 + level);
  for (let i = 0; i < M; i++) {
    let hp = player.maxHealth + player.shield;
    let swings = 0;
    while (hp > 0 && swings < 500) {
      hp -= resolveAttack(ref, player, rngD).amount;
      swings++;
    }
    totalSwings += swings;
  }
  const survival = totalSwings / M;
  return dpsPerSwing * survival;
}

/** Průměrný počet úderů hráče (TTK) + win-rate + zbylé HP v on-level 1v1. */
function ttkProfile(player: CombatActor, level: number, isBoss: boolean) {
  const foe = {
    name: isBoss ? 'Boss' : 'Foe',
    swingInterval: isBoss ? 2.8 : 2.4,
    isBoss,
    challengeRating: crForContentLevel(level, isBoss),
  };
  let wins = 0;
  let hpSum = 0;
  let swingSum = 0;
  const runs = 400;
  for (let s = 0; s < runs; s++) {
    const enc = simulateQuestEncounter(player, foe, new SeededRng(7000 + s), 0, true);
    if (!enc.playerDefeated) wins++;
    hpSum += enc.playerHpPct;
    // počet úderů hráče = attack/ability/drain eventy se zdrojem hráče
    swingSum += enc.events.filter((e) => e.source === player.name && e.amount != null).length;
  }
  return {
    winRate: wins / runs,
    avgHpPct: Math.round(hpSum / runs),
    avgSwings: +(swingSum / runs).toFixed(1),
  };
}

const LEVELS = [1, 5, 10, 14, 20];
const CLASSES_TO_TEST: Array<Parameters<typeof baseStatsFor>[1]> = ['fighter', 'wizard', 'rogue', 'cleric'];
const MARTIAL_CLASSES: Array<Parameters<typeof baseStatsFor>[1]> = ['fighter', 'rogue'];
/**
 * Casteři („Fix kouzla"): cantrip scaling (1→2→3→4 na 5/11/17) + upcast nuke
 * nejvyšším slotem + healer self-sustain v solo → wizard (glass cannon) i cleric
 * (healer) jsou na high-level bossech viable. Mírnější laťka než martial (squishy
 * / delší souboje s healy), ale boj se vyhraje s reálnou ztrátou HP.
 */
const CASTER_CLASSES: Array<Parameters<typeof baseStatsFor>[1]> = ['wizard', 'cleric'];

describe('gear-balance harness (report)', () => {
  it('BiS vs naked — efektivní síla + char-sheet čísla', () => {
    for (const klass of CLASSES_TO_TEST) {
      const rows: string[] = [];
      for (const lvl of LEVELS) {
        const bis = bisStats(lvl);
        const naked = hero(lvl, klass, {});
        const geared = hero(lvl, klass, bis);
        const ratio = effectivePower(geared, lvl) / effectivePower(naked, lvl);
        rows.push(
          `  L${String(lvl).padStart(2)} | ratio ${ratio.toFixed(2)}x | ` +
            `AP ${naked.attackPower.toFixed(0)}→${geared.attackPower.toFixed(0)} | ` +
            `HP ${naked.maxHealth}→${geared.maxHealth} | ` +
            `AC ${naked.armorClass}→${geared.armorClass} | ` +
            `atkBonus ${naked.attackBonus}→${geared.attackBonus} | ` +
            `DC ${naked.spellSaveDc}→${geared.spellSaveDc}`,
        );
      }
      console.log(`\n[${klass}] efektivní síla BiS/naked + magnitudy:\n${rows.join('\n')}`);
    }
    console.log(`\nBiS lvl20 sečtené staty: ${JSON.stringify(bisStats(20))}`);
  });

  it('TTK / win-rate / zbylé HP on-level (naked vs BiS)', () => {
    for (const klass of CLASSES_TO_TEST) {
      const rows: string[] = [];
      for (const lvl of LEVELS) {
        const naked = hero(lvl, klass, {});
        const geared = hero(lvl, klass, bisStats(lvl));
        for (const isBoss of [false, true]) {
          const n = ttkProfile(naked, lvl, isBoss);
          const g = ttkProfile(geared, lvl, isBoss);
          rows.push(
            `  L${String(lvl).padStart(2)} ${isBoss ? 'BOSS ' : 'trash'} | ` +
              `naked win ${(n.winRate * 100).toFixed(0)}% hp ${n.avgHpPct}% swings ${n.avgSwings} | ` +
              `BiS win ${(g.winRate * 100).toFixed(0)}% hp ${g.avgHpPct}% swings ${g.avgSwings}`,
          );
        }
      }
      console.log(`\n[${klass}] on-level 1v1 TTK:\n${rows.join('\n')}`);
    }
  });
});

describe('gear-balance contract', () => {
  // Gear je D&D-věrný a bounded: full BiS ≈ 1.5–2× nahá postava (rozhodnutí PM).
  // Greedy BiS picker míchá role (overstate), proto horní mez 2.25.
  it('full BiS na lvl 20 dává ~1.5–2× efektivní sílu nahé postavy', () => {
    for (const klass of CLASSES_TO_TEST) {
      const ratio = effectivePower(hero(20, klass, bisStats(20)), 20) / effectivePower(hero(20, klass, {}), 20);
      expect(ratio).toBeGreaterThan(1.4);
      expect(ratio).toBeLessThan(2.25);
    }
  });

  it('BiS lvl 20 staty jsou D&D-věrné (power + AC; ability skóre minimální)', () => {
    const b = bisStats(20);
    // Žádné ability skóre z gearu nepřesáhne +4 souhrnně (drží bounded accuracy).
    for (const k of ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const) {
      expect(b[k] ?? 0).toBeLessThanOrEqual(4);
    }
    // Gear je primárně power + armor.
    expect((b.attack_power ?? 0) + (b.spell_power ?? 0)).toBeGreaterThan(8);
    expect(b.armor ?? 0).toBeGreaterThan(50);
  });

  it('innate skóre clampnuto na 20 → bounded accuracy (naked lvl20 AC/DC v D&D pásmu)', () => {
    const n = hero(20, 'wizard', {});
    expect(n.armorClass).toBeLessThanOrEqual(16); // 10 + dexMod(≤+5) + 0 gear
    expect(n.spellSaveDc!).toBeLessThanOrEqual(20); // 8 + prof(6) + castMod(≤+5)
  });

  // Martial baseline: geared on-level boj je vyhratelný se ztrátou HP, v pásmu úderů.
  it('geared martial on-level: trash rychlý, boss 5–12 úderů s HP ztrátou', () => {
    for (const klass of MARTIAL_CLASSES) {
      for (const lvl of [5, 10, 14, 20]) {
        const g = hero(lvl, klass, bisStats(lvl));
        const trash = ttkProfile(g, lvl, false);
        const boss = ttkProfile(g, lvl, true);
        expect(trash.winRate).toBeGreaterThan(0.95);
        expect(boss.winRate).toBeGreaterThan(0.85);
        expect(boss.avgSwings).toBeGreaterThanOrEqual(4);
        expect(boss.avgSwings).toBeLessThanOrEqual(12);
        expect(boss.avgHpPct).toBeLessThan(90); // boss stojí HP
        expect(boss.avgHpPct).toBeGreaterThan(10); // ale vyhratelný se zbytkem
      }
    }
  });

  // Caster viability („Fix kouzla", blocker z ADR 0035): geared caster na on-level
  // bossi vyhraje se ztrátou HP. Laťka je mírnější než martial (glass cannon /
  // healer attrition), ale boss je spolehlivě poražitelný — žádné 0–10 % wipy.
  it('geared caster on-level: trash rychlý, boss vyhratelný s HP ztrátou', () => {
    for (const klass of CASTER_CLASSES) {
      for (const lvl of [5, 10, 14, 20]) {
        const g = hero(lvl, klass, bisStats(lvl));
        const trash = ttkProfile(g, lvl, false);
        const boss = ttkProfile(g, lvl, true);
        expect(trash.winRate).toBeGreaterThan(0.95);
        expect(boss.winRate).toBeGreaterThan(0.65);
        expect(boss.avgSwings).toBeGreaterThanOrEqual(4);
        expect(boss.avgSwings).toBeLessThanOrEqual(16);
        expect(boss.avgHpPct).toBeLessThan(90); // boss stojí HP
      }
    }
  });

  it('gear má váhu: geared martial je na on-level bossi výrazně bezpečnější než naked', () => {
    for (const klass of MARTIAL_CLASSES) {
      const naked = ttkProfile(hero(20, klass, {}), 20, true);
      const geared = ttkProfile(hero(20, klass, bisStats(20)), 20, true);
      expect(geared.winRate).toBeGreaterThan(naked.winRate + 0.2);
    }
  });
});
