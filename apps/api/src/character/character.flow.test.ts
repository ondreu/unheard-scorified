import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthService } from '../auth/auth.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { CharacterRepository } from './character.repository';
import { CharacterService } from './character.service';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import { BuffRepository } from '../buff/buff.repository';

/**
 * Integrační test nad in-memory Postgresem (pglite) — ověřuje celý M1 flow
 * bez nutnosti běžícího Docker/Postgres. Schéma se nahraje z vygenerovaných migrací.
 */
describe('M1 flow: účet + postava', () => {
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let invRepo: InventoryRepository;
  let inventory: InventoryService;

  beforeAll(async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    invRepo = new InventoryRepository(db);
    characters = new CharacterService(charRepo, invRepo);
    inventory = new InventoryService(charRepo, invRepo, new BuffRepository(db));
  });

  async function registerAndGetId(username: string): Promise<string> {
    const tokens = await auth.register(username, 'password123');
    return auth.verifyAccessToken(tokens.accessToken).sub;
  }

  it('registrace vrátí platné tokeny a login funguje', async () => {
    const tokens = await auth.register('alice', 'password123');
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();

    const login = await auth.login('alice', 'password123');
    expect(login.accessToken).toBeTruthy();
  });

  it('odmítne duplicitní username a špatné heslo', async () => {
    await auth.register('bob', 'password123');
    await expect(auth.register('bob', 'password123')).rejects.toThrow();
    await expect(auth.login('bob', 'wrongpass')).rejects.toThrow();
  });

  it('vytvoří postavu a spočítá sheet', async () => {
    const accountId = await registerAndGetId('carol');
    const char = await characters.create(accountId, {
      name: 'Thrall',
      race: 'half_orc',
      class: 'druid',
    });
    expect(char.sheet.level).toBe(1);
    expect(char.sheet.derived.resource.type).toBe('mana');

    const list = await characters.list(accountId);
    expect(list).toHaveLength(1);

    const fetched = await characters.getOwned(accountId, char.id);
    expect(fetched.name).toBe('Thrall');
  });

  it('MR-3: vytvoří postavu s backgroundem + standard array + backstory', async () => {
    const accountId = await registerAndGetId('mr3');
    const char = await characters.create(accountId, {
      name: 'Bjorn',
      race: 'half_orc',
      class: 'barbarian',
      background: 'soldier',
      abilityScores: {
        strength: 15, dexterity: 13, constitution: 14,
        intelligence: 8, wisdom: 12, charisma: 10,
      },
      backstory: 'Sworn to the warsong.',
    });
    expect(char.background).toBe('soldier');
    expect(char.backstory).toBe('Sworn to the warsong.');
    // STR 15 (array) + half-orc +2 = 17 → modifier +3.
    expect(char.sheet.primary.strength).toBe(17);
    expect(char.sheet.derived.modifiers.strength).toBe(3);
  });

  it('MR-3: odmítne nevalidní standard array', async () => {
    const accountId = await registerAndGetId('mr3bad');
    await expect(
      characters.create(accountId, {
        name: 'Cheater',
        race: 'human',
        class: 'fighter',
        abilityScores: {
          strength: 18, dexterity: 18, constitution: 18,
          intelligence: 18, wisdom: 18, charisma: 18,
        },
      }),
    ).rejects.toThrow();
  });

  it('odmítne neznámou rasu / třídu (D&D matice je jinak bez omezení)', async () => {
    const accountId = await registerAndGetId('dave');
    await expect(
      characters.create(accountId, { name: 'Nobody', race: 'human', class: 'necromancer' }),
    ).rejects.toThrow();
    // Libovolná validní rasa+třída je naopak povolená (např. Human Druid).
    const ok = await characters.create(accountId, { name: 'Goodruid', race: 'human', class: 'druid' });
    expect(ok.sheet.level).toBe(1);
  });

  it('postava patří jen svému účtu', async () => {
    const owner = await registerAndGetId('erin');
    const other = await registerAndGetId('frank');
    const char = await characters.create(owner, {
      name: 'Jaina',
      race: 'human',
      class: 'wizard',
    });
    await expect(characters.getOwned(other, char.id)).rejects.toThrow();
  });

  it('inspect vrací public combat info vč. equipnutého gearu a ilvl', async () => {
    const owner = await registerAndGetId('grace');
    const char = await characters.create(owner, {
      name: 'Garrosh',
      race: 'half_orc',
      class: 'fighter',
    });

    // Bez gearu: ilvl 0, prázdný equipment.
    const empty = await characters.inspect(char.id);
    expect(empty.name).toBe('Garrosh');
    expect(empty.itemLevel).toBe(0);
    expect(empty.equipment).toHaveLength(0);

    // Po equipnutí itemu se objeví v inspectu a ilvl odpovídá.
    await invRepo.addItem(char.id, 'iron_shortsword');
    await inventory.equip(owner, char.id, 'iron_shortsword', 'main_hand');
    const geared = await characters.inspect(char.id);
    expect(geared.equipment).toHaveLength(1);
    expect(geared.equipment[0]!.itemId).toBe('iron_shortsword');
    expect(geared.itemLevel).toBe(5);
  });

  it('smaže vlastní postavu; cizí účet ji smazat nemůže', async () => {
    const owner = await registerAndGetId('henry');
    const other = await registerAndGetId('iris');
    const char = await characters.create(owner, { name: 'Henrylock', race: 'human', class: 'warlock' });

    await expect(characters.deleteOwned(other, char.id)).rejects.toThrow();

    const result = await characters.deleteOwned(owner, char.id);
    expect(result.deleted).toBe(true);
    await expect(characters.getOwned(owner, char.id)).rejects.toThrow();
  });
});
