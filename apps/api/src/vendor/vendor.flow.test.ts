import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { vendorBuyPrice, vendorSellPrice } from '@game/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { InventoryRepository } from '../inventory/inventory.repository';
import { VendorService } from './vendor.service';

/** Integrační test M10 vendor systému (pglite). */
describe('M10 flow: vendor (buy/sell)', () => {
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let invRepo: InventoryRepository;
  let vendor: VendorService;

  beforeAll(async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    invRepo = new InventoryRepository(db);
    characters = new CharacterService(charRepo, invRepo);
    vendor = new VendorService(charRepo, invRepo);
  });

  async function newCharacter(
    username: string,
    name: string,
  ): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'human', class: 'mage' });
    return { accountId, id: char.id };
  }

  it('panel ukáže sortiment a (prázdné) prodejné věci', async () => {
    const { accountId, id } = await newCharacter('vend1', 'Vendora');
    const view = await vendor.getVendor(accountId, id);
    expect(view.stock.length).toBeGreaterThan(0);
    expect(view.sellable).toHaveLength(0);
  });

  it('koupě strhne zlato a přidá item; málo zlata = chyba', async () => {
    const { accountId, id } = await newCharacter('vend2', 'Vendorb');
    await charRepo.addGold(id, 1000);

    const before = (await vendor.getVendor(accountId, id)).gold;
    const after = await vendor.buy(accountId, id, 'worn_robe', 1);
    expect(after.gold).toBe(before - vendorBuyPrice('worn_robe'));
    expect(await invRepo.getQuantity(id, 'worn_robe')).toBe(1);

    // bez peněz koupit drahou věc nejde
    await expect(vendor.buy(accountId, id, 'worn_robe', 100000)).rejects.toThrow();
  });

  it('prodej odebere item a připíše zlato', async () => {
    const { accountId, id } = await newCharacter('vend3', 'Vendorc');
    await invRepo.addItemQty(id, 'copper_ore', 5);

    const before = (await vendor.getVendor(accountId, id)).gold;
    const after = await vendor.sell(accountId, id, 'copper_ore', 3);
    expect(after.gold).toBe(before + vendorSellPrice('copper_ore') * 3);
    expect(await invRepo.getQuantity(id, 'copper_ore')).toBe(2);
  });

  it('prodej víc kusů než vlastníš selže', async () => {
    const { accountId, id } = await newCharacter('vend4', 'Vendord');
    await invRepo.addItemQty(id, 'copper_ore', 1);
    await expect(vendor.sell(accountId, id, 'copper_ore', 5)).rejects.toThrow();
  });

  it('vendor neprodává neznámé/mimo sortiment věci', async () => {
    const { accountId, id } = await newCharacter('vend5', 'Vendore');
    await charRepo.addGold(id, 1000);
    await expect(vendor.buy(accountId, id, 'ashkandi', 1)).rejects.toThrow();
  });
});
