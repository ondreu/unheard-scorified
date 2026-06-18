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
import { LevelUpRepository } from '../levelup/levelup.repository';
import { LevelUpService } from '../levelup/levelup.service';
import { RotationRepository } from './rotation.repository';
import { RotationService } from './rotation.service';

/**
 * Integrační testy deklarativní rotace nad pglite. D&D Remaster (MR-2): abilit
 * kit pochází z class + subclass + levelu (žádné talenty). Ověřuje: dostupné
 * ability dle class/subclass/levelu, default rotace, uložení + očištění, vlastnictví.
 */
describe('flow: deklarativní rotace (D&D)', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let levelup: LevelUpService;
  let rotation: RotationService;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    const levelupRepo = new LevelUpRepository(db);
    levelup = new LevelUpService(charRepo, levelupRepo);
    const inventory = new InventoryService(charRepo, new InventoryRepository(db), new BuffRepository(db));
    rotation = new RotationService(charRepo, levelupRepo, new RotationRepository(db), inventory);
  });

  /** Fighter na cap levelu, který si zvolil subclass Champion (odemkne signature). */
  async function championFighter(
    username: string,
    name: string,
  ): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'human', class: 'fighter' });
    await charRepo.addRewards(char.id, 60_000_000, 0); // cap level (subclass + ASI sloty)
    await levelup.choose(accountId, char.id, 'subclass', { kind: 'subclass', subclassId: 'champion' });
    return { accountId, id: char.id };
  }

  it('default rotace obsahuje subclass signature ability se always podmínkou', async () => {
    const { accountId, id } = await championFighter('rota', 'Varian');
    const view = await rotation.getRotation(accountId, id);
    expect(view.abilities.map((a) => a.id)).toContain('champion_heroic_surge');
    const rule = view.rules.find((r) => r.abilityId === 'champion_heroic_surge');
    expect(rule).toMatchObject({ enabled: true, conditionType: 'always' });
  });

  it('postava na lvl 1 má class kit, ale ne high-level ani subclass ability', async () => {
    const tokens = await auth.register('rotb', 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name: 'Anduin', race: 'human', class: 'fighter' });
    const view = await rotation.getRotation(accountId, char.id);
    const ids = view.abilities.map((a) => a.id);
    expect(ids).toContain('fighter_weapon_strike'); // baseline lvl 1
    expect(ids).not.toContain('fighter_execute'); // baseline lvl 20
    expect(ids).not.toContain('champion_heroic_surge'); // subclass nezvolena
  });

  it('uložení rotace přežije a očistí neznámé ability + clampne práh', async () => {
    const { accountId, id } = await championFighter('rotc', 'Bolvar');
    const saved = await rotation.setRotation(accountId, id, {
      rules: [
        { abilityId: 'champion_heroic_surge', enabled: true, conditionType: 'enemy_hp_below', threshold: 9 },
        { abilityId: 'ghost_ability', enabled: true, conditionType: 'always' },
      ],
    });
    const ms = saved.rules.find((r) => r.abilityId === 'champion_heroic_surge')!;
    expect(ms.threshold).toBe(1); // 9 → clamp 1
    expect(saved.rules.some((r) => r.abilityId === 'ghost_ability')).toBe(false);

    const reloaded = await rotation.getRotation(accountId, id);
    expect(reloaded.rules.find((r) => r.abilityId === 'champion_heroic_surge')).toMatchObject({
      conditionType: 'enemy_hp_below',
      threshold: 1,
    });
  });

  it('rotationForCombat vrací undefined bez uložené rotace, jinak očištěnou', async () => {
    const { accountId, id } = await championFighter('rotd', 'Tirion');
    expect(await rotation.rotationForCombat(id, 'fighter', 'champion', 60)).toBeUndefined();
    await rotation.setRotation(accountId, id, {
      rules: [{ abilityId: 'champion_heroic_surge', enabled: false, conditionType: 'always' }],
    });
    const forCombat = await rotation.rotationForCombat(id, 'fighter', 'champion', 60);
    expect(forCombat?.rules.find((r) => r.abilityId === 'champion_heroic_surge')?.enabled).toBe(false);
  });

  it('cizí účet nemůže číst/ukládat rotaci', async () => {
    const owner = await championFighter('rote', 'Grom');
    const tokens = await auth.register('rotf', 'password123');
    const otherAccount = auth.verifyAccessToken(tokens.accessToken).sub;
    await expect(rotation.getRotation(otherAccount, owner.id)).rejects.toThrow();
    await expect(rotation.setRotation(otherAccount, owner.id, { rules: [] })).rejects.toThrow();
  });

  it('testDummy odbojuje sandbox proti trénovacímu terči a vrátí timeline', async () => {
    const { accountId, id } = await championFighter('rotg', 'Sylvanas');
    const result = await rotation.testDummy(accountId, id, 'dps', 30);
    expect(result.durationSec).toBeLessThanOrEqual(30);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.some((e) => e.source === 'Sylvanas')).toBe(true);
  });

  it('testDummy clampne mimo rozsah délku a neznámou roli spadne na dps', async () => {
    const { accountId, id } = await championFighter('roth', 'Cairne');
    const result = await rotation.testDummy(accountId, id, 'not-a-role', 999);
    expect(result.durationSec).toBeLessThanOrEqual(180);
  });

  it('testDummy odmítne cizí postavu', async () => {
    const owner = await championFighter('roti', 'Jaina');
    const tokens = await auth.register('rotj', 'password123');
    const otherAccount = auth.verifyAccessToken(tokens.accessToken).sub;
    await expect(rotation.testDummy(otherAccount, owner.id, 'dps', 30)).rejects.toThrow();
  });
});
