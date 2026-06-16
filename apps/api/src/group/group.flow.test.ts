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
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import { makeGrant } from '../inventory/test-grant';
import { BuffRepository } from '../buff/buff.repository';
import { TalentRepository } from '../talent/talent.repository';
import { RotationService } from '../rotation/rotation.service';
import { RotationRepository } from '../rotation/rotation.repository';
import { HistoryRepository } from '../history/history.repository';
import { PushRepository } from '../push/push.repository';
import { PushService } from '../push/push.service';
import { CompletedQuestRepository } from '../quest/quest.repository';
import { LockoutRepository } from '../lockout/lockout.repository';
import { SocialRepository } from '../social/social.repository';
import { GuildRepository } from '../social/guild.repository';
import { RaidRepository } from '../raid/raid.repository';
import { RaidEventsRelay } from '../raid/raid.events';
import { InMemoryRaidQueue } from '../raid/raid.matchmaking';
import { RaidService } from '../raid/raid.service';
import { DungeonService } from '../dungeon/dungeon.service';
import { ArenaRepository } from '../arena/arena.repository';
import { ArenaEventsRelay } from '../arena/arena.events';
import { InMemoryMatchmakingQueue } from '../arena/arena.matchmaking';
import { InMemoryArenaLeaderboard } from '../arena/arena.leaderboard';
import { ArenaService } from '../arena/arena.service';
import { TeamArenaService } from '../arena/team-arena.service';
import { InMemoryTeamArenaQueue } from '../arena/team-arena.queue';
import { GroupRepository } from './group.repository';
import { GroupService } from './group.service';

/**
 * Integrační test M9 trvalých skupin (ADR 0022) nad pglite (in-memory fronty).
 * Pokrývá formaci (create/invite/accept/kick/leave) + launch dungeon/raid/aréna.
 */
