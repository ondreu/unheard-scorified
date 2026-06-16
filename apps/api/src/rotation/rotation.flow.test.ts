import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { BuffRepository } from '../buff/buff.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import { TalentRepository } from '../talent/talent.repository';
import { TalentService } from '../talent/talent.service';
import { RotationRepository } from './rotation.repository';
import { RotationService } from './rotation.service';

/**
 * Integrační testy MIL deklarativní rotace nad in-memory Postgresem (pglite).
 * Ověřuje: dostupné ability dle talentů, default rotace, uložení + očištění,
 * vlastnictví.
 */
describe('MIL flow: deklarativní rotace', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let talents: TalentService;
  let rotation: RotationService;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    const talentRepo = new TalentRepository(db);
    talents = new TalentService(charRepo, talentRepo);
    const inventory = new InventoryService(charRepo, new InventoryRepository(db), new BuffRepository(db));
    rotation = new RotationService(charRepo, talentRepo, new RotationRepository(db), inventory);
  });

  /** Postava s capstone talentem odemykajícím signature ability (Mortal Strike). */
  async function warriorWithMortalStrike(
    username: string,
    name: string,
  ): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'human', class: 'warrior' });
    // Vysoký level → dost bodů. Naplň Arms strom k capstone (tier 28).
    await charRepo.addRewards(char.id, 60_000_000, 0);
    const arms: [string, number][] = [
      ['warrior.arms.weapon_expertise', 5],
      ['warrior.arms.tactical_mastery', 5],
      ['warrior.arms.deflection', 5],
      ['warrior.arms.improved_rend', 3],
      ['warrior.arms.poleaxe_specialization', 5],
      ['warrior.arms.deep_wounds', 3],
      ['warrior.arms.two_handed_specialization', 4], // → 30 pts in tree (≥28)
    ];
    for (const [id, ranks] of arms) {
      for (let i = 0; i < ranks; i++) await talents.allocate(accountId, char.id, id);
    }
    await talents.allocate(accountId, char.id, 'warrior.arms.mortal_strike'); // tier 28 capstone
    return { accountId, id: char.id };
  }

  it('default rotace obsahuje odemčené ability se always podmínkou', async () => {
    const { accountId, id } = await warriorWithMortalStrike('rota', 'Varian');
    const view = await rotation.getRotation(accountId, id);
    expect(view.abilities.map((a) => a.id)).toContain('mortal_strike');
    const rule = view.rules.find((r) => r.abilityId === 'mortal_strike');
    expect(rule).toMatchObject({ enabled: true, conditionType: 'always' });
  });

  it('postava na lvl 1 má baseline ability, ale ne capstone', async () => {
    const tokens = await auth.register('rotb', 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name: 'Anduin', race: 'human', class: 'warrior' });
    const view = await rotation.getRotation(accountId, char.id);
    const ids = view.abilities.map((a) => a.id);
    expect(ids).toContain('warrior_heroic_strike'); // baseline lvl 1
    expect(ids).not.toContain('warrior_overpower'); // baseline lvl 14
    expect(ids).not.toContain('mortal_strike'); // capstone (talent)
  });

  it('uložení rotace přežije a očistí neznámé ability + clampne práh', async () => {
    const { accountId, id } = await warriorWithMortalStrike('rotc', 'Bolvar');
    const saved = await rotation.setRotation(accountId, id, {
      rules: [
        { abilityId: 'mortal_strike', enabled: true, conditionType: 'enemy_hp_below', threshold: 9 },
        { abilityId: 'ghost_ability', enabled: true, conditionType: 'always' },
      ],
    });
    const ms = saved.rules.find((r) => r.abilityId === 'mortal_strike')!;
    expect(ms.threshold).toBe(1); // 9 → clamp 1
    expect(saved.rules.some((r) => r.abilityId === 'ghost_ability')).toBe(false);

    // Načtení vrátí uložený stav.
    const reloaded = await rotation.getRotation(accountId, id);
    expect(reloaded.rules.find((r) => r.abilityId === 'mortal_strike')).toMatchObject({
      conditionType: 'enemy_hp_below',
      threshold: 1,
    });
  });

  it('rotationForCombat vrací undefined bez uložené rotace, jinak očištěnou', async () => {
    const { accountId, id } = await warriorWithMortalStrike('rotd', 'Tirion');
    expect(await rotation.rotationForCombat(id, 'warrior', 60)).toBeUndefined();
    await rotation.setRotation(accountId, id, {
      rules: [{ abilityId: 'mortal_strike', enabled: false, conditionType: 'always' }],
    });
    const forCombat = await rotation.rotationForCombat(id, 'warrior', 60);
    expect(forCombat?.rules.find((r) => r.abilityId === 'mortal_strike')?.enabled).toBe(false);
  });

  it('cizí účet nemůže číst/ukládat rotaci', async () => {
    const owner = await warriorWithMortalStrike('rote', 'Grom');
    const tokens = await auth.register('rotf', 'password123');
    const otherAccount = auth.verifyAccessToken(tokens.accessToken).sub;
    await expect(rotation.getRotation(otherAccount, owner.id)).rejects.toThrow();
    await expect(rotation.setRotation(otherAccount, owner.id, { rules: [] })).rejects.toThrow();
  });

  it('testDummy odbojuje sandbox proti trénovacímu terči a vrátí timeline', async () => {
    const { accountId, id } = await warriorWithMortalStrike('rotg', 'Sylvanas');
    const result = await rotation.testDummy(accountId, id, 'dps', 30);
    expect(result.durationSec).toBeLessThanOrEqual(30);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.some((e) => e.source === 'Sylvanas')).toBe(true);
  });

  it('testDummy clampne mimo rozsah délku a neznámou roli spadne na dps', async () => {
    const { accountId, id } = await warriorWithMortalStrike('roth', 'Cairne');
    const result = await rotation.testDummy(accountId, id, 'not-a-role', 999);
    expect(result.durationSec).toBeLessThanOrEqual(180);
  });

  it('testDummy odmítne cizí postavu', async () => {
    const owner = await warriorWithMortalStrike('roti', 'Jaina');
    const tokens = await auth.register('rotj', 'password123');
    const otherAccount = auth.verifyAccessToken(tokens.accessToken).sub;
    await expect(rotation.testDummy(otherAccount, owner.id, 'dps', 30)).rejects.toThrow();
  });
});
