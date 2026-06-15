import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, lt } from 'drizzle-orm';
import { CONSUMABLE_BUFFS, type ItemStats, type ConsumableId } from '@game/shared';
import { DB, type Database } from '../db/db.module';
import { characterBuffs, type CharacterBuff } from '../db/schema';

/**
 * Aktivní (dočasné) buffy postavy z použitých spotřebáků (M10). Stat bonus se
 * odvozuje z `CONSUMABLE_BUFFS` (@game/shared) — tabulka drží jen identitu +
 * expiraci. Prošlé buffy se z výsledků filtrují (a lazy mažou).
 */
@Injectable()
export class BuffRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Aktivní (neprošlé) buffy postavy. */
  async listActive(characterId: string): Promise<CharacterBuff[]> {
    return this.db
      .select()
      .from(characterBuffs)
      .where(and(eq(characterBuffs.characterId, characterId), gt(characterBuffs.expiresAt, new Date())));
  }

  /** Aplikuje (refresh) buff: nastaví expiraci na now + durationSec. */
  async apply(characterId: string, consumableId: ConsumableId, durationSec: number): Promise<void> {
    const expiresAt = new Date(Date.now() + durationSec * 1000);
    await this.db
      .insert(characterBuffs)
      .values({ characterId, consumableId, expiresAt })
      .onConflictDoUpdate({
        target: [characterBuffs.characterId, characterBuffs.consumableId],
        set: { expiresAt },
      });
  }

  /** Smaže prošlé buffy postavy (úklid). */
  async pruneExpired(characterId: string): Promise<void> {
    await this.db
      .delete(characterBuffs)
      .where(and(eq(characterBuffs.characterId, characterId), lt(characterBuffs.expiresAt, new Date())));
  }

  /** Souhrn statů ze všech aktivních buffů (pro bojový profil). */
  async activeStats(characterId: string): Promise<ItemStats> {
    const rows = await this.listActive(characterId);
    const out: ItemStats = {};
    for (const row of rows) {
      const buff = CONSUMABLE_BUFFS[row.consumableId as ConsumableId];
      if (!buff) continue;
      for (const [k, v] of Object.entries(buff.stats) as [keyof ItemStats, number][]) {
        out[k] = (out[k] ?? 0) + v;
      }
    }
    return out;
  }
}
