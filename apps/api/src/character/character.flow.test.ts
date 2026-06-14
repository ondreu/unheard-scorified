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

/**
 * Integrační test nad in-memory Postgresem (pglite) — ověřuje celý M1 flow
 * bez nutnosti běžícího Docker/Postgres. Schéma se nahraje z vygenerovaných migrací.
 */
describe('M1 flow: účet + postava', () => {
  let auth: AuthService;
  let characters: CharacterService;

  beforeAll(async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    characters = new CharacterService(new CharacterRepository(db));
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
      race: 'orc',
      class: 'shaman',
    });
    expect(char.faction).toBe('horde');
    expect(char.sheet.level).toBe(1);
    expect(char.sheet.derived.resource.type).toBe('mana');

    const list = await characters.list(accountId);
    expect(list).toHaveLength(1);

    const fetched = await characters.getOwned(accountId, char.id);
    expect(fetched.name).toBe('Thrall');
  });

  it('odmítne nevalidní race-class kombinaci', async () => {
    const accountId = await registerAndGetId('dave');
    await expect(
      characters.create(accountId, { name: 'Baddruid', race: 'human', class: 'druid' }),
    ).rejects.toThrow();
  });

  it('postava patří jen svému účtu', async () => {
    const owner = await registerAndGetId('erin');
    const other = await registerAndGetId('frank');
    const char = await characters.create(owner, {
      name: 'Jaina',
      race: 'human',
      class: 'mage',
    });
    await expect(characters.getOwned(other, char.id)).rejects.toThrow();
  });
});
