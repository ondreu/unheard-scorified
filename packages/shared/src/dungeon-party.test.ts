import { describe, expect, it } from 'vitest';
import {
  DUNGEON_BASIC_ATTACK,
  DUNGEON_DODGE_ACTION,
  DUNGEON_PASS_ACTION,
  EMPTY_PROGRESSION,
  baseStatsFor,
  deriveCombatProfile,
  deriveRaidActor,
  hasCondition,
  partyMemberAbilities,
  partyRoundReady,
  resolvePartyRound,
  startPartyRun,
  submitPartyAction,
  type ClassId,
  type PartyRunSeatInput,
  type PartyRunState,
  type RaidActor,
  type RaidRole,
  type SignatureAbility,
} from './index';

function actor(klass: ClassId, role: RaidRole, name: string, geared = true, level = 20): RaidActor {
  const base = deriveCombatProfile({
    name,
    level,
    klass,
    primary: baseStatsFor('human', klass, level),
    equipment: geared ? { attack_power: 200, strength: 60, constitution: 120, armor: 200 } : {},
    progression: EMPTY_PROGRESSION,
  });
  return deriveRaidActor(base, role);
}

/** Party: 2 reální hráči (tank + dps) + 1 AI healer. */
function makeSeats(geared = true): PartyRunSeatInput[] {
  return [
    { owner: 'char-tank', actor: actor('fighter', 'tank', 'Tankman', geared) },
    { owner: 'char-dps', actor: actor('rogue', 'dps', 'Stabby', geared) },
    { owner: null, actor: actor('cleric', 'healer', 'Lyra', geared) },
  ];
}

function weakestTarget(state: PartyRunState): number {
  let idx = 0;
  let lowest = Infinity;
  for (const e of state.enemies) {
    if (e.currentHealth > 0 && e.currentHealth < lowest) {
      lowest = e.currentHealth;
      idx = e.idx;
    }
  }
  return idx;
}

/** Odehraje run: každé kolo všichni živí lidé pošlou basic_attack, pak resolve. */
function autoplay(state: PartyRunState, submitHumans = true): PartyRunState {
  let guard = 0;
  while (state.status === 'in_combat' && guard++ < 5000) {
    if (submitHumans) {
      for (const m of state.members) {
        if (m.owner != null && m.currentHealth > 0) {
          submitPartyAction(state, m.owner, DUNGEON_BASIC_ATTACK.id, weakestTarget(state));
        }
      }
    }
    resolvePartyRound(state);
  }
  return state;
}

describe('startPartyRun', () => {
  it('založí run s členy (lidé + AI) a prvním encounterem', () => {
    const state = startPartyRun(makeSeats(), 'ragefire_chasm', 3, 20, 1);
    expect(state.members.length).toBe(3);
    expect(state.members.filter((m) => m.owner != null).length).toBe(2);
    expect(state.members.find((m) => m.owner === null)?.role).toBe('healer');
    expect(state.enemies.length).toBeGreaterThan(0);
    expect(state.status).toBe('in_combat');
    expect(state.members.every((m) => m.currentHealth === m.maxHealth)).toBe(true);
  });

  it('partyMemberAbilities = základní úder + nepasivní signatures', () => {
    const kit = partyMemberAbilities(actor('fighter', 'dps', 'X'));
    expect(kit[0]!.id).toBe(DUNGEON_BASIC_ATTACK.id);
    expect(kit.every((a) => a.kind !== 'buff')).toBe(true);
  });
});

describe('submitPartyAction — vlastnictví + buffrování', () => {
  it('cizí characterId nemůže odeslat akci', () => {
    const state = startPartyRun(makeSeats(), 'ragefire_chasm', 3, 20, 2);
    const res = submitPartyAction(state, 'someone-else', DUNGEON_BASIC_ATTACK.id, 0);
    expect(res.ok).toBe(false);
  });

  it('ready je true až když odešlou všichni živí lidé', () => {
    const state = startPartyRun(makeSeats(), 'ragefire_chasm', 3, 20, 3);
    const first = submitPartyAction(state, 'char-tank', DUNGEON_BASIC_ATTACK.id, weakestTarget(state));
    expect(first.ok).toBe(true);
    expect(first.ready).toBe(false); // dps ještě neodeslal
    expect(partyRoundReady(state)).toBe(false);
    const second = submitPartyAction(state, 'char-dps', DUNGEON_BASIC_ATTACK.id, weakestTarget(state));
    expect(second.ready).toBe(true); // AI healer se nepočítá
    expect(partyRoundReady(state)).toBe(true);
  });
});

