import { describe, expect, it } from 'vitest';
import {
  applyRage,
  baseStatsFor,
  canRage,
  deriveCombatProfile,
  kiPointsFor,
  rageChargesFor,
  rageDamageBonus,
  RAGE_RESIST_TYPES,
  EMPTY_PROGRESSION,
  type ClassId,
} from './index';

const hero = (klass: ClassId, level = 8) =>
  deriveCombatProfile({
    name: 'Hero',
    level,
    klass,
    primary: baseStatsFor('half_orc', klass, level),
    equipment: {},
    progression: EMPTY_PROGRESSION,
  });

describe('class resources — data (ADR 0034)', () => {
  it('Ki body = úroveň, jen pro Monka', () => {
    expect(kiPointsFor('monk', 1)).toBe(1);
    expect(kiPointsFor('monk', 12)).toBe(12);
    expect(kiPointsFor('fighter', 10)).toBe(0);
  });

  it('rage charges dle D&D tabulky, jen pro Barbariana', () => {
    expect(rageChargesFor('barbarian', 1)).toBe(2);
    expect(rageChargesFor('barbarian', 3)).toBe(3);
    expect(rageChargesFor('barbarian', 6)).toBe(4);
    expect(rageChargesFor('barbarian', 12)).toBe(5);
    expect(rageChargesFor('barbarian', 17)).toBe(6);
    expect(rageChargesFor('wizard', 20)).toBe(0);
  });

  it('rage damage bonus +2 / +3 / +4 dle levelu', () => {
    expect(rageDamageBonus(1)).toBe(2);
    expect(rageDamageBonus(9)).toBe(3);
    expect(rageDamageBonus(16)).toBe(4);
  });
});

describe('class resources — combat aktor (ADR 0034)', () => {
  it('deriveCombatProfile nastaví Ki / rage / caster type', () => {
    const barb = hero('barbarian');
    expect(barb.rageCharges).toBe(4);
    expect(barb.rageDamageBonus).toBe(2);
    expect(canRage(barb)).toBe(true);

    const monk = hero('monk');
    expect(monk.kiPoints).toBe(8);
    expect(canRage(monk)).toBe(false);

    const warlock = hero('warlock');
    expect(warlock.casterType).toBe('pact');

    const wiz = hero('wizard');
    expect(wiz.kiPoints).toBe(0);
    expect(canRage(wiz)).toBe(false);
  });

  it('applyRage přidá fyzické resistance + damage bonus, zbytek beze změny', () => {
    const barb = hero('barbarian');
    const raged = applyRage(barb);
    for (const t of RAGE_RESIST_TYPES) expect(raged.resistances).toContain(t);
    expect(raged.attackPower).toBe(barb.attackPower + (barb.rageDamageBonus ?? 0));
    expect(raged.maxHealth).toBe(barb.maxHealth);
    expect(raged.name).toBe(barb.name);
    expect(raged.signatureAbilities).toBe(barb.signatureAbilities);
  });
});
