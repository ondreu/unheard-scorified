/**
 * Inventář — kapacita (sloty) a stackování (M10 limited inventory). Jediný zdroj
 * pravdy pro API i web.
 *
 * Model (vanilla styl): inventář má **konečný počet slotů** = základní batoh +
 * sloty z vložených batohů (bag slotů). Každý **stack** itemu zabírá 1 slot až do
 * `maxStack`; přebytek nad maxStack potřebuje další slot. Itemy se v DB drží jako
 * `(itemId, quantity)`, využité sloty se **dopočítají** (`usedSlots`).
 */
import { ITEMS, bagSlots } from './data/items';
import { MATERIALS, CONSUMABLES } from './data/materials';

/** Základní (vždy dostupný) batoh. */
export const BASE_BACKPACK_SLOTS = 16;

/** Počet equipovatelných bag slotů (kam se vkládají batohy). */
export const BAG_SLOT_COUNT = 4;

/** Max velikost stacku materiálů/spotřebáků. Gear/batohy se nestackují (1). */
export const STACKABLE_MAX = 20;

/** Max velikost stacku itemu: gear/batoh = 1, materiál/spotřebák = STACKABLE_MAX. */
export function itemMaxStack(itemId: string): number {
  if (itemId in MATERIALS || itemId in CONSUMABLES) return STACKABLE_MAX;
  return 1; // gear, batohy, neznámé
}

/** Kolik slotů zabere `quantity` kusů itemu. */
export function slotsForStack(quantity: number, maxStack: number): number {
  if (quantity <= 0) return 0;
  return Math.ceil(quantity / maxStack);
}

export interface InvStack {
  itemId: string;
  quantity: number;
}

/** Počet využitých slotů daným inventářem. */
export function usedSlots(stacks: InvStack[]): number {
  let total = 0;
  for (const s of stacks) total += slotsForStack(s.quantity, itemMaxStack(s.itemId));
  return total;
}

/** Celková kapacita = základní batoh + sloty z vložených batohů. */
export function bagCapacity(equippedBagIds: string[]): number {
  let cap = BASE_BACKPACK_SLOTS;
  for (const id of equippedBagIds) cap += bagSlots(id);
  return cap;
}

export interface GrantPlan {
  /** Co se vejde a má se reálně přidat do inventáře. */
  add: InvStack[];
  /** Co se nevejde (→ pošta / odmítnutí). */
  overflow: InvStack[];
}

/**
 * Naplánuje přidání `incoming` do inventáře `current` s danou `capacity`.
 * Stack-aware: dorovná existující neúplné stacky, pak plní volné sloty; přebytek
 * jde do `overflow`. Čistá funkce (testovatelná, deterministická).
 */
export function planGrant(current: InvStack[], capacity: number, incoming: InvStack[]): GrantPlan {
  const qtyById = new Map<string, number>();
  for (const s of current) qtyById.set(s.itemId, (qtyById.get(s.itemId) ?? 0) + s.quantity);

  let free = Math.max(0, capacity - usedSlots(current));
  const add: InvStack[] = [];
  const overflow: InvStack[] = [];

  for (const inc of incoming) {
    if (inc.quantity <= 0) continue;
    const m = itemMaxStack(inc.itemId);
    const cur = qtyById.get(inc.itemId) ?? 0;
    const slotsBefore = slotsForStack(cur, m);

    // Room v existujícím neúplném top-stacku.
    const partialRoom = slotsBefore * m - cur;
    const fitPartial = Math.min(inc.quantity, partialRoom);
    let remaining = inc.quantity - fitPartial;

    // Zbytek do nových slotů (kolik máme volných).
    const fitNew = Math.min(remaining, free * m);
    remaining -= fitNew;

    const added = fitPartial + fitNew;
    if (added > 0) {
      const slotsAfter = slotsForStack(cur + added, m);
      free -= slotsAfter - slotsBefore;
      qtyById.set(inc.itemId, cur + added);
      add.push({ itemId: inc.itemId, quantity: added });
    }
    if (remaining > 0) overflow.push({ itemId: inc.itemId, quantity: remaining });
  }

  return { add, overflow };
}
