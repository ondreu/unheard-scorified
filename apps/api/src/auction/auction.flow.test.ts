import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { InventoryRepository } from '../inventory/inventory.repository';
import { makeGrant } from '../inventory/test-grant';
import { PushRepository } from '../push/push.repository';
import { PushService } from '../push/push.service';
import { AuctionRepository } from './auction.repository';
import { NpcAuctionRepository } from './npc-auction.repository';
import { AuctionService } from './auction.service';
import { AuctionSettler } from './auction.settler';
import { NoopAuctionScheduler } from './auction.scheduler';

/**
 * Integrační test M8 Auction House nad pglite (bez Redisu — Noop scheduler;
 * vypořádání lazy při čtení = zdroj pravdy). Čas řídíme fake timers (expirace).
 */
describe('M8 flow: auction house', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let invRepo: InventoryRepository;
  let ah: AuctionService;

  const T0 = Date.UTC(2026, 5, 14, 12, 0, 0);

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    invRepo = new InventoryRepository(db);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const settler = new AuctionSettler(
      new AuctionRepository(db),
      charRepo,
      invRepo,
      makeGrant(db, invRepo),
      new PushService(new PushRepository(db)),
    );
    ah = new AuctionService(
      charRepo,
      invRepo,
      makeGrant(db, invRepo),
      new AuctionRepository(db),
      new NpcAuctionRepository(db),
      settler,
      new NoopAuctionScheduler(),
    );
  });

  afterEach(() => vi.useRealTimers());

  /** Postava s daným zlatem a volitelně itemy v inventáři. */
  async function trader(
    username: string,
    name: string,
    gold = 1000,
    items: { id: string; qty: number }[] = [],
  ): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'orc', class: 'fighter' });
    await charRepo.addRewards(char.id, 0, gold);
    for (const it of items) await invRepo.addItemQty(char.id, it.id, it.qty);
    return { accountId, id: char.id };
  }

  const gold = async (id: string): Promise<number> => (await charRepo.findById(id))!.gold;
  const qty = (id: string, item: string): Promise<number> => invRepo.getQuantity(id, item);

  it('výpis escrowuje item a strhne deposit; browse ho ukáže', async () => {
    const s = await trader('ah_s1', 'Seller', 1000, [{ id: 'copper_ore', qty: 10 }]);
    const view = await ah.createListing(s.accountId, s.id, {
      itemId: 'copper_ore',
      quantity: 10,
      startBid: 100,
      buyout: 500,
      duration: 'short',
    });
    expect(view.itemName).toBe('Copper Ore');
    expect(await qty(s.id, 'copper_ore')).toBe(0); // escrowováno
    expect(await gold(s.id)).toBe(1000 - view.deposit);

    const buyer = await trader('ah_b1', 'Buyer');
    const browse = (await ah.browse(buyer.accountId, buyer.id)).filter((b) => !b.isNpc);
    expect(browse).toHaveLength(1);
    expect(browse[0]!.quantity).toBe(10);
    expect(browse[0]!.minBid).toBe(100);
  });

  it('soulbound (BoP) item nelze vypsat na AH (M8.6)', async () => {
    // `ashkandi` je raid loot = BoP. Item je v inventáři, ale výpis musí selhat.
    const s = await trader('ah_bop', 'Bound', 1000, [{ id: 'ashkandi', qty: 1 }]);
    await expect(
      ah.createListing(s.accountId, s.id, {
        itemId: 'ashkandi',
        quantity: 1,
        startBid: 100,
        duration: 'short',
      }),
    ).rejects.toThrow(/soulbound/i);
    // Item i zlato zůstaly netknuté (deposit se nestrhl).
    expect(await qty(s.id, 'ashkandi')).toBe(1);
    expect(await gold(s.id)).toBe(1000);
  });

  it('nedostatek zlata na deposit → výpis selže, item zůstává', async () => {
    const s = await trader('ah_s2', 'Pauper', 0, [{ id: 'mithril_ore', qty: 50 }]);
    await expect(
      ah.createListing(s.accountId, s.id, {
        itemId: 'mithril_ore',
        quantity: 50,
        startBid: 100,
        duration: 'long',
      }),
    ).rejects.toThrow();
    expect(await qty(s.id, 'mithril_ore')).toBe(50);
  });

  it('bid escrowuje zlato a přehození vrací předchozímu dražiteli', async () => {
    const s = await trader('ah_s3', 'Sellerz', 1000, [{ id: 'iron_ore', qty: 5 }]);
    const a = await ah.createListing(s.accountId, s.id, {
      itemId: 'iron_ore',
      quantity: 5,
      startBid: 100,
      buyout: 1000,
      duration: 'short',
    });
    const b1 = await trader('ah_b3a', 'Bidderone');
    const b2 = await trader('ah_b3b', 'Biddertwo');

    await ah.bid(b1.accountId, b1.id, a.id, 100);
    expect(await gold(b1.id)).toBe(900);

    const outbid = await ah.bid(b2.accountId, b2.id, a.id, 150);
    expect(outbid.currentBid).toBe(150);
    expect(await gold(b2.id)).toBe(850);
    expect(await gold(b1.id)).toBe(1000); // vráceno

    // Prodejce nemůže přihazovat na vlastní aukci.
    await expect(ah.bid(s.accountId, s.id, a.id, 200)).rejects.toThrow();
    // Pod minimem.
    await expect(ah.bid(b1.accountId, b1.id, a.id, 151)).rejects.toThrow();
  });

  it('buyout okamžitě prodá: kupec dostane item, prodejce výnos+deposit zpět', async () => {
    const s = await trader('ah_s4', 'Merchant', 1000, [{ id: 'silver_ore', qty: 3 }]);
    const a = await ah.createListing(s.accountId, s.id, {
      itemId: 'silver_ore',
      quantity: 3,
      startBid: 100,
      buyout: 500,
      duration: 'short',
    });
    const goldAfterList = await gold(s.id);
    const prior = await trader('ah_b4a', 'PriorBidder');
    await ah.bid(prior.accountId, prior.id, a.id, 100);
    expect(await gold(prior.id)).toBe(900);

    const buyer = await trader('ah_b4b', 'Buyerz');
    const sold = await ah.buyout(buyer.accountId, buyer.id, a.id);
    expect(sold.status).toBe('sold');
    expect(await qty(buyer.id, 'silver_ore')).toBe(3);
    expect(await gold(buyer.id)).toBe(500);
    expect(await gold(prior.id)).toBe(1000); // escrow vrácen
    // Prodejce: 500 - 5% cut (25) + deposit zpět.
    expect(await gold(s.id)).toBe(goldAfterList + (500 - 25) + a.deposit);
  });

  it('zrušení bez nabídek vrátí item, deposit propadá', async () => {
    const s = await trader('ah_s5', 'Canceller', 1000, [{ id: 'peacebloom', qty: 8 }]);
    const a = await ah.createListing(s.accountId, s.id, {
      itemId: 'peacebloom',
      quantity: 8,
      startBid: 50,
      duration: 'short',
    });
    const goldAfterList = await gold(s.id);
    const res = await ah.cancel(s.accountId, s.id, a.id);
    expect(res.status).toBe('cancelled');
    expect(await qty(s.id, 'peacebloom')).toBe(8); // item zpět
    expect(await gold(s.id)).toBe(goldAfterList); // deposit se nevrací
  });

  it('expirace s nabídkou prodá nejvyššímu dražiteli (lazy settle)', async () => {
    const s = await trader('ah_s6', 'Expseller', 1000, [{ id: 'goldthorn', qty: 4 }]);
    const a = await ah.createListing(s.accountId, s.id, {
      itemId: 'goldthorn',
      quantity: 4,
      startBid: 200,
      duration: 'short',
    });
    const goldAfterList = await gold(s.id);
    const b = await trader('ah_b6', 'Winner');
    await ah.bid(b.accountId, b.id, a.id, 200);

    // Posuň čas za expiraci → lazy settle při čtení.
    vi.setSystemTime(T0 + 13 * 3600 * 1000);
    const browse = (await ah.browse(b.accountId, b.id)).filter((x) => !x.isNpc);
    expect(browse).toHaveLength(0); // už není aktivní
    expect(await qty(b.id, 'goldthorn')).toBe(4);
    expect(await gold(s.id)).toBe(goldAfterList + (200 - 10) + a.deposit);
  });

  it('expirace bez nabídky vrátí item prodejci, deposit propadá', async () => {
    const s = await trader('ah_s7', 'Noseller', 1000, [{ id: 'briarthorn', qty: 6 }]);
    const a = await ah.createListing(s.accountId, s.id, {
      itemId: 'briarthorn',
      quantity: 6,
      startBid: 999,
      duration: 'short',
    });
    const goldAfterList = await gold(s.id);
    vi.setSystemTime(T0 + 13 * 3600 * 1000);
    const mine = await ah.myAuctions(s.accountId, s.id);
    expect(mine.find((m) => m.id === a.id)?.status).toBe('expired');
    expect(await qty(s.id, 'briarthorn')).toBe(6);
    expect(await gold(s.id)).toBe(goldAfterList); // deposit propadl
  });

  // ── Živá aukce (NPC listingy) ─────────────────────────────────────────────

  it('browse vrací seedované NPC listingy i bez hráčských aukcí', async () => {
    const buyer = await trader('npc_b1', 'Browser', 100000);
    const browse = await ah.browse(buyer.accountId, buyer.id);
    const npc = browse.filter((b) => b.isNpc);
    expect(npc.length).toBeGreaterThan(0);
    // NPC listing = buyout-only (žádný bid), deterministicky stejný v rámci okna.
    for (const l of npc) {
      expect(l.buyout).not.toBeNull();
      expect(l.currentBid).toBeNull();
      expect(l.deposit).toBe(0);
    }
    const again = await ah.browse(buyer.accountId, buyer.id);
    expect(again.filter((b) => b.isNpc).map((b) => b.id)).toEqual(npc.map((b) => b.id));
  });

  it('nákup NPC listingu strhne zlato, doručí item a zmizí z výpisu', async () => {
    const buyer = await trader('npc_b2', 'NpcBuyer', 100000);
    const before = await ah.browse(buyer.accountId, buyer.id);
    const target = before.find((b) => b.isNpc)!;
    const goldBefore = await gold(buyer.id);

    const sold = await ah.buyout(buyer.accountId, buyer.id, target.id);
    expect(sold.status).toBe('sold');
    expect(await gold(buyer.id)).toBe(goldBefore - target.buyout!);
    expect(await qty(buyer.id, target.itemId)).toBeGreaterThanOrEqual(target.quantity);

    // Koupený listing se z výpisu té postavy skryje.
    const after = await ah.browse(buyer.accountId, buyer.id);
    expect(after.find((b) => b.id === target.id)).toBeUndefined();
  });

  it('tentýž NPC listing nelze koupit dvakrát; nelze na něj přihazovat', async () => {
    const buyer = await trader('npc_b3', 'DoubleBuyer', 100000);
    const target = (await ah.browse(buyer.accountId, buyer.id)).find((b) => b.isNpc)!;
    await ah.buyout(buyer.accountId, buyer.id, target.id);
    await expect(ah.buyout(buyer.accountId, buyer.id, target.id)).rejects.toThrow();
    await expect(ah.bid(buyer.accountId, buyer.id, target.id, 999999)).rejects.toThrow(/buyout-only/i);
  });
});
