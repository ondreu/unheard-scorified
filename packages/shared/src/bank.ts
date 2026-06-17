/**
 * Banka (M10+ FEAT) — úložiště mimo batoh. Postava může uložit itemy do banky,
 * čímž **uvolní sloty v batohu** (banka má vlastní kapacitu, nezávislou na bag
 * slotech). Stack-aware stejně jako inventář (`usedSlots`/`planGrant` z
 * `inventory.ts`). Jediný zdroj pravdy pro API i web.
 *
 * MVP: pevný počet slotů; bankovní bag sloty (rozšíření kapacity) = follow-up.
 */

/** Pevná kapacita banky (slotů). Větší než základní batoh — to je smysl banky. */
export const BASE_BANK_SLOTS = 28;

/** Kapacita banky postavy. Zatím konstantní (bank-bag sloty = follow-up). */
export function bankCapacity(): number {
  return BASE_BANK_SLOTS;
}
