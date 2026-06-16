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
    rotation = new RotationService(charRepo, talentRepo, new RotationRepository(db));
  });

  /** Postava s capstone talentem odemykajícím signature ability (Mortal Strike). */
  async function warriorWithMortalStrike(
    username: string,
    name: string,
  ): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'human', class: 'warrior' });
    // Vysoký level → dost bodů; alokuj Arms strom až po Mortal Strike (tier 14).
    await charRepo.addRewards(char.id, 60_000_000, 0);
    await talents.allocate(accountId, char.id, 'warrior.arms.weapon_expertise'); // 5
    for (let i = 0; i < 4; i++)
      await talents.allocate(accountId, char.id, 'warrior.arms.weapon_expertise');
    await talents.allocate(accountId, char.id, 'warrior.arms.tactical_mastery'); // 5 more → 10
    for (let i = 0; i < 4; i++)
      await talents.allocate(accountId, char.id, 'warrior.arms.tactical_mastery');
    await talents.allocate(accountId, char.id, 'warrior.arms.improved_rend'); // tier 5 ok
    for (let i = 0; i < 2; i++)
      await talents.allocate(accountId, char.id, 'warrior.arms.improved_rend'); // 13
    await talents.allocate(accountId, char.id, 'warrior.arms.deep_wounds'); // tier 10 → 14
    await talents.allocate(accountId, char.id, 'warrior.arms.mortal_strike'); // tier 14 capstone
    return { accountId, id: char.id };
  }

  it('default rotace obsahuje odemčené ability se always podmínkou', async () => {
    const { accountId, id } = await warriorWithMortalStrike('rota', 'Varian');
    const view = await rotation.getRotation(accountId, id);
    expect(view.abilities.map((a) => a.id)).toContain('mortal_strike');
    const rule = view.rules.find((r) => r.abilityId === 'mortal_strike');
    expect(rule).toMatchObject({ enabled: true, conditionType: 'always' });
  });

  it('postava bez capstone nemá žádné ability', async () => {
    const tokens = await auth.register('rotb', 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name: 'Anduin', race: 'human', class: 'warrior' });
    const view = await rotation.getRotation(accountId, char.id);
    expect(view.abilities).toHaveLength(0);
    expect(view.rules).toHaveLength(0);
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
    expect(await rotation.rotationForCombat(id, 'warrior')).toBeUndefined();
    await rotation.setRotation(accountId, id, {
      rules: [{ abilityId: 'mortal_strike', enabled: false, conditionType: 'always' }],
    });
    const forCombat = await rotation.rotationForCombat(id, 'warrior');
    expect(forCombat?.rules.find((r) => r.abilityId === 'mortal_strike')?.enabled).toBe(false);
  });

  it('cizí účet nemůže číst/ukládat rotaci', async () => {
    const owner = await warriorWithMortalStrike('rote', 'Grom');
    const tokens = await auth.register('rotf', 'password123');
    const otherAccount = auth.verifyAccessToken(tokens.accessToken).sub;
    await expect(rotation.getRotation(otherAccount, owner.id)).rejects.toThrow();
    await expect(rotation.setRotation(otherAccount, owner.id, { rules: [] })).rejects.toThrow();
  });
});
