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
import { TalentRepository } from '../talent/talent.repository';
import { PushRepository } from '../push/push.repository';
import { PushService } from '../push/push.service';
import { GuildRepository } from '../social/guild.repository';
import { SocialRepository } from '../social/social.repository';
import { ArenaRepository } from './arena.repository';
import { TeamArenaService } from './team-arena.service';
import { InMemoryTeamArenaQueue } from './team-arena.queue';

/**
 * Integrační test M8.5-C týmových arén nad pglite (in-memory fronta, push no-op).
 */
describe('M8.5-C flow: team arena', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let social: SocialRepository;
  let team: TeamArenaService;
  let seq = 0;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    social = new SocialRepository(db);
  });

  beforeEach(() => {
    seq += 1;
    const invRepo = new InventoryRepository(db);
    team = new TeamArenaService(
      charRepo,
      new InventoryService(charRepo, invRepo),
      new TalentRepository(db),
      new ArenaRepository(db),
      social,
      new GuildRepository(db),
      new PushService(new PushRepository(db)),
      new InMemoryTeamArenaQueue(),
    );
  });

  async function player(name: string): Promise<{ accountId: string; id: string; name: string }> {
    const tokens = await auth.register(`ta_${name}_${seq}`, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'orc', class: 'warrior' });
    await charRepo.addRewards(char.id, 10_000_000, 0); // nad ARENA_MIN_LEVEL
    return { accountId, id: char.id, name: char.name };
  }

  /** Vytvoří `size` přátel leadera (vzájemně friend = accepted). */
  const SUFFIX = ['Ana', 'Bok', 'Cyr', 'Dim', 'Eli'];
  async function friendTeam(
    prefix: string,
    size: number,
  ): Promise<{ accountId: string; id: string; name: string }[]> {
    const members = [];
    for (let i = 0; i < size; i++) members.push(await player(`${prefix}${SUFFIX[i]}`));
    const leader = members[0]!;
    for (let i = 1; i < size; i++) {
      await social.create(leader.id, members[i]!.id, 'accepted');
    }
    return members;
  }

  it('3v3 tým z přátel jde do fronty (bez soupeře)', async () => {
    const t = await friendTeam('Qa', 3);
    const res = await team.queueTeam(t[0]!.accountId, t[0]!.id, '3v3', [t[1]!.name, t[2]!.name]);
    expect(res.status).toBe('queued');
    expect(res.matchId).toBeUndefined();
    const view = await team.getTeamArena(t[0]!.accountId, t[0]!.id);
    expect(view.brackets.find((b) => b.bracket === '3v3')?.queued).toBe(true);
  });

  it('druhý tým se spáruje a obě strany dostanou rating', async () => {
    const a = await friendTeam('Aa', 3);
    const b = await friendTeam('Bb', 3);
    await team.queueTeam(a[0]!.accountId, a[0]!.id, '3v3', [a[1]!.name, a[2]!.name]);
    const res = await team.queueTeam(b[0]!.accountId, b[0]!.id, '3v3', [b[1]!.name, b[2]!.name]);
    expect(res.status).toBe('matched');
    expect(res.matchId).toBeDefined();

    // Každý z 6 hráčů má buď výhru, nebo prohru a rating ≠ start.
    let wins = 0;
    let losses = 0;
    for (const p of [...a, ...b]) {
      const v = await team.getTeamArena(p.accountId, p.id);
      const row = v.brackets.find((br) => br.bracket === '3v3')!;
      wins += row.wins;
      losses += row.losses;
      expect(row.rating).not.toBe(1500);
    }
    expect(wins).toBe(3);
    expect(losses).toBe(3);

    // Detail zápasu z perspektivy člena týmu A.
    const match = await team.getMatch(a[0]!.accountId, a[0]!.id, res.matchId!);
    expect(match.myTeam).toHaveLength(3);
    expect(match.enemyTeam).toHaveLength(3);
    expect(match.bracket).toBe('3v3');
  });

  it('parťák, který není friend ani z guildy, je odmítnut', async () => {
    const leader = await player('Lonelya');
    const f = await player('Buddya');
    const stranger = await player('Strangera');
    await social.create(leader.id, f.id, 'accepted');
    await expect(
      team.queueTeam(leader.accountId, leader.id, '3v3', [f.name, stranger.name]),
    ).rejects.toThrow();
  });

  it('špatný počet parťáků pro bracket selže', async () => {
    const t = await friendTeam('Wrong', 3);
    await expect(
      team.queueTeam(t[0]!.accountId, t[0]!.id, '3v3', [t[1]!.name]),
    ).rejects.toThrow();
  });

  it('5v5 vyžaduje 4 parťáky a spáruje se', async () => {
    const a = await friendTeam('Fa', 5);
    const b = await friendTeam('Fb', 5);
    await team.queueTeam(a[0]!.accountId, a[0]!.id, '5v5', a.slice(1).map((m) => m.name));
    const res = await team.queueTeam(b[0]!.accountId, b[0]!.id, '5v5', b.slice(1).map((m) => m.name));
    expect(res.status).toBe('matched');
    const match = await team.getMatch(b[0]!.accountId, b[0]!.id, res.matchId!);
    expect(match.myTeam).toHaveLength(5);
  });

  it('leaveQueue vyřadí čekající tým', async () => {
    const t = await friendTeam('La', 3);
    await team.queueTeam(t[0]!.accountId, t[0]!.id, '3v3', [t[1]!.name, t[2]!.name]);
    const res = await team.leaveQueue(t[0]!.accountId, t[0]!.id, '3v3');
    expect(res.left).toBe(true);
    expect(
      (await team.getTeamArena(t[0]!.accountId, t[0]!.id)).brackets.find((b) => b.bracket === '3v3')
        ?.queued,
    ).toBe(false);
  });

  it('cizí účet nemůže číst týmovou arénu postavy', async () => {
    const a = await player('Ownera');
    const intruder = await player('Snoopa');
    await expect(team.getTeamArena(intruder.accountId, a.id)).rejects.toThrow();
  });
});
