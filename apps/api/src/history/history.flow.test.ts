import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { HistoryRepository } from './history.repository';
import { HistoryService } from './history.service';

/**
 * Integrační test historie aktivit nad pglite: append-only zápis, řazení
 * (nejnovější první), ownership (cizí účet nečte cizí historii).
 */
describe('flow: activity history', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let repo: HistoryRepository;
  let service: HistoryService;
  let seq = 0;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    const charRepo = new CharacterRepository(db);
    auth = new AuthService(db, new JwtService());
    characters = new CharacterService(charRepo);
    repo = new HistoryRepository(db);
    service = new HistoryService(repo, charRepo);
  });

  beforeEach(() => {
    seq += 1;
  });

  async function player(name: string): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(`hist_${name}_${seq}`, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'orc', class: 'warrior' });
    return { accountId, id: char.id };
  }

  it('zapsané výsledky se vrací nejnovější první a respektují vlastnictví', async () => {
    const a = await player('Chronicle');
    await repo.record({ characterId: a.id, kind: 'quest', title: 'Quest one', detail: '+10 XP' });
    await repo.record({
      characterId: a.id,
      kind: 'dungeon',
      title: 'Deadmines cleared',
      detail: '+200 XP, +30g',
      outcome: 'victory',
    });

    const list = await service.list(a.accountId, a.id);
    expect(list).toHaveLength(2);
    expect(list[0]!.title).toBe('Deadmines cleared'); // nejnovější první
    expect(list[0]!.outcome).toBe('victory');
    expect(list[1]!.title).toBe('Quest one');

    // Cizí účet nesmí číst cizí historii.
    const b = await player('Stranger');
    await expect(service.list(b.accountId, a.id)).rejects.toThrow();
  });
});
