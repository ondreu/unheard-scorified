import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { BASE_BANK_SLOTS, BASE_BACKPACK_SLOTS } from '@game/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { InventoryRepository } from '../inventory/inventory.repository';
import { makeGrant } from '../inventory/test-grant';
import { BankRepository } from './bank.repository';
import { BankService } from './bank.service';

/** Integrační test banky (M10+): deposit/withdraw mezi inventářem a bankou. */
describe('flow: bank storage', () => {
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let invRepo: InventoryRepository;
  let bank: BankService;
  let db: Database;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    invRepo = new InventoryRepository(db);
    characters = new CharacterService(charRepo, invRepo);
    bank = new BankService(charRepo, invRepo, makeGrant(db, invRepo), new BankRepository(db));
  });

  async function newCharacter(username: string, name: string): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'human', class: 'warrior' });
    return { accountId, id: char.id };
  }

  it('prázdná banka má plnou kapacitu', async () => {
    const { accountId, id } = await newCharacter('bank1', 'Vault');
    const view = await bank.getBank(accountId, id);
    expect(view.items).toHaveLength(0);
    expect(view.usedSlots).toBe(0);
    expect(view.capacity).toBe(BASE_BANK_SLOTS);
  });

  it('deposit přesune item z inventáře do banky a zpět withdraw', async () => {
    const { accountId, id } = await newCharacter('bank2', 'Keeper');
    await invRepo.addItemQty(id, 'copper_ore', 10);

    const afterDep = await bank.deposit(accountId, id, 'copper_ore', 6);
    expect(await invRepo.getQuantity(id, 'copper_ore')).toBe(4);
    expect(afterDep.items.find((i) => i.itemId === 'copper_ore')?.quantity).toBe(6);
    expect(afterDep.items[0]!.name).toBe('Copper Ore');

    const afterWd = await bank.withdraw(accountId, id, 'copper_ore', 2);
    expect(await invRepo.getQuantity(id, 'copper_ore')).toBe(6);
    expect(afterWd.items.find((i) => i.itemId === 'copper_ore')?.quantity).toBe(4);
  });

  it('deposit selže bez dostatku v inventáři; nic se nezmění', async () => {
    const { accountId, id } = await newCharacter('bank3', 'Poor');
    await invRepo.addItemQty(id, 'iron_ore', 2);
    await expect(bank.deposit(accountId, id, 'iron_ore', 5)).rejects.toThrow();
    expect(await invRepo.getQuantity(id, 'iron_ore')).toBe(2);
    expect((await bank.getBank(accountId, id)).items).toHaveLength(0);
  });

  it('withdraw selže při plném batohu (item zůstane v bance)', async () => {
    const { accountId, id } = await newCharacter('bank4', 'Hoarder');
    // Ulož unikátní gear do banky.
    await invRepo.addItem(id, 'iron_shortsword');
    await bank.deposit(accountId, id, 'iron_shortsword', 1);
    // Zaplň batoh různým gearem (1 slot/kus) na plno.
    for (let i = 0; i < BASE_BACKPACK_SLOTS; i++) await invRepo.addItem(id, `filler_${i}`);

    await expect(bank.withdraw(accountId, id, 'iron_shortsword', 1)).rejects.toThrow(/bag space/i);
    expect(await bank.getBank(accountId, id).then((v) => v.items.length)).toBe(1);
  });

  it('cizí účet nemá přístup k bance postavy', async () => {
    const owner = await newCharacter('bank5', 'Owner');
    const other = await newCharacter('bank6', 'Stranger');
    await expect(bank.getBank(other.accountId, owner.id)).rejects.toThrow();
  });
});