describe('M9 flow: groups (party)', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let social: SocialRepository;
  let completed: CompletedQuestRepository;
  let group: GroupService;
  let seq = 0;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    social = new SocialRepository(db);
    completed = new CompletedQuestRepository(db);

    const invRepo = new InventoryRepository(db);
    const invService = new InventoryService(charRepo, invRepo, new BuffRepository(db));
    const talents = new TalentRepository(db);
    const push = new PushService(new PushRepository(db));
    const raidRepo = new RaidRepository(db);
    const lockouts = new LockoutRepository(db);
    const queue = new InMemoryRaidQueue();
    const arenaRepo = new ArenaRepository(db);
    const rotation = new RotationService(charRepo, talents, new RotationRepository(db), invService);

    const history = new HistoryRepository(db);
    const raids = new RaidService(
      charRepo, invService, invRepo, makeGrant(db, invRepo), talents, completed, push, raidRepo,
      new RaidEventsRelay(), lockouts, rotation, history, queue,
    );
    const dungeons = new DungeonService(
      charRepo, invService, invRepo, makeGrant(db, invRepo), talents, push, raidRepo, lockouts, rotation, completed, history, queue,
    );
    const arena = new ArenaService(
      charRepo, invService, talents, arenaRepo, push,
      new ArenaEventsRelay(), rotation, history, new InMemoryMatchmakingQueue(), new InMemoryArenaLeaderboard(),
    );
    const teamArena = new TeamArenaService(
      charRepo, invService, talents, arenaRepo, push, rotation, new InMemoryTeamArenaQueue(),
    );
    group = new GroupService(
      charRepo, new GroupRepository(db), social, new GuildRepository(db),
      dungeons, raids, arena, teamArena,
    );
  });

  async function player(name: string): Promise<{ accountId: string; id: string; name: string }> {
    seq += 1;
    const tokens = await auth.register(`grp_${name}_${seq}`, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'orc', class: 'warrior' });
    await charRepo.addRewards(char.id, 60_000_000, 0); // vysoký level (raid/aréna gates)
    return { accountId, id: char.id, name: char.name };
  }

  /** Leader + `size-1` přátel (vzájemně accepted). Vrátí všechny. */
  const SUFFIX = ['Ana', 'Bok', 'Cyr', 'Dim', 'Eli'];
  async function friends(prefix: string, size: number): Promise<{ accountId: string; id: string; name: string }[]> {
    const members = [];
    for (let i = 0; i < size; i++) members.push(await player(`${prefix}${SUFFIX[i]}`));
    for (let i = 1; i < size; i++) await social.create(members[0]!.id, members[i]!.id, 'accepted');
    return members;
  }

  it('create → invite (friend) → accept sestaví skupinu o 2', async () => {
    const [a, b] = await friends('Form', 2);
    await group.create(a!.accountId, a!.id, 'tank');
    let st = await group.getState(a!.accountId, a!.id);
    expect(st.group?.joinedCount).toBe(1);
    expect(st.group?.iAmLeader).toBe(true);

    await group.invite(a!.accountId, a!.id, b!.name, 'healer');
    const bInv = await group.getState(b!.accountId, b!.id);
    expect(bInv.invites).toHaveLength(1);

    await group.respondInvite(b!.accountId, b!.id, bInv.invites[0]!.groupId, true);
    st = await group.getState(a!.accountId, a!.id);
    expect(st.group?.joinedCount).toBe(2);
  });

  it('pozvat nepřítele (ne friend/guild) selže', async () => {
    const a = await player('SoloLead');
    const stranger = await player('Stranger');
    await group.create(a.accountId, a.id, 'dps');
    await expect(group.invite(a.accountId, a.id, stranger.name, 'dps')).rejects.toThrow();
  });

  it('jen leader smí zvát; člen ne', async () => {
    const [a, b] = await friends('Lead', 2);
    await group.create(a!.accountId, a!.id, 'tank');
    await group.invite(a!.accountId, a!.id, b!.name, 'dps');
    const inv = await group.getState(b!.accountId, b!.id);
    await group.respondInvite(b!.accountId, b!.id, inv.invites[0]!.groupId, true);
    // b (člen) zkusí pozvat — nemá koho, ale stejně musí selhat na „not leader".
    const c = await player('Outsider');
    await social.create(b!.id, c.id, 'accepted');
    await expect(group.invite(b!.accountId, b!.id, c.name, 'dps')).rejects.toThrow();
  });

  it('launch dungeon → group PVE run (runId)', async () => {
    const [a, b] = await friends('Dun', 2);
    await completed.markCompleted(a!.id, 'ho_ragefire_attunement'); // M9 ragefire attunement
    await group.create(a!.accountId, a!.id, 'tank');
    await group.invite(a!.accountId, a!.id, b!.name, 'healer');
    const inv = await group.getState(b!.accountId, b!.id);
    await group.respondInvite(b!.accountId, b!.id, inv.invites[0]!.groupId, true);

    const res = await group.launch(a!.accountId, a!.id, 'dungeon', 'ragefire_chasm');
    expect(res.activityType).toBe('dungeon');
    expect('runId' in res && res.runId).toBeTruthy();
  });

  it('launch raid (attuned) → run', async () => {
    const a = await player('RaidLead');
    await completed.markCompleted(a.id, 'tn_galak_ogres'); // molten_core attunement
    await group.create(a.accountId, a.id, 'dps');
    const res = await group.launch(a.accountId, a.id, 'raid', 'molten_core');
    expect(res.activityType).toBe('raid');
    expect('runId' in res && res.runId).toBeTruthy();
  });

  it('launch arena: group 1 → 1v1, group 3 → 3v3 (queued)', async () => {
    const solo = await player('Duelist');
    await group.create(solo.accountId, solo.id, 'dps');
    const r1 = await group.launch(solo.accountId, solo.id, 'arena', '');
    expect(r1.activityType).toBe('arena');
    if (r1.activityType === 'arena') expect(r1.bracket).toBe('1v1');

    const t = await friends('Team', 3);
    await group.create(t[0]!.accountId, t[0]!.id, 'dps');
    for (let i = 1; i < 3; i++) {
      await group.invite(t[0]!.accountId, t[0]!.id, t[i]!.name, 'dps');
      const inv = await group.getState(t[i]!.accountId, t[i]!.id);
      await group.respondInvite(t[i]!.accountId, t[i]!.id, inv.invites[0]!.groupId, true);
    }
    const r3 = await group.launch(t[0]!.accountId, t[0]!.id, 'arena', '');
    expect(r3.activityType).toBe('arena');
    if (r3.activityType === 'arena') {
      expect(r3.bracket).toBe('3v3');
      expect(r3.status).toBe('queued');
    }
  });

  it('odchod leadera předá vedení; kick odebere člena', async () => {
    const [a, b, c] = await friends('Trans', 3);
    await group.create(a!.accountId, a!.id, 'tank');
    for (const m of [b!, c!]) {
      await group.invite(a!.accountId, a!.id, m.name, 'dps');
      const inv = await group.getState(m.accountId, m.id);
      await group.respondInvite(m.accountId, m.id, inv.invites[0]!.groupId, true);
    }
    // leader vyhodí c
    await group.kick(a!.accountId, a!.id, c!.id);
    expect((await group.getState(a!.accountId, a!.id)).group?.joinedCount).toBe(2);
    // leader odejde → vedení na b
    await group.leave(a!.accountId, a!.id);
    const bState = await group.getState(b!.accountId, b!.id);
    expect(bState.group?.leaderCharacterId).toBe(b!.id);
    expect(bState.group?.iAmLeader).toBe(true);
  });

  it('invite bez skupiny ji automaticky založí (volající = leader)', async () => {
    const [a, b] = await friends('Auto', 2);
    // a nemá skupinu; pozvání b ji založí.
    const state = await group.invite(a!.accountId, a!.id, b!.name, 'dps');
    expect(state.group).toBeTruthy();
    expect(state.group?.leaderCharacterId).toBe(a!.id);
    expect(state.group?.members.find((m) => m.characterId === b!.id)?.status).toBe('invited');
  });

  it('request to join → leader approve → člen připojen', async () => {
    const [a, b] = await friends('Req', 2);
    await group.create(a!.accountId, a!.id, 'tank');
    // b (bez skupiny) požádá o vstup do a-skupiny.
    await group.requestJoin(b!.accountId, b!.id, a!.name);
    const leaderState = await group.getState(a!.accountId, a!.id);
    const req = leaderState.group?.members.find((m) => m.characterId === b!.id);
    expect(req?.status).toBe('requested');
    // Leader schválí.
    await group.respondJoinRequest(a!.accountId, a!.id, b!.id, true);
    const after = await group.getState(b!.accountId, b!.id);
    expect(after.group?.joinedCount).toBe(2);
    expect(after.group?.leaderCharacterId).toBe(a!.id);
  });
});
