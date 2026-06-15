import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import {
  buildCharacterSheet,
  ITEMS,
  PROFESSIONS,
  isItemId,
  isProfessionId,
  totalXpForLevel,
  MAX_LEVEL,
} from '@game/shared';
import { DB, type Database } from '../db/db.module';
import {
  characters,
  characterActivities,
  characterInventory,
  characterEquipment,
  characterTalents,
} from '../db/schema';
import { CharacterRepository } from '../character/character.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { ProfessionRepository } from '../profession/profession.repository';
import { ActivityRepository } from '../activity/activity.repository';

export interface DevCharacterState {
  id: string;
  name: string;
  level: number;
  totalXp: number;
  gold: number;
}

@Injectable()
export class DevService {
  constructor(
    private readonly charactersRepo: CharacterRepository,
    private readonly inventory: InventoryRepository,
    private readonly professions: ProfessionRepository,
    private readonly activities: ActivityRepository,
    @Inject(DB) private readonly db: Database,
  ) {}

  async getState(characterId: string): Promise<DevCharacterState> {
    const char = await this.charactersRepo.findById(characterId);
    if (!char) throw new NotFoundException('Character not found');
    const sheet = buildCharacterSheet(char.race, char.class, char.totalXp);
    return { id: char.id, name: char.name, level: sheet.level, totalXp: char.totalXp, gold: char.gold };
  }

  async setLevel(characterId: string, level: number): Promise<DevCharacterState> {
    const char = await this.charactersRepo.findById(characterId);
    if (!char) throw new NotFoundException('Character not found');

    const targetXp = totalXpForLevel(Math.min(level, MAX_LEVEL));
    await this.db
      .update(characters)
      .set({ totalXp: targetXp })
      .where(eq(characters.id, characterId));

    return this.getState(characterId);
  }

  async addGold(characterId: string, amount: number): Promise<DevCharacterState> {
    const char = await this.charactersRepo.findById(characterId);
    if (!char) throw new NotFoundException('Character not found');

    await this.charactersRepo.addGold(characterId, amount);
    return this.getState(characterId);
  }

  async addItem(characterId: string, itemId: string, quantity = 1): Promise<{ itemId: string; quantity: number; name: string }> {
    const char = await this.charactersRepo.findById(characterId);
    if (!char) throw new NotFoundException('Character not found');

    if (!isItemId(itemId)) throw new BadRequestException(`Unknown item: ${itemId}`);
    await this.inventory.addItemQty(characterId, itemId, quantity);

    return { itemId, quantity, name: ITEMS[itemId]!.name };
  }

  async completeActivity(characterId: string): Promise<{ completed: boolean; message: string }> {
    const activity = await this.activities.findByCharacter(characterId);
    if (!activity) return { completed: false, message: 'No active activity' };

    // Shift startAt far enough into the past so (now - startAt) >= durationSec.
    const pastDate = new Date(Date.now() - (activity.durationSec + 10) * 1000);
    await this.db
      .update(characterActivities)
      .set({ startAt: pastDate })
      .where(eq(characterActivities.characterId, characterId));

    return { completed: true, message: `Activity "${activity.activityType}" is now claimable` };
  }

  async timeWarp(characterId: string, hours: number): Promise<{ warped: boolean; message: string }> {
    const activity = await this.activities.findByCharacter(characterId);
    if (!activity) return { warped: false, message: 'No active activity to warp' };

    const shiftMs = hours * 60 * 60 * 1000;
    const newStartAt = new Date(activity.startAt.getTime() - shiftMs);
    await this.db
      .update(characterActivities)
      .set({ startAt: newStartAt })
      .where(eq(characterActivities.characterId, characterId));

    return { warped: true, message: `Warped ${hours}h forward — activity now claimable` };
  }

  async setProfession(characterId: string, professionId: string, skill: number): Promise<{ professionId: string; skill: number }> {
    const char = await this.charactersRepo.findById(characterId);
    if (!char) throw new NotFoundException('Character not found');

    if (!isProfessionId(professionId)) throw new BadRequestException(`Unknown profession: ${professionId}`);
    await this.professions.setSkill(characterId, professionId, skill);

    return { professionId, skill };
  }

  async resetCharacter(characterId: string): Promise<{ reset: boolean }> {
    const char = await this.charactersRepo.findById(characterId);
    if (!char) throw new NotFoundException('Character not found');

    await this.db.delete(characterActivities).where(eq(characterActivities.characterId, characterId));
    await this.db.delete(characterInventory).where(eq(characterInventory.characterId, characterId));
    await this.db.delete(characterEquipment).where(eq(characterEquipment.characterId, characterId));
    await this.db.delete(characterTalents).where(eq(characterTalents.characterId, characterId));
    await this.db.update(characters).set({ totalXp: 0, gold: 0 }).where(eq(characters.id, characterId));

    return { reset: true };
  }

  listItems(): { id: string; name: string; slot: string; rarity: string; itemLevel: number }[] {
    return Object.values(ITEMS).map((item) => ({
      id: item.id,
      name: item.name,
      slot: item.slot,
      rarity: item.rarity,
      itemLevel: item.itemLevel,
    }));
  }

  listProfessions(): { id: string; name: string }[] {
    return Object.values(PROFESSIONS).map((p) => ({ id: p.id, name: p.name }));
  }
}
