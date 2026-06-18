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
import { makeGrant } from '../inventory/test-grant';
import { TradeRepository } from './trade.repository';
import { TradeService } from './trade.service';

/**
 * Integrační test M8.5-D P2P trade nad pglite.
 */
describe('M8.5-D flow: p2p trade', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let invRepo: InventoryRepository;
  let trade: TradeService;
  let seq = 0;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    invRepo = new InventoryRepository(db);
    trade = new TradeService(charRepo, invRepo, makeGrant(db, invRepo), new TradeRepository(db));
  });

  beforeEach(() => {
    seq += 1;
  });

  async function player(
    name: string,
    opts: { gold?: number; items?: { id: string; qty: number }[] } = {},
  ): Promise<{ accountId: string; id: string; name: string }> {
    const tokens = await auth.register(`tr_${name}_${seq}`, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'orc', class: 'fighter' });
    if (opts.gold) await charRepo.addRewards(char.id, 0, opts.gold);
    for (const it of opts.items ?? []) await invRepo.addItemQty(char.id, it.id, it.qty);
    return { accountId, id: char.id, name: char.name };
  }

  it('plná výměna: položky i zlato přejdou oběma směry', async () => {
    const a = await player('Trader', { gold: 100, items: [{ id: 'copper_ore', qty: 5 }] });
    const b = await player('Buyer', { gold: 200, items: [{ id: 'iron_ore', qty: 3 }] });

    await trade.start(a.accountId, a.id, b.name);
    // A nabídne 5 copper_ore + 50 g; B nabídne 3 iron_ore + 0 g.
    await trade.setOffer(a.accountId, a.id, [{ itemId: 'copper_ore', quantity: 5 }], 50);
    await trade.setOffer(b.accountId, b.id, [{ itemId: 'iron_ore', quantity: 3 }], 0);

    await trade.confirm(a.accountId, a.id);
    const afterB = await trade.confirm(b.accountId, b.id);
    expect(afterB.trade).toBeNull(); // dokončeno

    // A: -5 copper, +3 iron, -50 g; B: +5 copper, -3 iron, +50 g.
    expect(await invRepo.getQuantity(a.id, 'copper_ore')).toBe(0);
    expect(await invRepo.getQuantity(a.id, 'iron_ore')).toBe(3);
    expect((await charRepo.findById(a.id))!.gold).toBe(50);
    expect(await invRepo.getQuantity(b.id, 'copper_ore')).toBe(5);
    expect(await invRepo.getQuantity(b.id, 'iron_ore')).toBe(0);
    expect((await charRepo.findById(b.id))!.gold).toBe(250);
  });

  it('změna nabídky resetuje obě potvrzení', async () => {
    const a = await player('Aa', { items: [{ id: 'copper_ore', qty: 2 }] });
    const b = await player('Bb', { gold: 50 });
    await trade.start(a.accountId, a.id, b.name);
    await trade.setOffer(a.accountId, a.id, [{ itemId: 'copper_ore', quantity: 1 }], 0);
    await trade.confirm(a.accountId, a.id);
    // B změní nabídku → A potvrzení padá.
    await trade.setOffer(b.accountId, b.id, [], 25);
    const state = await trade.getState(a.accountId, a.id);
    expect(state.trade?.me.confirmed).toBe(false);
    expect(state.trade?.them.confirmed).toBe(false);
  });

  it('nelze nabídnout víc, než postava vlastní', async () => {
    const a = await player('Cc', { items: [{ id: 'copper_ore', qty: 1 }] });
    const b = await player('Dd');
    await trade.start(a.accountId, a.id, b.name);
    await expect(
      trade.setOffer(a.accountId, a.id, [{ itemId: 'copper_ore', quantity: 5 }], 0),
    ).rejects.toThrow();
    await expect(trade.setOffer(a.accountId, a.id, [], 999)).rejects.toThrow();
  });

  it('soulbound item nelze obchodovat', async () => {
    // Vezmi nějaký BoP item z katalogu (raid/dungeon loot). Pokud žádný není
    // soulbound, test by selhal na neznámém id — proto použijeme známý BoP.
    const a = await player('Ee', { items: [{ id: 'ashkandi', qty: 1 }] });
    const b = await player('Ff');
    await trade.start(a.accountId, a.id, b.name);
    await expect(
      trade.setOffer(a.accountId, a.id, [{ itemId: 'ashkandi', quantity: 1 }], 0),
    ).rejects.toThrow();
  });

  it('jen jeden otevřený trade na postavu; cancel uvolní', async () => {
    const a = await player('Gg');
    const b = await player('Hh');
    const c = await player('Ii');
    await trade.start(a.accountId, a.id, b.name);
    await expect(trade.start(a.accountId, a.id, c.name)).rejects.toThrow();
    await trade.cancel(a.accountId, a.id);
    // Po zrušení lze otevřít nový.
    const state = await trade.start(a.accountId, a.id, c.name);
    expect(state.trade?.them.name).toBe('Ii');
  });

  it('nelze obchodovat sám se sebou; cizí účet nečte stav', async () => {
    const a = await player('Jj');
    const intruder = await player('Kk');
    await expect(trade.start(a.accountId, a.id, 'Jj')).rejects.toThrow();
    await expect(trade.getState(intruder.accountId, a.id)).rejects.toThrow();
  });
});
