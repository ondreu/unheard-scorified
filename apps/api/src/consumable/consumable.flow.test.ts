import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { CONSUMABLE_BUFFS } from '@game/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import { BuffRepository } from '../buff/buff.repository';
import { ConsumableService } from './consumable.service';

/** Integrační test M10 spotřebáků: use → buff → bojový profil. */
describe('M10 flow: consumables (use → buff)', () => {
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let invRepo: InventoryRepository;
  let invService: InventoryService;
  let consumables: ConsumableService;

  beforeAll(async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    invRepo = new InventoryRepository(db);
    characters = new CharacterService(charRepo, invRepo);
    invService = new InventoryService(charRepo, invRepo, new BuffRepository(db));
    consumables = new ConsumableService(charRepo, invRepo, new BuffRepository(db));
  });

  async function newCharacter(
    username: string,
    name: string,
  ): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'human', class: 'fighter' });
    return { accountId, id: char.id };
  }

  it('panel ukáže spotřebáky z inventáře', async () => {
    const { accountId, id } = await newCharacter('cons1', 'Potiona');
    await invRepo.addItemQty(id, 'healing_potion', 2);
    const view = await consumables.getConsumables(accountId, id);
    expect(view.consumables.find((c) => c.itemId === 'healing_potion')?.quantity).toBe(2);
    expect(view.activeBuffs).toHaveLength(0);
  });

  it('use spotřebuje kus, aktivuje buff a buff se přičte do bojových statů', async () => {
    const { accountId, id } = await newCharacter('cons2', 'Potionb');
    await invRepo.addItemQty(id, 'elixir_of_strength', 1);

    const statsBefore = await invService.getEquipmentStats(id);
    const view = await consumables.use(accountId, id, 'elixir_of_strength');

    expect(await invRepo.getQuantity(id, 'elixir_of_strength')).toBe(0);
    expect(view.activeBuffs).toHaveLength(1);
    expect(view.activeBuffs[0]?.consumableId).toBe('elixir_of_strength');

    const statsAfter = await invService.getEquipmentStats(id);
    const expected = CONSUMABLE_BUFFS.elixir_of_strength.stats.strength ?? 0;
    expect((statsAfter.strength ?? 0) - (statsBefore.strength ?? 0)).toBe(expected);
  });

  it('use bez kusu v inventáři selže', async () => {
    const { accountId, id } = await newCharacter('cons3', 'Potionc');
    await expect(consumables.use(accountId, id, 'healing_potion')).rejects.toThrow();
  });

  it('use ne-spotřebáku selže', async () => {
    const { accountId, id } = await newCharacter('cons4', 'Potiond');
    await invRepo.addItemQty(id, 'iron_shortsword', 1);
    await expect(consumables.use(accountId, id, 'iron_shortsword')).rejects.toThrow();
  });
});
