import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { characterEventLog, type NewCharacterEventLog, type CharacterEventLog } from '../db/schema';

/**
 * Append-only zápis + čtení historie dokončených aktivit (`character_event_log`).
 * Stateless, jen DB token → snadno injektovatelný do služeb, které udělují
 * odměny (activity/dungeon/raid/arena). `record` je best-effort: chyba zápisu
 * historie nesmí shodit grant odměny (volající ji loguje, ale nepropaguje).
 */
@Injectable()
export class HistoryRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async record(entry: NewCharacterEventLog): Promise<void> {
    await this.db.insert(characterEventLog).values(entry);
  }

  listForCharacter(
    characterId: string,
    limit: number,
    before?: Date,
  ): Promise<CharacterEventLog[]> {
    const where = before
      ? and(eq(characterEventLog.characterId, characterId), lt(characterEventLog.createdAt, before))
      : eq(characterEventLog.characterId, characterId);
    return this.db
      .select()
      .from(characterEventLog)
      .where(where)
      // `seq` jako deterministický tie-break: dva eventy se stejným `created_at`
      // se jinak vrátí v nedefinovaném pořadí (flaky „nejnovější první").
      .orderBy(desc(characterEventLog.createdAt), desc(characterEventLog.seq))
      .limit(limit);
  }
}
