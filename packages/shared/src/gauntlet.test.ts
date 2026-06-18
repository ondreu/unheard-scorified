import { describe, expect, it } from 'vitest';
import {
  applyGauntletDraft,
  baseStatsFor,
  buildGauntletEnemy,
  capGauntletReward,
  deriveCombatProfile,
  effectivePlayerActor,
  gauntletAbilities,
  gauntletDailyGoldCap,
  gauntletDailyXpCap,
  gauntletRunReward,
  healFalloff,
  resolveGauntletTurn,
  rollGauntletDraft,
  startGauntletRun,
  SeededRng,
  aggregateTalentEffects,
  GAUNTLET_BASIC_ATTACK,
  type CombatActor,
  type GauntletRunState,
} from './index';

function hero(level: number, klass: 'warrior' | 'mage' = 'warrior'): CombatActor {
  return deriveCombatProfile({
    name: 'Hero',
    level,
    klass,
    primary: baseStatsFor('orc', klass, level),
    equipment: {},
    talents: aggregateTalentEffects(klass, {}),
  });
}

/** Dotáhne aktuální vlnu základním úderem do porážky nepřítele (nebo smrti). */
function clearWave(base: CombatActor, state: GauntletRunState): GauntletRunState {
  let s = state;
  for (let i = 0; i < 200 && s.status === 'in_combat'; i++) {
    s = resolveGauntletTurn(base, s, GAUNTLET_BASIC_ATTACK.id).state;
  }
  return s;
}

describe('buildGauntletEnemy', () => {
  it('HP i dmg rostou s vlnou; elite vlna je silnější', () => {
    const rng = () => new SeededRng(1);
    const w1 = buildGauntletEnemy(20, 1, rng());
    const w3 = buildGauntletEnemy(20, 3, rng());
    expect(w3.maxHealth).toBeGreaterThan(w1.maxHealth);
    expect(w3.attackPower).toBeGreaterThanOrEqual(w1.attackPower);

    const elite = buildGauntletEnemy(20, 5, rng());
    const normalRef = buildGauntletEnemy(20, 4, rng());
    expect(elite.isElite).toBe(true);
    expect(elite.maxHealth).toBeGreaterThan(normalRef.maxHealth);
  });

  it('je deterministický pro stejný seed', () => {
    const a = buildGauntletEnemy(30, 7, new SeededRng(42));
    const b = buildGauntletEnemy(30, 7, new SeededRng(42));
    expect(a).toEqual(b);
  });
});

describe('startGauntletRun', () => {
  it('založí run na plné HP s vlnou 1', () => {
    const base = hero(20);
    const s = startGauntletRun(base, 20, 1);
    expect(s.wave).toBe(1);
    expect(s.status).toBe('in_combat');
    expect(s.enemy).not.toBeNull();
    expect(s.player.currentHealth).toBe(s.player.maxHealth);
  });

  it('základní úder je vždy v kitu', () => {
    const base = hero(20);
    const ids = gauntletAbilities(base, []).map((a) => a.id);
    expect(ids).toContain(GAUNTLET_BASIC_ATTACK.id);
  });
});

