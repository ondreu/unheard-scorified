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
import type { Character } from '../db/schema';
import * as schema from '../db/schema';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import { BuffRepository } from '../buff/buff.repository';
import { TalentRepository } from '../talent/talent.repository';
import { PushRepository } from '../push/push.repository';
import { PushService } from '../push/push.service';
import { ArenaRepository } from './arena.repository';
import { TeamArenaService } from './team-arena.service';
import { InMemoryTeamArenaQueue } from './team-arena.queue';

/**
 * Integrační test M9 týmových arén nad pglite (in-memory fronta, push no-op).
 * Testuje `launchForGroup` (skupina → tým); eligibilita (friend/guild) se ověřuje
 * v group flow testu (GroupService). Viz ADR 0020 + 0022.
 */
describe('M9 flow: team arena (launchForGroup)', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let team: TeamArenaService;
  let seq = 0;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
  });

  beforeEach(() => {
    seq += 1;
    const invRepo = new InventoryRepository(db);
    team = new TeamArenaService(
      charRepo,
      new InventoryService(charRepo, invRepo, new BuffRepository(db)),
      new TalentRepository(db),
      new ArenaRepository(db),
      new PushService(new PushRepository(db)),
      new InMemoryTeamArenaQueue(),
    );
  });

  async function player(name: string): Promise<Character> {
    const tokens = await auth.register(`ta_${name}_${seq}`, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'orc', class: 'warrior' });
    await charRepo.addRewards(char.id, 10_000_000, 0); // nad ARENA_MIN_LEVEL
    return (await charRepo.findById(char.id))!;
  }

  const SUFFIX = ['Ana', 'Bok', 'Cyr', 'Dim', 'Eli'];
  async function teamOf(prefix: string, size: number): Promise<Character[]> {
    const members: Character[] = [];
    for (let i = 0; i < size; i++) members.push(await player(`${prefix}${SUFFIX[i]}`));
    return members;
  }

  it('3v3 tým jde do fronty (bez soupeře)', async () => {
    const t = await teamOf('Qa', 3);
    const res = await team.launchForGroup(t[0]!, t, '3v3');
    expect(res.status).toBe('queued');
    expect(res.matchId).toBeUndefined();
    const view = await team.getTeamArena(t[0]!.accountId, t[0]!.id);
    expect(view.brackets.find((b) => b.bracket === '3v3')?.queued).toBe(true);
  });

  it('2v2 tým (skupina o 2) se spáruje', async () => {
    const a = await teamOf('Da', 2);
    const b = await teamOf('Db', 2);
    await team.launchForGroup(a[0]!, a, '2v2');
    const res = await team.launchForGroup(b[0]!, b, '2v2');
    expect(res.status).toBe('matched');
    const match = await team.getMatch(b[0]!.accountId, b[0]!.id, res.matchId!);
    expect(match.myTeam).toHaveLength(2);
    expect(match.bracket).toBe('2v2');
  });

  it('druhý tým se spáruje a obě strany dostanou rating', async () => {
    const a = await teamOf('Aa', 3);
    const b = await teamOf('Bb', 3);
    await team.launchForGroup(a[0]!, a, '3v3');
    const res = await team.launchForGroup(b[0]!, b, '3v3');
    expect(res.status).toBe('matched');
    expect(res.matchId).toBeDefined();

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

    const match = await team.getMatch(a[0]!.accountId, a[0]!.id, res.matchId!);
    expect(match.myTeam).toHaveLength(3);
    expect(match.enemyTeam).toHaveLength(3);
    expect(match.bracket).toBe('3v3');
  });

  it('špatný počet členů pro bracket selže', async () => {
    const t = await teamOf('Wrong', 3);
    await expect(team.launchForGroup(t[0]!, t.slice(0, 2), '3v3')).rejects.toThrow();
  });

  it('5v5 vyžaduje 5 členů a spáruje se', async () => {
    const a = await teamOf('Fa', 5);
    const b = await teamOf('Fb', 5);
    await team.launchForGroup(a[0]!, a, '5v5');
    const res = await team.launchForGroup(b[0]!, b, '5v5');
    expect(res.status).toBe('matched');
    const match = await team.getMatch(b[0]!.accountId, b[0]!.id, res.matchId!);
    expect(match.myTeam).toHaveLength(5);
  });

  it('leaveQueue vyřadí čekající tým', async () => {
    const t = await teamOf('La', 3);
    await team.launchForGroup(t[0]!, t, '3v3');
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
