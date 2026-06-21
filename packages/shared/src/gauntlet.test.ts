import { describe, expect, it } from 'vitest';
import {
  applyGauntletDraft,
  baseStatsFor,
  buildGauntletEnemy,
  canCastGauntletAbility,
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
  EMPTY_PROGRESSION,
  GAUNTLET_BASIC_ATTACK,
  type CombatActor,
  type GauntletRunState,
  type SignatureAbility,
  BESTIARY,
} from './index';

function hero(
  level: number,
  klass: 'fighter' | 'wizard' | 'monk' | 'barbarian' | 'warlock' = 'fighter',
): CombatActor {
  return deriveCombatProfile({
    name: 'Hero',
    level,
    klass,
    primary: baseStatsFor('half_orc', klass, level),
    equipment: {},
    progression: EMPTY_PROGRESSION,
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

describe('spell sloty v Gauntletu (ADR 0034)', () => {
  const total = (m: Record<number, number>): number =>
    Object.values(m).reduce((a, b) => a + b, 0);

  it('rozpočet slotů se inicializuje ze snapshotu (max sloty)', () => {
    const base = hero(8, 'wizard');
    const s = startGauntletRun(base, 8, 1);
    expect(s.player.spellSlots).toEqual(base.spellSlots);
    expect(total(s.player.spellSlots)).toBeGreaterThan(0);
  });

  it('kouzlo (tier ≥ 1) bez slotu nelze seslat; cantrip i basic vždy', () => {
    const base = hero(8, 'wizard');
    const s = startGauntletRun(base, 8, 1);
    const kit = gauntletAbilities(base, s.picks);
    const spell = kit.find((a) => (a.spellTier ?? 0) >= 1)!;
    const cantrip = kit.find((a) => a.spellTier === 0)!;
    expect(canCastGauntletAbility(s, spell)).toBe(true);
    s.player.spellSlots = {}; // vyčerpáno
    expect(canCastGauntletAbility(s, spell)).toBe(false);
    expect(canCastGauntletAbility(s, cantrip)).toBe(true);
    expect(canCastGauntletAbility(s, GAUNTLET_BASIC_ATTACK)).toBe(true);
  });

  it('tah kouzlem bez slotu je neplatný (stav beze změny)', () => {
    const base = hero(8, 'wizard');
    const s = startGauntletRun(base, 8, 1);
    const spell = gauntletAbilities(base, s.picks).find((a) => (a.spellTier ?? 0) >= 1)!;
    s.player.spellSlots = {};
    const turnBefore = s.turn;
    const res = resolveGauntletTurn(base, s, spell.id);
    expect(res.events).toEqual([]);
    expect(res.state.turn).toBe(turnBefore);
  });

  it('seslání kouzla utratí slot a sloty se NEresetují mezi vlnami (per-run rozpočet)', () => {
    const base = hero(8, 'wizard');
    let s = startGauntletRun(base, 8, 1);
    const spell = gauntletAbilities(base, s.picks).find((a) => (a.spellTier ?? 0) >= 1)!;
    const start = total(s.player.spellSlots);
    s = resolveGauntletTurn(base, s, spell.id).state;
    const afterCast = total(s.player.spellSlots);
    expect(afterCast).toBe(start - 1);
    // Dotáhni vlnu (basic údery = zdarma) + draft → další vlna.
    s = clearWave(base, s);
    if (s.status === 'drafting' && s.draft) s = applyGauntletDraft(base, s, s.draft[0]!.id, 8);
    // Utracený slot zůstává — žádný per-wave reset na max.
    expect(total(s.player.spellSlots)).toBe(afterCast);
  });
});

describe('class resources v Gauntletu (ADR 0034)', () => {
  const total = (m: Record<number, number>): number =>
    Object.values(m).reduce((a, b) => a + b, 0);

  it('Ki: Monkova technika je omezená per-run Ki poolem', () => {
    const base = hero(8, 'monk');
    const s = startGauntletRun(base, 8, 1);
    expect(s.player.kiPoints).toBe(base.kiPoints);
    const kiAbility = gauntletAbilities(base, s.picks).find((a) => (a.kiCost ?? 0) > 0)!;
    expect(canCastGauntletAbility(s, kiAbility)).toBe(true);
    s.player.kiPoints = 0;
    expect(canCastGauntletAbility(s, kiAbility)).toBe(false);
  });

  it('Rage: Barbarian se na startu rozzuří a utratí charge (per-run)', () => {
    const base = hero(3, 'barbarian'); // 3 charges
    const s = startGauntletRun(base, 3, 1);
    expect(s.player.raging).toBe(true);
    expect(s.player.rageCharges).toBe((base.rageCharges ?? 0) - 1);
  });

  it('Pact: Warlock recharguje spell sloty každou vlnu (short rest)', () => {
    const base = hero(8, 'warlock');
    let s = startGauntletRun(base, 1, 1); // slabý nepřítel (level 1) → warlock přežije
    const max = total(s.player.spellSlots);
    expect(max).toBeGreaterThan(0);
    s.player.spellSlots = {}; // vyčerpáno
    s = clearWave(base, s);
    expect(s.status).toBe('drafting');
    // Engine-only: draft staví service; tady ho postavíme ručně a posuneme vlnu.
    s.draft = rollGauntletDraft(base, s, new SeededRng(1));
    s = applyGauntletDraft(base, s, s.draft[0]!.id, 1);
    expect(total(s.player.spellSlots)).toBe(max); // short rest (pact) obnovil sloty
  });
});

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
      klass: 'fighter',
      primary: baseStatsFor('half_orc', 'fighter', 60),
      equipment: { strength: 120, constitution: 120, attack_power: 200, armor: 400, crit_rating: 40 },
      progression: EMPTY_PROGRESSION,
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

describe('conditiony v Gauntletu (Slice 2d)', () => {
  it('hráčské control kouzlo stunne nepřítele, který pak vynechá protiúder', () => {
    const base = hero(10, 'wizard');
    const hold: SignatureAbility = {
      id: 'gaunt_hold',
      name: 'Hold Person',
      kind: 'strike',
      cooldownSec: 0,
      damageMult: 0,
      save: { ability: 'wisdom', effect: 'negate' },
      condition: { type: 'stunned', durationTurns: 2 },
    };
    base.signatureAbilities = [...base.signatureAbilities, hold];
    base.spellSaveDc = 99; // nepřítel save vždy selže → stun padne
    const state = startGauntletRun(base, 10, 7);
    const enemyHpStart = state.enemy!.currentHealth;

    let appliedSeen = false;
    let cannotActSeen = false;
    let s = state;
    for (let i = 0; i < 5 && s.status === 'in_combat'; i++) {
      s = resolveGauntletTurn(base, s, 'gaunt_hold').state;
      if (s.log.some((e) => (e.message ?? '').includes('is stunned ('))) appliedSeen = true;
      if (s.log.some((e) => (e.message ?? '').includes('cannot act'))) cannotActSeen = true;
    }
    expect(appliedSeen).toBe(true); // condition se uvalila na nepřítele
    expect(cannotActSeen).toBe(true); // stunnutý nepřítel vynechal protiúder
    // Control kouzlo nedělá poškození → enemy HP kleslo nanejvýš o 0 (žádný útok hráče).
    expect(s.enemy!.currentHealth).toBe(enemyHpStart);
  });

  it('stunnutý hráč ztratí tah — ability se neprovede', () => {
    const base = hero(10, 'wizard');
    const state = startGauntletRun(base, 10, 3);
    state.player.conditions = [{ type: 'stunned', turns: 1 }];
    const enemyHpBefore = state.enemy!.currentHealth;

    const r = resolveGauntletTurn(base, state, GAUNTLET_BASIC_ATTACK.id);
    expect(r.state.log.some((e) => (e.message ?? '').includes('loses the turn'))).toBe(true);
    // Hráč nezaútočil → nepřítel neztratil HP útokem hráče (žádný DoT v tomto testu).
    expect(r.state.enemy!.currentHealth).toBe(enemyHpBefore);
    // Stun (turns 1) tiknul na začátku hráčova tahu → vypršel.
    expect(r.state.player.conditions?.length ?? 0).toBe(0);
  });

  it('conditiony se setřou při spawnu nové vlny (short rest)', () => {
    const base = hero(10, 'fighter');
    let s = startGauntletRun(base, 10, 11);
    s.player.conditions = [{ type: 'slowed', turns: 5 }];
    s = clearWave(base, s);
    if (s.status === 'drafting' && s.draft) s = applyGauntletDraft(base, s, s.draft[0]!.id, 10);
    // Nová vlna = short rest → conditiony hráče pryč.
    expect(s.player.conditions?.length ?? 0).toBe(0);
  });
});

describe('Enemy schopnosti v Gauntletu (Slice 2d — draw z katalogu)', () => {
  it('buildGauntletEnemy nese templateId z katalogu (jméno sedí na šablonu)', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      const e = buildGauntletEnemy(10, 1, new SeededRng(seed));
      expect(e.templateId).toBeDefined();
      expect(BESTIARY[e.templateId!]).toBeDefined();
      expect(e.name).toBe(BESTIARY[e.templateId!]!.name);
      seen.add(e.templateId!);
    }
    expect(seen.size).toBeGreaterThan(1); // pool je rozmanitý
  });

  it('nepřítel s katalogovou condition ability stunne hráče (typový úder + save → condition)', () => {
    const base = hero(20);
    const state = startGauntletRun(base, 20, 7);
    // Vnutíme nepřítele se stun ability z katalogu (Mind Devourer — Mind Blast,
    // INT save or stunned). Obří HP (nepadne), slabý úder, vysoká úroveň → vysoké
    // save DC → hráč selže → stun. Cooldown reset přijde s novou vlnou (sem nedojde).
    state.enemy = {
      name: BESTIARY.mind_devourer!.name,
      templateId: 'mind_devourer',
      isElite: true,
      maxHealth: 50_000_000,
      currentHealth: 50_000_000,
      attackPower: 1,
      armor: 0,
      level: 30,
      dots: [],
      conditions: [],
      cooldowns: {},
    };
    let condSeen = false;
    let stunLostTurn = false;
    let s = state;
    for (let i = 0; i < 40 && s.status === 'in_combat'; i++) {
      const r = resolveGauntletTurn(base, s, GAUNTLET_BASIC_ATTACK.id);
      s = r.state;
      if (s.log.some((e) => e.source === s.enemy?.name && (e.message ?? '').includes('Mind Blast'))) {
        // ability se vystřelila
      }
      if (s.log.some((e) => (e.message ?? '').includes('stunned'))) condSeen = true;
      if (s.log.some((e) => (e.message ?? '').includes('is stunned and loses the turn'))) stunLostTurn = true;
    }
    expect(condSeen).toBe(true); // condition se uvalila
    expect(stunLostTurn).toBe(true); // a hráč kvůli ní ztratil tah
  });
});
