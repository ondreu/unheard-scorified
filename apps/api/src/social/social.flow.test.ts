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
import { InMemoryPresenceStore } from './presence.store';
import { SocialEventsRelay } from './social.events';
import { SocialRepository } from './social.repository';
import { SocialService } from './social.service';

/**
 * Integrační test M9 friends nad pglite (bez Redisu — relay bez WS serveru = no-op).
 */
describe('M9 flow: friends', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let social: SocialService;
  let presence: InMemoryPresenceStore;
  let seq = 0;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    const charRepo = new CharacterRepository(db);
    auth = new AuthService(db, new JwtService());
    characters = new CharacterService(charRepo);
    presence = new InMemoryPresenceStore();
    social = new SocialService(charRepo, new SocialRepository(db), new SocialEventsRelay(), presence);
  });

  beforeEach(() => {
    seq += 1;
  });

  /** Vytvoří účet + postavu, vrátí účet + postavu. */
  async function player(name: string): Promise<{ accountId: string; id: string; name: string }> {
    const tokens = await auth.register(`acc_${name}_${seq}`, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'orc', class: 'fighter' });
    return { accountId, id: char.id, name: char.name };
  }

  it('žádost → příchozí/odeslaná → accept → vzájemní přátelé', async () => {
    const a = await player('Aragorn');
    const b = await player('Boromir');

    const sent = await social.sendRequest(a.accountId, a.id, b.name);
    expect(sent.accepted).toBe(false);
    expect(sent.social.outgoing.map((r) => r.name)).toEqual(['Boromir']);
    expect(sent.social.friends).toHaveLength(0);

    // B vidí příchozí žádost.
    const bView = await social.getSocial(b.accountId, b.id);
    expect(bView.incoming).toHaveLength(1);
    expect(bView.incoming[0]!.name).toBe('Aragorn');
    const requestId = bView.incoming[0]!.requestId;

    // B potvrdí.
    const after = await social.respond(b.accountId, b.id, requestId, true);
    expect(after.friends.map((f) => f.name)).toEqual(['Aragorn']);
    expect(after.incoming).toHaveLength(0);

    // A teď vidí B jako přítele.
    const aView = await social.getSocial(a.accountId, a.id);
    expect(aView.friends.map((f) => f.name)).toEqual(['Boromir']);
    expect(aView.outgoing).toHaveLength(0);
  });

  it('vzájemná žádost se rovnou potvrdí', async () => {
    const a = await player('Gimli');
    const b = await player('Legolas');

    await social.sendRequest(a.accountId, a.id, b.name);
    // B pošle žádost zpět A → mutual auto-accept.
    const res = await social.sendRequest(b.accountId, b.id, a.name);
    expect(res.accepted).toBe(true);
    expect(res.social.friends.map((f) => f.name)).toEqual(['Gimli']);

    const aView = await social.getSocial(a.accountId, a.id);
    expect(aView.friends.map((f) => f.name)).toEqual(['Legolas']);
  });

  it('nelze přidat sám sebe', async () => {
    const a = await player('Frodo');
    await expect(social.sendRequest(a.accountId, a.id, a.name)).rejects.toThrow();
  });

  it('neexistující jméno → chyba', async () => {
    const a = await player('Samwise');
    await expect(social.sendRequest(a.accountId, a.id, 'Nobody')).rejects.toThrow();
  });

  it('duplicitní žádost stejným směrem → chyba', async () => {
    const a = await player('Pippin');
    const b = await player('Merry');
    await social.sendRequest(a.accountId, a.id, b.name);
    await expect(social.sendRequest(a.accountId, a.id, b.name)).rejects.toThrow();
  });

  it('odmítnutí žádosti ji smaže', async () => {
    const a = await player('Elrond');
    const b = await player('Arwen');
    await social.sendRequest(a.accountId, a.id, b.name);
    const bView = await social.getSocial(b.accountId, b.id);
    const requestId = bView.incoming[0]!.requestId;

    const after = await social.respond(b.accountId, b.id, requestId, false);
    expect(after.incoming).toHaveLength(0);
    expect(after.friends).toHaveLength(0);
    // A už nemá odeslanou žádost.
    expect((await social.getSocial(a.accountId, a.id)).outgoing).toHaveLength(0);
  });

  it('removeFriend zruší přátelství oběma stranám', async () => {
    const a = await player('Galadriel');
    const b = await player('Celeborn');
    await social.sendRequest(a.accountId, a.id, b.name);
    const bView = await social.getSocial(b.accountId, b.id);
    await social.respond(b.accountId, b.id, bView.incoming[0]!.requestId, true);

    const after = await social.removeFriend(a.accountId, a.id, b.id);
    expect(after.friends).toHaveLength(0);
    expect((await social.getSocial(b.accountId, b.id)).friends).toHaveLength(0);
  });

  it('online stav přátel se promítne do přehledu a online jdou první', async () => {
    const a = await player('Watcher');
    const b = await player('Onliner');
    const c = await player('Offliner');
    // A se spřátelí s B i C.
    await social.sendRequest(a.accountId, a.id, b.name);
    await social.respond(
      b.accountId,
      b.id,
      (await social.getSocial(b.accountId, b.id)).incoming[0]!.requestId,
      true,
    );
    await social.sendRequest(a.accountId, a.id, c.name);
    await social.respond(
      c.accountId,
      c.id,
      (await social.getSocial(c.accountId, c.id)).incoming[0]!.requestId,
      true,
    );

    // Bez presence: oba offline.
    let view = await social.getSocial(a.accountId, a.id);
    expect(view.friends.every((f) => !f.online)).toBe(true);

    // C přijde online → je první a má online=true.
    await presence.join(c.id);
    view = await social.getSocial(a.accountId, a.id);
    expect(view.friends[0]!.name).toBe('Offliner');
    expect(view.friends[0]!.online).toBe(true);
    expect(view.friends.find((f) => f.name === 'Onliner')!.online).toBe(false);

    // Refcount: dvě spojení, jeden leave → stále online.
    await presence.join(c.id);
    await presence.leave(c.id);
    expect(await presence.isOnline(c.id)).toBe(true);
    await presence.leave(c.id);
    expect(await presence.isOnline(c.id)).toBe(false);
  });

  it('cizí účet nemůže číst sociální přehled postavy', async () => {
    const a = await player('Theoden');
    const intruder = await player('Wormtongue');
    await expect(social.getSocial(intruder.accountId, a.id)).rejects.toThrow();
  });

  it('addressee nemůže odpovědět na cizí žádost', async () => {
    const a = await player('Eomer');
    const b = await player('Eowyn');
    const c = await player('Faramir');
    await social.sendRequest(a.accountId, a.id, b.name);
    const bView = await social.getSocial(b.accountId, b.id);
    const requestId = bView.incoming[0]!.requestId;
    // C zkusí odpovědět na žádost adresovanou B.
    await expect(social.respond(c.accountId, c.id, requestId, true)).rejects.toThrow();
  });
});