describe('conditiony (Enemy schopnosti, Slice 2b)', () => {
  const stunStrike: SignatureAbility = {
    id: 'enemy_stun',
    name: 'Mind Blast',
    kind: 'strike',
    cooldownSec: 0,
    damageMult: 1,
    damageType: 'psychic',
    save: { ability: 'intelligence', effect: 'half' },
    condition: { type: 'stunned', durationTurns: 1 },
  };

  function rigStunEnemy(state: PartyRunState): void {
    const e = state.enemies[0]!;
    e.maxHealth = 1_000_000;
    e.currentHealth = 1_000_000;
    e.actor = { ...e.actor, attackPower: 1, attackBonus: 99, spellSaveDc: 99, signatureAbilities: [stunStrike] };
    e.cooldowns = {};
    state.enemies = [e];
  }

  it('enemy condition ability stunne threat cíl, který pak ztratí tah', () => {
    const state = startPartyRun(makeSeats(), 'ragefire_chasm', 3, 20, 7);
    rigStunEnemy(state);

    let appliedSeen = false;
    let lostTurnSeen = false;
    for (let i = 0; i < 12 && state.status === 'in_combat'; i++) {
      for (const m of state.members) {
        if (m.owner != null && m.currentHealth > 0) submitPartyAction(state, m.owner, DUNGEON_BASIC_ATTACK.id, weakestTarget(state));
      }
      resolvePartyRound(state);
      if (state.log.some((e) => (e.message ?? '').includes('is stunned ('))) appliedSeen = true;
      if (state.log.some((e) => (e.message ?? '').includes('loses the turn'))) lostTurnSeen = true;
    }
    expect(appliedSeen).toBe(true);
    expect(lostTurnSeen).toBe(true);
  });

  it('short rest mezi encountery setře conditiony členů', () => {
    const state = startPartyRun(makeSeats(), 'ragefire_chasm', 3, 20, 7);
    state.members[0]!.conditions = [{ type: 'restrained', turns: 5 }];
    state.enemies.forEach((e) => (e.currentHealth = 0)); // vyčisti encounter
    resolvePartyRound(state);
    expect(hasCondition(state.members[0]!.conditions, 'restrained')).toBe(false);
  });
});

describe('resolvePartyRound', () => {
  it('AI fallback: nečinný hráč dostane AI tah (kolo se přesto vyhodnotí)', () => {
    const state = startPartyRun(makeSeats(), 'ragefire_chasm', 3, 20, 7);
    const before = state.enemies.reduce((n, e) => n + e.currentHealth, 0);
    // Nikdo z lidí neodešle → resolve s plným AI fallbackem.
    resolvePartyRound(state);
    const after = state.enemies.reduce((n, e) => n + e.currentHealth, 0);
    expect(after).toBeLessThan(before); // party (AI fallback) udělala poškození
    expect(state.log.some((e) => e.source === 'Tankman' || e.source === 'Stabby' || e.source === 'Lyra')).toBe(true);
  });

  it('geared party (2 lidé + AI) vyčistí dungeon', () => {
    const state = autoplay(startPartyRun(makeSeats(), 'ragefire_chasm', 3, 20, 2024));
    expect(state.status).toBe('cleared');
    expect(state.encountersCleared).toBe(state.encounterCount);
    expect(state.log.at(-1)?.type).toBe('victory');
  });

  it('slabá party na endgame dungeonu wipne', () => {
    const seats: PartyRunSeatInput[] = [
      { owner: 'a', actor: actor('wizard', 'dps', 'Frail', false, 1) },
      { owner: 'b', actor: actor('rogue', 'dps', 'Squishy', false, 1) },
    ];
    const state = autoplay(startPartyRun(seats, 'stratholme', 3, 1, 5));
    expect(state.status).toBe('wiped');
    expect(state.log.some((e) => e.type === 'defeat')).toBe(true);
  });

  it('determinismus: stejný seed + stejné akce → stejný výsledek', () => {
    const a = autoplay(startPartyRun(makeSeats(), 'deadmines', 3, 20, 99));
    const b = autoplay(startPartyRun(makeSeats(), 'deadmines', 3, 20, 99));
    expect(a.status).toBe(b.status);
    expect(a.turn).toBe(b.turn);
    expect(a.log.length).toBe(b.log.length);
  });

  it('buffer se po vyhodnocení kola vyčistí', () => {
    const state = startPartyRun(makeSeats(), 'ragefire_chasm', 3, 20, 11);
    submitPartyAction(state, 'char-tank', DUNGEON_BASIC_ATTACK.id, weakestTarget(state));
    submitPartyAction(state, 'char-dps', DUNGEON_BASIC_ATTACK.id, weakestTarget(state));
    resolvePartyRound(state);
    expect(Object.keys(state.pending).length).toBe(0);
  });
});

