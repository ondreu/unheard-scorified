import { describe, expect, it } from 'vitest';
import {
  NPC_AUCTION_COUNT,
  generateNpcListings,
  findNpcListing,
  isCurrentNpcListing,
  isNpcListingId,
  npcAuctionWindowEnd,
  npcAuctionWindowStart,
  npcPoolIsAuctionable,
} from './npc-auction';

const T = Date.UTC(2026, 5, 17, 13, 30, 0); // mid-window sample

describe('NPC auction (živá aukce)', () => {
  it('všechny pool itemy jsou obchodovatelné na AH (ne soulbound)', () => {
    expect(npcPoolIsAuctionable()).toBe(true);
  });

  it('generuje stabilní deterministickou sadu pro dané okno', () => {
    const a = generateNpcListings(T);
    const b = generateNpcListings(T + 1000); // stejné okno
    expect(a).toHaveLength(NPC_AUCTION_COUNT);
    expect(b).toEqual(a);
    // Validní listingy: kladné množství i cena, id s prefixem, validní endsAt.
    for (const l of a) {
      expect(isNpcListingId(l.id)).toBe(true);
      expect(l.quantity).toBeGreaterThan(0);
      expect(l.buyout).toBeGreaterThan(0);
      expect(l.endsAt).toBe(npcAuctionWindowEnd(T));
    }
  });

  it('nová sada v dalším okně (rotace)', () => {
    const a = generateNpcListings(T);
    const next = npcAuctionWindowEnd(T) + 1000;
    const b = generateNpcListings(next);
    expect(b[0]!.id).not.toBe(a[0]!.id); // id obsahuje window
    // Stará id nejsou v novém okně platná.
    expect(isCurrentNpcListing(next, a[0]!.id)).toBe(false);
  });

  it('findNpcListing najde listing aktuálního okna, cizí/staré id ne', () => {
    const listings = generateNpcListings(T);
    const found = findNpcListing(T, listings[3]!.id);
    expect(found).toEqual(listings[3]);
    expect(findNpcListing(T, 'npc:0:0')).toBeUndefined();
    expect(findNpcListing(T, 'some-real-uuid')).toBeUndefined();
  });

  it('window helpers zarovnají na hranici okna', () => {
    const start = npcAuctionWindowStart(T);
    expect(start % (60 * 60 * 1000)).toBe(0); // zarovnáno na hodiny
    expect(npcAuctionWindowEnd(T)).toBeGreaterThan(T);
    expect(npcAuctionWindowStart(T)).toBeLessThanOrEqual(T);
  });
});
