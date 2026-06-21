import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { BestiaryProgress } from '@game/shared';
import { DB, type Database } from '../db/db.module';
import { characterBestiary, type NewCharacterBestiaryRow } from '../db/schema';

/**
 * Persistence bestiáře (per-postava stav: objeveno + kill counter).
 * Záznam = řádek; chybějící řádek = neobjevený nepřítel (UI zašedlé).
 */
@Injectable()
export class BestiaryRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Mapa templateId → {discovered, kills} pro danou postavu. */
  async progressFor(characterId: string): Promise<Record<string, BestiaryProgress>> {
    const rows = await this.db
      .select()
      .from(characterBestiary)
      .where(eq(characterBestiary.characterId, characterId));
    const out: Record<string, BestiaryProgress> = {};
    for (const row of rows) {
      out[row.enemyTemplateId] = {
        discovered: true,
        kills: row.kills,
        discoveredAtMs: row.discoveredAt.getTime(),
      };
    }
    return out;
  }

  /**
   * Inkrementuje kill countery (upsert). První zápis založí řádek (= objeveno),
   * další přičtou. `counts` = templateId → kolik killů přidat (≥1).
   */
  async addKills(characterId: string, counts: Record<string, number>): Promise<void> {
    const values: NewCharacterBestiaryRow[] = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([enemyTemplateId, kills]) => ({ characterId, enemyTemplateId, kills }));
    if (values.length === 0) return;
    await this.db
      .insert(characterBestiary)
      .values(values)
      .onConflictDoUpdate({
        target: [characterBestiary.characterId, characterBestiary.enemyTemplateId],
        set: { kills: sql`${characterBestiary.kills} + excluded.kills` },
      });
  }
}