describe('resolveGauntletTurn', () => {
  it('úder snižuje HP nepřítele a je deterministický', () => {
    const base = hero(25);
    const a = clearWaveOneTurn(base);
    const b = clearWaveOneTurn(base);
    expect(a.enemy?.currentHealth).toEqual(b.enemy?.currentHealth);
    expect(a.enemy!.currentHealth).toBeLessThan(a.enemy!.maxHealth);
  });

  function clearWaveOneTurn(base: CombatActor): GauntletRunState {
    const s = startGauntletRun(base, 25, 7);
    return resolveGauntletTurn(base, s, GAUNTLET_BASIC_ATTACK.id).state;
  }

  it('silná postava vyčistí první vlnu a přejde do draftu', () => {
    const base = hero(40);
    const s = clearWave(base, startGauntletRun(base, 40, 3));
    expect(s.status).toBe('drafting');
    expect(s.wavesCleared).toBe(1);
  });

  it('run nakonec skončí terminálním stavem (smrt nebo dokončení) a postoupí vlnami', () => {
    const base = hero(10);
    let s = startGauntletRun(base, 10, 99);
    for (let i = 0; i < 20000 && (s.status === 'in_combat' || s.status === 'drafting'); i++) {
      if (s.status === 'drafting' && s.draft) {
        s = applyGauntletDraft(base, s, s.draft[0]!.id, 10);
      } else if (s.status === 'drafting') {
        s.draft = rollGauntletDraft(base, s, new SeededRng(s.wave));
      } else {
        s = resolveGauntletTurn(base, s, GAUNTLET_BASIC_ATTACK.id).state;
      }
    }
    expect(['dead', 'retired']).toContain(s.status);
    expect(s.wavesCleared).toBeGreaterThan(0);
  });

  it('rostoucí obtížnost přeroste i silnou postavu → smrt před stropem vln', () => {
    // Level 60 + gear, optimální draft (vždy první) → exponenciální ramp ji
    // nakonec zabije dávno před GAUNTLET_MAX_WAVE (žádný triviální cap-out).
    const base = deriveCombatProfile({
      name: 'Veteran',
      level: 60,
      klass: 'warrior',
      primary: baseStatsFor('orc', 'warrior', 60),
      equipment: { strength: 120, constitution: 120, attack_power: 200, armor: 400, crit_rating: 40 },
      talents: aggregateTalentEffects('warrior', {}),
    });
    let s = startGauntletRun(base, 60, 4242);
    for (let i = 0; i < 20000 && (s.status === 'in_combat' || s.status === 'drafting'); i++) {
      if (s.status === 'drafting' && s.draft) {
        s = applyGauntletDraft(base, s, s.draft[0]!.id, 60);
      } else if (s.status === 'drafting') {
        s.draft = rollGauntletDraft(base, s, new SeededRng(s.wave));
      } else {
        s = resolveGauntletTurn(base, s, GAUNTLET_BASIC_ATTACK.id).state;
      }
    }
    expect(s.status).toBe('dead');
    expect(s.wavesCleared).toBeGreaterThan(2);
    expect(s.wavesCleared).toBeLessThan(40);
  });

  it('staty nepřítele rostou exponenciálně (vlna 10 >> vlna 5)', () => {
    const w5 = buildGauntletEnemy(30, 5, new SeededRng(1));
    const w10 = buildGauntletEnemy(30, 10, new SeededRng(1));
    expect(w10.attackPower).toBeGreaterThan(w5.attackPower * 1.5);
    expect(w10.maxHealth).toBeGreaterThan(w5.maxHealth * 1.5);
  });

  it('nevalidní/nedostupná ability nezmění stav', () => {
    const base = hero(20);
    const s = startGauntletRun(base, 20, 1);
    const before = JSON.stringify(s);
    const after = resolveGauntletTurn(base, s, 'no_such_ability').state;
    expect(JSON.stringify(after)).toEqual(before);
  });
});

