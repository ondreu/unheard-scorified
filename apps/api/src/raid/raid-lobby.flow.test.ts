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
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import { LockoutRepository } from '../lockout/lockout.repository';
import { TalentRepository } from '../talent/talent.repository';
import { CompletedQuestRepository } from '../quest/quest.repository';
import { PushRepository } from '../push/push.repository';
import { PushService } from '../push/push.service';
import { RaidRepository } from './raid.repository';
import { RaidEventsRelay } from './raid.events';
import { RaidService } from './raid.service';
import { RaidLobbyRepository } from './raid-lobby.repository';
import { RaidLobbyService } from './raid-lobby.service';
import { InMemoryRaidQueue } from './raid.matchmaking';

/**
 * Integrační test M8.5-B raid lobby (ruční formace) nad pglite. Relay bez WS = no-op.
 */
describe('M8.5-B flow: raid lobby', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let completed: CompletedQuestRepository;
  let raid: RaidService;
  let lobby: RaidLobbyService;
  let seq = 0;

  const ATTUNE = 'dw_morbent_fel'; // molten_core attunement quest

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    completed = new CompletedQuestRepository(db);

    const invRepo = new InventoryRepository(db);
    const invService = new InventoryService(charRepo, invRepo);
    raid = new RaidService(
      charRepo,
      invService,
      invRepo,
      new TalentRepository(db),
      completed,
      new PushService(new PushRepository(db)),
      new RaidRepository(db),
      new RaidEventsRelay(),
      new LockoutRepository(db),
      new InMemoryRaidQueue(),
    );
    lobby = new RaidLobbyService(
      charRepo,
      completed,
      new RaidLobbyRepository(db),
      raid,
      new RaidEventsRelay(),
    );
  });

  beforeEach(() => {
    seq += 1;
  });

  /** Cap-level postava, attuned na molten_core. */
  async function raider(
    name: string,
    opts: { attune?: boolean } = { attune: true },
  ): Promise<{ accountId: string; id: string; name: string }> {
    const tokens = await auth.register(`lob_${name}_${seq}`, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'orc', class: 'warrior' });
    await charRepo.addRewards(char.id, 50_000_000, 0);
    if (opts.attune !== false) await completed.markCompleted(char.id, ATTUNE);
    return { accountId, id: char.id, name: char.name };
  }

  it('založení lobby → leader je připojený, zbývají sloty', async () => {
    const a = await raider('Warchief');
    const state = await lobby.create(a.accountId, a.id, 'molten_core', 'tank', 5);
    expect(state.lobby?.raidId).toBe('molten_core');
    expect(state.lobby?.iAmLeader).toBe(true);
    expect(state.lobby?.members).toHaveLength(1);
    expect(state.lobby?.members[0]!.role).toBe('tank');
    // tank obsazen leaderem.
    expect(state.lobby?.remaining).toEqual({ tank: 0, healer: 1, dps: 3 });
  });

  it('pozvánka → přijetí → člen připojen', async () => {
    const a = await raider('Leadera');
    const b = await raider('Healera');
    await lobby.create(a.accountId, a.id, 'molten_core', 'tank', 5);
    const lid = (await lobby.getState(a.accountId, a.id)).lobby!.id;

    await lobby.invite(a.accountId, a.id, lid, b.name, 'healer');
    const bState = await lobby.getState(b.accountId, b.id);
    expect(bState.invites).toHaveLength(1);
    expect(bState.invites[0]!.role).toBe('healer');

    await lobby.respondInvite(b.accountId, b.id, lid, true);
    const after = await lobby.getState(a.accountId, a.id);
    expect(after.lobby?.members).toHaveLength(2);
    expect(after.lobby?.remaining).toEqual({ tank: 0, healer: 0, dps: 3 });
  });

  it('jen leader smí zvát', async () => {
    const a = await raider('Bossa');
    const b = await raider('Membera');
    const c = await raider('Targeta');
    await lobby.create(a.accountId, a.id, 'molten_core', 'tank', 5);
    const lid = (await lobby.getState(a.accountId, a.id)).lobby!.id;
    await lobby.invite(a.accountId, a.id, lid, b.name, 'dps');
    await lobby.respondInvite(b.accountId, b.id, lid, true);
    // b (member) zkusí zvát c → forbidden.
    await expect(lobby.invite(b.accountId, b.id, lid, c.name, 'dps')).rejects.toThrow();
  });

  it('pozvánka neattuneované postavy selže', async () => {
    const a = await raider('Attuned');
    const b = await raider('Noob', { attune: false });
    await lobby.create(a.accountId, a.id, 'molten_core', 'tank', 5);
    const lid = (await lobby.getState(a.accountId, a.id)).lobby!.id;
    await expect(lobby.invite(a.accountId, a.id, lid, b.name, 'dps')).rejects.toThrow();
  });

  it('spuštění sestaví party jen z připojených členů (žádný NPC backfill) a vyřeší run', async () => {
    const a = await raider('Starter');
    const b = await raider('Joiner');
    await lobby.create(a.accountId, a.id, 'molten_core', 'tank', 5);
    const lid = (await lobby.getState(a.accountId, a.id)).lobby!.id;
    await lobby.invite(a.accountId, a.id, lid, b.name, 'healer');
    await lobby.respondInvite(b.accountId, b.id, lid, true);

    const { runId } = await lobby.start(a.accountId, a.id, lid);
    expect(runId).toBeTruthy();

    // Backfill odebrán: party = jen 2 připojení hráči, zbylé sloty prázdné.
    const run = await raid.getRun(a.accountId, a.id, runId);
    expect(run.party).toHaveLength(2);
    expect(run.myRole).toBe('tank');
    // Připojený hráč je účastníkem.
    const bRun = await raid.getRun(b.accountId, b.id, runId);
    expect(bRun.myRole).toBe('healer');

    // Lobby přešlo do started → není to už aktivní lobby.
    expect((await lobby.getState(a.accountId, a.id)).lobby).toBeNull();
  });

  it('odchod leadera lobby zruší', async () => {
    const a = await raider('Quitter');
    await lobby.create(a.accountId, a.id, 'molten_core', 'tank', 5);
    const lid = (await lobby.getState(a.accountId, a.id)).lobby!.id;
    await lobby.leave(a.accountId, a.id, lid);
    expect((await lobby.getState(a.accountId, a.id)).lobby).toBeNull();
  });

  it('odmítnutí pozvánky ji odstraní', async () => {
    const a = await raider('Invitera');
    const b = await raider('Declinera');
    await lobby.create(a.accountId, a.id, 'molten_core', 'tank', 5);
    const lid = (await lobby.getState(a.accountId, a.id)).lobby!.id;
    await lobby.invite(a.accountId, a.id, lid, b.name, 'dps');
    await lobby.respondInvite(b.accountId, b.id, lid, false);
    expect((await lobby.getState(b.accountId, b.id)).invites).toHaveLength(0);
  });

  it('start smí jen leader; cizí účet nečte stav', async () => {
    const a = await raider('Owner');
    const b = await raider('Other');
    await lobby.create(a.accountId, a.id, 'molten_core', 'tank', 5);
    const lid = (await lobby.getState(a.accountId, a.id)).lobby!.id;
    await lobby.invite(a.accountId, a.id, lid, b.name, 'dps');
    await lobby.respondInvite(b.accountId, b.id, lid, true);

    await expect(lobby.start(b.accountId, b.id, lid)).rejects.toThrow();
    const intruder = await raider('Snooper');
    await expect(lobby.getState(intruder.accountId, a.id)).rejects.toThrow();
  });
});
