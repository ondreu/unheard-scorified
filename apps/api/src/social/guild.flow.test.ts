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
import { GuildRepository } from './guild.repository';
import { GuildService } from './guild.service';
import { SocialEventsRelay } from './social.events';

/**
 * Integrační test M9 guildy nad pglite (relay bez WS serveru = no-op).
 */
describe('M9 flow: guild', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let guild: GuildService;
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
    guild = new GuildService(charRepo, guilds, new SocialEventsRelay());
  });

  beforeEach(() => {
    seq += 1;
  });

  async function player(name: string): Promise<{ accountId: string; id: string; name: string }> {
    const tokens = await auth.register(`g_${name}_${seq}`, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'orc', class: 'warrior' });
    return { accountId, id: char.id, name: char.name };
  }

  /** Pozve a rovnou přijme `invitee` do guildy vůdce `leader`. */
  async function joinViaInvite(
    leader: { accountId: string; id: string },
    invitee: { accountId: string; id: string; name: string },
  ): Promise<void> {
    await guild.invite(leader.accountId, leader.id, invitee.name);
    const state = await guild.getState(invitee.accountId, invitee.id);
    await guild.respondInvite(invitee.accountId, invitee.id, state.invites[0]!.inviteId, true);
  }

  it('založení guildy → vůdce je v rosteru jako leader', async () => {
    const a = await player('Thrall');
    const state = await guild.create(a.accountId, a.id, 'Warsong Clan');
    expect(state.guild?.name).toBe('Warsong Clan');
    expect(state.guild?.myRank).toBe('leader');
    expect(state.guild?.members).toHaveLength(1);
    expect(state.guild?.members[0]!.rank).toBe('leader');
  });

  it('neplatné jméno a duplicita jsou odmítnuty', async () => {
    const a = await player('Grommash');
    await expect(guild.create(a.accountId, a.id, 'ab')).rejects.toThrow();
    await guild.create(a.accountId, a.id, 'Burning Blade');
    // Stejná postava už je v guildě.
    await expect(guild.create(a.accountId, a.id, 'Another Name')).rejects.toThrow();
    // Jiná postava nemůže vzít obsazené jméno.
    const b = await player('Drekthar');
    await expect(guild.create(b.accountId, b.id, 'Burning Blade')).rejects.toThrow();
  });

  it('pozvánka → přijetí → člen v rosteru', async () => {
    const a = await player('Vol');
    const b = await player('Cairne');
    await guild.create(a.accountId, a.id, 'Frostwolf Clan');
    await joinViaInvite(a, b);

    const state = await guild.getState(b.accountId, b.id);
    expect(state.guild?.name).toBe('Frostwolf Clan');
    expect(state.guild?.myRank).toBe('member');
    expect(state.guild?.memberCount).toBe(2);
  });

  it('member nemůže zvát (officer+)', async () => {
    const a = await player('Sylvanas');
    const b = await player('Nathanos');
    const c = await player('Varimathras');
    await guild.create(a.accountId, a.id, 'Forsaken');
    await joinViaInvite(a, b);
    // b je member → nesmí zvát c.
    await expect(guild.invite(b.accountId, b.id, c.name)).rejects.toThrow();
  });

  it('vůdce povýší člena na officera, ten pak smí zvát', async () => {
    const a = await player('Genn');
    const b = await player('Tess');
    const c = await player('Lorna');
    await guild.create(a.accountId, a.id, 'Gilneas Brigade');
    await joinViaInvite(a, b);
    await guild.setRank(a.accountId, a.id, b.id, 'officer');
    // b je officer → smí zvát.
    const state = await guild.invite(b.accountId, b.id, c.name);
    expect(state.guild?.myRank).toBe('officer');
  });

  it('officer nemůže vyhodit jiného officera, vůdce ano', async () => {
    const a = await player('Anduin');
    const b = await player('Bolvar');
    const c = await player('Turalyon');
    await guild.create(a.accountId, a.id, 'Alliance Vanguard');
    await joinViaInvite(a, b);
    await joinViaInvite(a, c);
    await guild.setRank(a.accountId, a.id, b.id, 'officer');
    await guild.setRank(a.accountId, a.id, c.id, 'officer');

    await expect(guild.kick(b.accountId, b.id, c.id)).rejects.toThrow();
    const state = await guild.kick(a.accountId, a.id, c.id);
    expect(state.guild?.memberCount).toBe(2);
  });

  it('odchod vůdce předá vedení nejstaršímu zbývajícímu', async () => {
    const a = await player('Uther');
    const b = await player('Tirion');
    await guild.create(a.accountId, a.id, 'Silver Hand');
    await joinViaInvite(a, b);

    await guild.leave(a.accountId, a.id);
    const state = await guild.getState(b.accountId, b.id);
    expect(state.guild?.myRank).toBe('leader');
    expect(state.guild?.leaderCharacterId).toBe(b.id);
    expect(state.guild?.memberCount).toBe(1);
    // A už není v guildě.
    expect((await guild.getState(a.accountId, a.id)).guild).toBeNull();
  });

  it('odchod posledního člena rozpustí guildu', async () => {
    const a = await player('Khadgar');
    const created = await guild.create(a.accountId, a.id, 'Kirin Tor');
    const guildId = created.guild!.id;
    await guild.leave(a.accountId, a.id);
    expect((await guild.getState(a.accountId, a.id)).guild).toBeNull();
    expect(await guilds.findById(guildId)).toBeUndefined();
  });

  it('cizí účet nemůže číst guild stav postavy', async () => {
    const a = await player('Medivh');
    const intruder = await player('Garona');
    await expect(guild.getState(intruder.accountId, a.id)).rejects.toThrow();
  });
});
