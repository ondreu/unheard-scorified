import { Injectable, NotFoundException } from '@nestjs/common';
import { CharacterRepository } from '../character/character.repository';
import { HistoryRepository } from './history.repository';

/** Jeden záznam historie pro klienta (serializované datum). */
export interface HistoryEntry {
  id: string;
  kind: string;
  title: string;
  detail: string;
  outcome: string | null;
  createdAt: string;
}

const HISTORY_LIMIT = 50;

@Injectable()
export class HistoryService {
  constructor(
    private readonly repo: HistoryRepository,
    private readonly characters: CharacterRepository,
  ) {}

  async list(accountId: string, characterId: string): Promise<HistoryEntry[]> {
    const owned = await this.characters.findOwned(accountId, characterId);
    if (!owned) throw new NotFoundException('Character not found');
    const rows = await this.repo.listForCharacter(characterId, HISTORY_LIMIT);
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      detail: r.detail,
      outcome: r.outcome,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
