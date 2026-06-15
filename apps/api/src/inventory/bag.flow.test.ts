import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { BASE_BACKPACK_SLOTS, bagSlots } from '@game/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { MailRepository } from '../mail/mail.repository';
import { BagRepository } from './bag.repository';
import { BagService } from './bag.service';
import { InventoryRepository } from './inventory.repository';
import { makeGrant } from './test-grant';

/** Integrační test M10 limited inventory: bag sloty + kapacita + overflow do pošty. */
describe('M10 flow: bags & inventory capacity', () => {
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let invRepo: InventoryRepository;
  let bags: BagService;
  let mail: MailRepository;
  let db: Database;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    invRepo = new InventoryRepository(db);
    characters = new CharacterService(charRepo, invRepo);
    bags = new BagService(charRepo, invRepo, new BagRepository(db));
    mail = new MailRepository(db);
  });

  async function newCharacter(username: string, name: string): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'human', class: 'warrior' });
    return { accountId, id: char.id };
  }

  it('výchozí kapacita = základní batoh, prázdné bag sloty', async () => {
    const { accountId, id } = await newCharacter('bag1', 'Baggins');
    const view = await bags.getBags(accountId, id);
    expect(view.capacity).toBe(BASE_BACKPACK_SLOTS);
    expect(view.bags).toHaveLength(view.slotCount);
    expect(view.bags.every((b) => b.bagId === null)).toBe(true);
  });

  it('vložení batohu zvýší kapacitu a spotřebuje ho z inventáře', async () => {
    const { accountId, id } = await newCharacter('bag2', 'Frodo');
    await invRepo.addItem(id, 'reinforced_pack'); // 8 slotů
    const view = await bags.equipBag(accountId, id, 0, 'reinforced_pack');
    expect(view.capacity).toBe(BASE_BACKPACK_SLOTS + bagSlots('reinforced_pack'));
    expect(view.bags[0]?.bagId).toBe('reinforced_pack');
    expect(await invRepo.getQuantity(id, 'reinforced_pack')).toBe(0);
  });

  it('vyjmutí batohu ho vrátí do inventáře a sníží kapacitu', async () => {
    const { accountId, id } = await newCharacter('bag3', 'Samwise');
    await invRepo.addItem(id, 'small_pouch');
    await bags.equipBag(accountId, id, 0, 'small_pouch');
    const view = await bags.unequipBag(accountId, id, 0);
    expect(view.capacity).toBe(BASE_BACKPACK_SLOTS);
    expect(await invRepo.getQuantity(id, 'small_pouch')).toBe(1);
  });

  it('overflow: co se nevejde, jde poštou (kurýr)', async () => {
    const { id } = await newCharacter('bag4', 'Pippin');
    const grant = makeGrant(db, invRepo);

    // Zaplň inventář na plno (gear = 1 slot/kus).
    await invRepo.addItemQty(id, 'iron_shortsword', BASE_BACKPACK_SLOTS);
    const fits = await grant.fits(id, [{ itemId: 'stormfury_blade', quantity: 1 }]);
    expect(fits).toBe(false);

    const result = await grant.grant(id, [{ itemId: 'stormfury_blade', quantity: 1 }]);
    expect(result.added).toHaveLength(0);
    expect(result.overflow).toEqual([{ itemId: 'stormfury_blade', quantity: 1 }]);

    // Vznikla systémová pošta s přílohou.
    const inbox = await mail.listInbox(id);
    expect(inbox.length).toBeGreaterThan(0);
    const items = await mail.listItems(inbox[0]!.id);
    expect(items.find((i) => i.itemId === 'stormfury_blade')?.quantity).toBe(1);
  });

  it('nelze vložit batoh, který postava nevlastní', async () => {
    const { accountId, id } = await newCharacter('bag5', 'Merry');
    await expect(bags.equipBag(accountId, id, 0, 'small_pouch')).rejects.toThrow();
  });
});
