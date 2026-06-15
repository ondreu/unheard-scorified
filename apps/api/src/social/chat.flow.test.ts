import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { CHAT_HISTORY_LIMIT } from '@game/shared';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { ChatRepository } from './chat.repository';
import { ChatService } from './chat.service';
import { SocialEventsRelay } from './social.events';

/**
 * Integrační test M9 chatu nad pglite (relay bez WS serveru = no-op; ověřujeme
 * persistenci + validaci + ownership, ne realtime fan-out).
 */
describe('M9 flow: chat', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let chat: ChatService;
  let seq = 0;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    const charRepo = new CharacterRepository(db);
    auth = new AuthService(db, new JwtService());
    characters = new CharacterService(charRepo);
    chat = new ChatService(charRepo, new ChatRepository(db), new SocialEventsRelay());
  });

  beforeEach(() => {
    seq += 1;
  });

  async function player(name: string): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(`chat_${name}_${seq}`, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'orc', class: 'warrior' });
    return { accountId, id: char.id };
  }

  it('odeslaná zpráva se objeví v historii s autorem', async () => {
    const a = await player('Speaker');
    const sent = await chat.send(a.accountId, a.id, 'Hello Azeroth');
    expect(sent.body).toBe('Hello Azeroth');
    expect(sent.name).toBe('Speaker');
    expect(sent.characterId).toBe(a.id);

    const history = await chat.history(a.accountId, a.id);
    expect(history.at(-1)?.body).toBe('Hello Azeroth');
  });

  it('normalizuje bílé znaky a odmítne prázdnou zprávu', async () => {
    const a = await player('Norman');
    const sent = await chat.send(a.accountId, a.id, '  spaced   out \n text  ');
    expect(sent.body).toBe('spaced out text');
    await expect(chat.send(a.accountId, a.id, '   ')).rejects.toThrow();
  });

  it('historie je chronologická a omezená na limit', async () => {
    const a = await player('Floody');
    for (let i = 0; i < CHAT_HISTORY_LIMIT + 5; i++) {
      await chat.send(a.accountId, a.id, `msg ${i}`);
    }
    const history = await chat.history(a.accountId, a.id);
    expect(history.length).toBe(CHAT_HISTORY_LIMIT);
    const bodies = history.map((m) => m.body);
    // Drží se nejnovější zprávy, nejstarší vypadnou.
    expect(bodies).toContain(`msg ${CHAT_HISTORY_LIMIT + 4}`);
    expect(bodies).not.toContain('msg 0');
    // Chronologické pořadí (nejstarší → nejnovější): časy nerostou zpět.
    expect(new Date(history.at(-1)!.at).getTime()).toBeGreaterThanOrEqual(
      new Date(history[0]!.at).getTime(),
    );
  });

  it('cizí účet nemůže psát ani číst za cizí postavu', async () => {
    const a = await player('Ownerus');
    const intruder = await player('Snoopus');
    await expect(chat.send(intruder.accountId, a.id, 'spoof')).rejects.toThrow();
    await expect(chat.history(intruder.accountId, a.id)).rejects.toThrow();
  });
});