describe('draft', () => {
  it('nabídne 3 možnosti a výběr posune na další vlnu', () => {
    const base = hero(40);
    let s = clearWave(base, startGauntletRun(base, 40, 5));
    expect(s.status).toBe('drafting');
    s.draft = rollGauntletDraft(base, s, new SeededRng(123));
    expect(s.draft.length).toBe(3);

    const optionId = s.draft[0]!.id;
    s = applyGauntletDraft(base, s, optionId, 40);
    expect(s.wave).toBe(2);
    expect(s.status).toBe('in_combat');
    expect(s.picks.length).toBe(1);
  });

  it('buff draft zvedne efektivní staty', () => {
    const base = hero(30);
    const buffed = effectivePlayerActor(base, [
      { kind: 'buff', id: 'might', label: "Berserker's Might", attackMult: 1.15 },
    ]);
    expect(buffed.attackPower).toBeGreaterThan(base.attackPower);
  });

  it('heal fall-off: opakované léčení je čím dál slabší', () => {
    expect(healFalloff(0)).toBe(1);
    expect(healFalloff(1)).toBeLessThan(1);
    expect(healFalloff(2)).toBeLessThan(healFalloff(1));

    const base = hero(40);
    // Postav drafting stav s nízkým HP a vlož heal kartu ručně.
    let s = clearWave(base, startGauntletRun(base, 40, 11));
    s.player.currentHealth = 1;
    const healCard = {
      id: 'buff:field_dressing',
      kind: 'buff' as const,
      name: 'Field Dressing',
      description: 'Heal 30%.',
      pick: { kind: 'buff' as const, id: 'field_dressing', label: 'Field Dressing', healPct: 0.3 },
    };
    s.draft = [healCard];
    const hpBefore1 = 1;
    s = applyGauntletDraft(base, s, healCard.id, 40);
    const firstHeal = s.player.currentHealth - hpBefore1;
    expect(s.healsUsed).toBe(1);

    // Druhý heal hned (znovu drafting, nízké HP) → menší přírůstek než první.
    s.status = 'drafting';
    s.player.currentHealth = 1;
    s.draft = [healCard];
    s = applyGauntletDraft(base, s, healCard.id, 40);
    const secondHeal = s.player.currentHealth - 1;
    expect(secondHeal).toBeLessThan(firstHeal);
    expect(s.healsUsed).toBe(2);
  });

  it('mezi vlnami se HP NEregeneruje automaticky (léčí jen draft)', () => {
    const base = hero(40);
    let s = clearWave(base, startGauntletRun(base, 40, 21));
    s.player.currentHealth = 5;
    // Vyber ne-léčivý draft (gear/ability/non-heal buff).
    s.draft = rollGauntletDraft(base, s, new SeededRng(77));
    const nonHeal = s.draft.find((o) => !/Heal/.test(o.description)) ?? s.draft[0]!;
    const hpBefore = s.player.currentHealth;
    s = applyGauntletDraft(base, s, nonHeal.id, 40);
    // Bez navýšení max HP zůstane current stejné (žádný auto-heal mezi vlnami).
    if ((nonHeal.pick.bonusMaxHealth ?? 0) === 0 && (nonHeal.pick.maxHealthMult ?? 1) === 1) {
      expect(s.player.currentHealth).toBe(hpBefore);
    }
  });

  it('ability draft přidá nový spell do kitu pro run', () => {
    const base = hero(20);
    const before = gauntletAbilities(base, []).length;
    const draft = rollGauntletDraft(base, startGauntletRun(base, 20, 1), new SeededRng(7));
    const abilityOption = draft.find((o) => o.kind === 'ability');
    expect(abilityOption).toBeDefined();
    const after = gauntletAbilities(base, [abilityOption!.pick]).length;
    expect(after).toBe(before + 1);
  });
});

describe('odměny + denní strop', () => {
  it('odměna roste s počtem vln', () => {
    const a = gauntletRunReward(2, 30, new SeededRng(1));
    const b = gauntletRunReward(8, 30, new SeededRng(1));
    expect(b.xp).toBeGreaterThan(a.xp);
    expect(b.gold).toBeGreaterThan(a.gold);
  });

  it('žádné vyčištěné vlny = žádná odměna', () => {
    expect(gauntletRunReward(0, 30, new SeededRng(1))).toEqual({ xp: 0, gold: 0, items: [] });
  });

  it('denní strop ořízne přebytek', () => {
    const level = 25;
    const xpCap = gauntletDailyXpCap(level);
    const goldCap = gauntletDailyGoldCap(level);
    const big = { xp: xpCap * 2, gold: goldCap * 2, items: ['copper_ore'] };
    const capped = capGauntletReward(big, level, xpCap - 10, goldCap - 5);
    expect(capped.xp).toBe(10);
    expect(capped.gold).toBe(5);

    const exhausted = capGauntletReward(big, level, xpCap, goldCap);
    expect(exhausted).toEqual({ xp: 0, gold: 0, items: [] });
  });
});