describe('friendly targeting — heal cílí zvolený slot člena', () => {
  /** Party 3 lidí: tank (slot 0) + dps (slot 1) + healer (slot 2). */
  function humanHealerSeats(): PartyRunSeatInput[] {
    return [
      { owner: 'char-tank', actor: actor('fighter', 'tank', 'Tankman') },
      { owner: 'char-dps', actor: actor('rogue', 'dps', 'Stabby') },
      { owner: 'char-healer', actor: actor('cleric', 'healer', 'Lyra') },
    ];
  }

  function healAbilityId(): string {
    const id = partyMemberAbilities(actor('cleric', 'healer', 'Lyra')).find((a) => a.kind === 'heal')?.id;
    expect(id, 'cleric má mít heal ability').toBeDefined();
    return id!;
  }

  /** Odešle basic za tank+dps a daný heal za healera, pak vyhodnotí kolo. */
  function castHeal(state: PartyRunState, healId: string, healTargetSlot: number): void {
    submitPartyAction(state, 'char-tank', DUNGEON_BASIC_ATTACK.id, weakestTarget(state));
    submitPartyAction(state, 'char-dps', DUNGEON_BASIC_ATTACK.id, weakestTarget(state));
    submitPartyAction(state, 'char-healer', healId, healTargetSlot);
    resolvePartyRound(state);
  }

  it('targetId = slot tanka → léčí tanka, ne nejzraněnějšího', () => {
    const state = startPartyRun(humanHealerSeats(), 'ragefire_chasm', 3, 20, 7);
    // dps je víc zraněný než tank → bez friendly targetingu by heal šel na dps.
    state.members[0]!.currentHealth = 40; // tank
    state.members[1]!.currentHealth = 1; // dps (nejzraněnější)
    castHeal(state, healAbilityId(), 0); // explicitně tank (slot 0)
    const heal = state.log.find((e) => e.type === 'heal' && e.source === 'Lyra');
    expect(heal?.target).toBe('Tankman');
  });

  it('neplatný slot → fallback na nejzraněnějšího člena', () => {
    const state = startPartyRun(humanHealerSeats(), 'ragefire_chasm', 3, 20, 7);
    state.members[1]!.currentHealth = 1; // dps nejzraněnější
    castHeal(state, healAbilityId(), 99); // mimo rozsah
    const heal = state.log.find((e) => e.type === 'heal' && e.source === 'Lyra');
    expect(heal?.target).toBe('Stabby');
  });

  it('mitigation: friendly targeting udělí ochranné okno zvolenému slotu', () => {
    const tank = actor('fighter', 'tank', 'Tankman');
    const dps = actor('rogue', 'dps', 'Stabby');
    const healer = actor('cleric', 'healer', 'Lyra');
    const aegis: SignatureAbility = { id: 'test_aegis', name: 'Aegis', description: '', kind: 'mitigation', cooldownSec: 0, damageMult: 0, mitigationPct: 0.5, mitigationDurationSec: 9 };
    healer.signatureAbilities = [...healer.signatureAbilities, aegis];
    const state = startPartyRun(
      [
        { owner: 'char-tank', actor: tank },
        { owner: 'char-dps', actor: dps },
        { owner: 'char-healer', actor: healer },
      ],
      'ragefire_chasm',
      3,
      20,
      7,
    );
    submitPartyAction(state, 'char-tank', DUNGEON_BASIC_ATTACK.id, weakestTarget(state));
    submitPartyAction(state, 'char-dps', DUNGEON_BASIC_ATTACK.id, weakestTarget(state));
    submitPartyAction(state, 'char-healer', 'test_aegis', 0); // na tanka (slot 0)
    resolvePartyRound(state);
    const tankMember = state.members.find((m) => m.slot === 0)!;
    expect(tankMember.mitigationPct).toBe(0.5);
    expect(tankMember.mitigationTurns).toBeGreaterThan(0);
  });
});

describe('formální ukončení tahu — Pass / Dodge (MP)', () => {
  it('Pass: lidé neudělají nic, kolo se vyhodnotí a posune', () => {
    const state = startPartyRun(makeSeats(), 'ragefire_chasm', 3, 20, 7);
    const turnBefore = state.turn;
    expect(submitPartyAction(state, 'char-tank', DUNGEON_PASS_ACTION, 0).ok).toBe(true);
    submitPartyAction(state, 'char-dps', DUNGEON_PASS_ACTION, 0);
    resolvePartyRound(state);
    expect(state.turn).toBe(turnBefore + 1);
    expect(state.log.some((e) => (e.message ?? '').includes('ends the turn'))).toBe(true);
  });

  it('Dodge: nastaví dodging na člena (vyprší až jeho dalším tahem)', () => {
    const state = startPartyRun(makeSeats(), 'ragefire_chasm', 3, 20, 7);
    submitPartyAction(state, 'char-tank', DUNGEON_DODGE_ACTION, 0);
    submitPartyAction(state, 'char-dps', DUNGEON_BASIC_ATTACK.id, weakestTarget(state));
    resolvePartyRound(state);
    const tank = state.members.find((m) => m.owner === 'char-tank')!;
    expect(tank.dodging).toBe(true);
  });
});
