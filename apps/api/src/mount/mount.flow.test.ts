import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMountSpeed, MOUNTS, xpForLevel } from '@game/shared';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { MountRepository } from './mount.repository';
import { MountService } from './mount.service';

/**
 * Integrační testy M10+ mountů nad pglite. Pokrývá: level/gold gating koupě,
 * idempotenci vlastnictví, výběr aktivního (kosmetického) mountu a výpočet
 * speed bonusu z vlastněných mountů.
 */
describe('M10+ flow: mounty', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let mountRepo: MountRepository;
  let service: MountService;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    mountRepo = new MountRepository(db);
    service = new MountService(charRepo, mountRepo);
  });

  async function newCharacter(
    username: string,
    name: string,
    level = 1,
    gold = 0,
  ): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'human', class: 'fighter' });
    const xp = level > 1 ? xpForLevel(level) : 0;
    if (xp > 0 || gold > 0) await charRepo.addRewards(char.id, xp, gold);
    return { accountId, id: char.id };
  }

  it('list ukazuje katalog s level/gold gatingem a nulovým bonusem bez mountu', async () => {
    const { accountId, id } = await newCharacter('m_a', 'Riderless', 1, 1000);
    const view = await service.listMounts(accountId, id);
    expect(view.speedBonus).toBe(0);
    expect(view.activeMountId).toBeNull();
    const basic = view.mounts.find((m) => m.id === 'brown_horse')!;
    expect(basic.owned).toBe(false);
    expect(basic.meetsLevel).toBe(false); // basic = level 30
    expect(basic.affordable).toBe(false);
  });

  it('odmítne koupi pod požadovaným levelem', async () => {
    const { accountId, id } = await newCharacter('m_b', 'Lowbie', 5, 1000);
    await expect(service.buy(accountId, id, 'brown_horse')).rejects.toThrow(/level/i);
  });

  it('odmítne koupi bez dostatku zlata', async () => {
    const { accountId, id } = await newCharacter('m_c', 'Pauper', 30, 10);
    await expect(service.buy(accountId, id, 'brown_horse')).rejects.toThrow(/gold/i);
  });

  it('koupí mount: strhne zlato, nastaví aktivní, dá speed bonus', async () => {
    const { accountId, id } = await newCharacter('m_d', 'Rider', 30, 1000);
    const view = await service.buy(accountId, id, 'brown_horse');
    expect(view.gold).toBe(1000 - MOUNTS.brown_horse!.cost);
    expect(view.activeMountId).toBe('brown_horse');
    expect(view.speedBonus).toBe(MOUNTS.brown_horse!.speedBonus);
    expect(view.mounts.find((m) => m.id === 'brown_horse')!.owned).toBe(true);
  });

  it('nelze koupit dvakrát týž mount', async () => {
    const { accountId, id } = await newCharacter('m_e', 'Doubler', 30, 1000);
    await service.buy(accountId, id, 'brown_horse');
    await expect(service.buy(accountId, id, 'brown_horse')).rejects.toThrow(/already owned/i);
  });

  it('best-of speed bonus a kosmetický výběr nezávislý na power', async () => {
    const { accountId, id } = await newCharacter('m_f', 'Collector', 50, 10000);
    await service.buy(accountId, id, 'brown_horse'); // basic
    const afterEpic = await service.buy(accountId, id, 'swift_palomino'); // epic
    expect(afterEpic.speedBonus).toBe(MOUNTS.swift_palomino!.speedBonus);

    // Vyber zpět kosmeticky basic mount — speed (power) zůstává epic.
    const selected = await service.select(accountId, id, 'brown_horse');
    expect(selected.activeMountId).toBe('brown_horse');
    expect(selected.speedBonus).toBe(MOUNTS.swift_palomino!.speedBonus);
  });

  it('nelze vybrat nevlastněný mount', async () => {
    const { accountId, id } = await newCharacter('m_g', 'Wisher', 50, 0);
    await expect(service.select(accountId, id, 'ebon_gryphon')).rejects.toThrow(/not owned/i);
  });

  it('applyMountSpeed zkrátí trvání aktivity dle vlastněného mountu', async () => {
    const { accountId, id } = await newCharacter('m_h', 'Speedy', 30, 1000);
    await service.buy(accountId, id, 'brown_horse');
    const owned = await mountRepo.ownedIds(id);
    const { mountSpeedBonus } = await import('@game/shared');
    expect(applyMountSpeed(1000, mountSpeedBonus(owned))).toBe(700);
  });
});
