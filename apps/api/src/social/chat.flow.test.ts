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
import { GuildRepository } from './guild.repository';
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
  let guilds: GuildRepository;
  let seq = 0;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    const charRepo = new CharacterRepository(db);
    auth = new AuthService(db, new JwtService());
    characters = new CharacterService(charRepo);
    guilds = new GuildRepository(db);
    chat = new ChatService(charRepo, new ChatRepository(db), guilds, new SocialEventsRelay());
  });

  beforeEach(() => {
    seq += 1;
  });

  async function player(name: string): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(`chat_${name}_${seq}`, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'orc', class: 'fighter' });
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

  it('guild kanál: člen píše/čte, scope je oddělený a global se nemíchá', async () => {
    const leaderA = await player('GuildLeadA');
    const memberA = await player('GuildMateA');
    const leaderB = await player('GuildLeadB');

    const guildA = await guilds.createGuild(`Aces_${seq}`, leaderA.id);
    await guilds.addMember(guildA.id, memberA.id, 'member');
    // leaderB má vlastní guildu (B) → jeho guild kanál je oddělený scope.
    await guilds.createGuild(`Bravos_${seq}`, leaderB.id);

    // Člen guildy A pošle do guild kanálu.
    const msg = await chat.send(leaderA.accountId, leaderA.id, 'For the guild!', 'guild');
    expect(msg.channel).toBe('guild');
    expect(msg.scopeId).toBe(guildA.id);

    // Druhý člen guildy A to vidí.
    const aHistory = await chat.history(memberA.accountId, memberA.id, 'guild');
    expect(aHistory.at(-1)?.body).toBe('For the guild!');

    // Guilda B guild chat A nevidí (scope isolation).
    const bHistory = await chat.history(leaderB.accountId, leaderB.id, 'guild');
    expect(bHistory.map((m) => m.body)).not.toContain('For the guild!');

    // Global kanál guild zprávu taky neobsahuje.
    const globalHistory = await chat.history(leaderA.accountId, leaderA.id, 'global');
    expect(globalHistory.map((m) => m.body)).not.toContain('For the guild!');
  });

  it('guild kanál: postava bez guildy je odmítnuta', async () => {
    const loner = await player('Loner');
    await expect(chat.send(loner.accountId, loner.id, 'hello?', 'guild')).rejects.toThrow();
    await expect(chat.history(loner.accountId, loner.id, 'guild')).rejects.toThrow();
  });
});
