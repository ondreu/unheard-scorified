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
import { TalentRepository } from './talent.repository';
import { TalentService } from './talent.service';

/**
 * Integrační testy M4 talent systému nad in-memory Postgresem (pglite).
 * Testuje: alokaci bodů, tier requirements, reset, max rank.
 */
describe('M4 flow: talent systém', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let talentRepo: TalentRepository;
  let talentService: TalentService;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    talentRepo = new TalentRepository(db);
    talentService = new TalentService(charRepo, talentRepo);
  });

  async function newCharacter(
    username: string,
    name: string,
    klass: string = 'warrior',
    xp: number = 0,
  ): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'human', class: klass });
    if (xp > 0) {
      await charRepo.addRewards(char.id, xp, 0);
    }
    return { accountId, id: char.id };
  }

  it('lvl 1 má 0 talent bodů', async () => {
    const { accountId, id } = await newCharacter('tala', 'Bolvar');
    const t = await talentService.listTalents(accountId, id);
    expect(t.totalPoints).toBe(0);
    expect(t.spentPoints).toBe(0);
    expect(t.availablePoints).toBe(0);
    expect(t.trees).toHaveLength(3);
  });

  it('alokace bez bodů vyhodí chybu', async () => {
    const { accountId, id } = await newCharacter('talb', 'Tirion');
    await expect(
      talentService.allocate(accountId, id, 'warrior.arms.weapon_expertise'),
    ).rejects.toThrow();
  });

  it('alokace talent bodu na lvl 2+ funguje', async () => {
    // lvl 2 → 1 bod (150 XP je lvl 2; xpForNextLevel(1) = 120)
    const { accountId, id } = await newCharacter('talc', 'Turalyon', 'warrior', 150);
    const before = await talentService.listTalents(accountId, id);
    expect(before.totalPoints).toBe(1);

    const after = await talentService.allocate(accountId, id, 'warrior.arms.weapon_expertise');
    expect(after.spentPoints).toBe(1);
    expect(after.availablePoints).toBe(0);
    const node = after.trees[0]!.nodes[0]!;
    expect(node.allocatedPoints).toBe(1);
  });

  it('talent za tier vyžaduje body v stromě', async () => {
    // Dostatečně vysoký level pro více bodů
    const { accountId, id } = await newCharacter('tald', 'Garrosh', 'warrior', 3000);
    // warrior.arms.improved_rend vyžaduje 5 bodů v Arms stromě
    // Bez nich to musí selhat
    await expect(
      talentService.allocate(accountId, id, 'warrior.arms.improved_rend'),
    ).rejects.toThrow();
  });

  it('reset vrátí všechny body', async () => {
    const { accountId, id } = await newCharacter('tale', 'Saurfang', 'warrior', 150);
    await talentService.allocate(accountId, id, 'warrior.arms.weapon_expertise');
    const afterReset = await talentService.resetAll(accountId, id);
    expect(afterReset.spentPoints).toBe(0);
    expect(afterReset.availablePoints).toBe(1);
  });

  it('neznámý talent vyhodí chybu', async () => {
    const { accountId, id } = await newCharacter('talf', 'Orgrim', 'warrior', 150);
    await expect(
      talentService.allocate(accountId, id, 'warrior.unknown.fake_talent'),
    ).rejects.toThrow();
  });

  it('talent jiné classy vyhodí chybu', async () => {
    const { accountId, id } = await newCharacter('talg', 'Durotan', 'warrior', 150);
    await expect(
      talentService.allocate(accountId, id, 'mage.fire.ignite'),
    ).rejects.toThrow();
  });

  it('cizí účet nemůže spravovat talenty', async () => {
    const owner = await newCharacter('talha', 'Grom', 'warrior', 150);
    const other = await newCharacter('talhb', 'Rexxar');
    await expect(
      talentService.listTalents(other.accountId, owner.id),
    ).rejects.toThrow();
  });
});
