import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  activityProgress,
  aggregateTalentEffects,
  baseStatsFor,
  buildEnemyActor,
  deriveCombatProfile,
  DUNGEONS,
  isDungeonId,
  isDungeonUnlocked,
  levelFromXp,
  seedFromString,
  simulateDungeonRun,
  type ActivityState,
  type ClassId,
  type CombatActor,
  type CombatEvent,
  type DungeonActivityParams,
  type RaceId,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryService } from '../inventory/inventory.service';
import { TalentRepository } from '../talent/talent.repository';
import { ActivityRepository } from '../activity/activity.repository';
import { ACTIVITY_SCHEDULER, type ActivityScheduler } from '../activity/activity.scheduler';
import type { Character, CharacterActivity } from '../db/schema';

export interface DungeonListItem {
  id: string;
  name: string;
  description: string;
  requiredLevel: number;
  recommendedLevel: number;
  encounterCount: number;
  bossName: string;
  unlocked: boolean;
}

export interface DungeonLogView {
  dungeonId: string;
  dungeonName: string;
  startAt: string;
  durationSec: number;
  progress: {
    elapsedSec: number;
    remainingSec: number;
    progress: number;
    completed: boolean;
    finishesAt: string;
  };
  player: { name: string; maxHealth: number };
  enemies: { name: string; isBoss: boolean }[];
  /** Události, které už „proběhly" (t <= elapsed). */
  events: CombatEvent[];
  /** null dokud boj neskončí; pak true/false. */
  victory: boolean | null;
  /** Počet wipů (jen po dokončení; řídí snížení odměny). Null dokud běží. */
  wipes: number | null;
}

@Injectable()
export class DungeonService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly inventory: InventoryService,
    private readonly talents: TalentRepository,
    private readonly activities: ActivityRepository,
    @Inject(ACTIVITY_SCHEDULER) private readonly scheduler: ActivityScheduler,
  ) {}

  /** Seznam všech dungeonů s flagem `unlocked` dle levelu postavy. */
  async listDungeons(accountId: string, characterId: string): Promise<DungeonListItem[]> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const level = levelFromXp(character.totalXp);
    return Object.values(DUNGEONS)
      .sort((a, b) => a.requiredLevel - b.requiredLevel)
      .map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        requiredLevel: d.requiredLevel,
        recommendedLevel: d.recommendedLevel,
        encounterCount: d.encounters.length,
        bossName: d.encounters.at(-1)?.name ?? '',
        unlocked: isDungeonUnlocked(d.id, level),
      }));
  }

  /**
   * Pošle postavu do dungeonu: ověří odemčení, snapshotne bojový profil
   * (base + gear + talenty), předpočítá délku boje a založí idle aktivitu typu
   * `dungeon`. Combat se dopočítá deterministicky při claimu (jako questy).
   */
  async enter(accountId: string, characterId: string, dungeonId: string): Promise<DungeonLogView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    if (!isDungeonId(dungeonId)) throw new BadRequestException('Unknown dungeon');
    const dungeon = DUNGEONS[dungeonId]!;

    const level = levelFromXp(character.totalXp);
    if (!isDungeonUnlocked(dungeonId, level)) {
      throw new BadRequestException(`Dungeon requires level ${dungeon.requiredLevel}`);
    }

    const existing = await this.activities.findByCharacter(characterId);
    if (existing) throw new ConflictException('Character already has an active activity');

    const player = await this.buildPlayer(character, level);

    const startAt = new Date();
    const seed = seedFromString(`${characterId}:${dungeonId}:${startAt.getTime()}`);
    const enemies = dungeon.encounters.map((e) => buildEnemyActor(e));
    const result = simulateDungeonRun(player, enemies, seed);

    const params: DungeonActivityParams = { dungeonId, player };
    const row = await this.activities.create({
      characterId,
      activityType: 'dungeon',
      params,
      startAt,
      durationSec: result.durationSec,
      seed,
    });

    await this.scheduler.schedule(row.id, characterId, result.durationSec * 1000);
    return this.toLogView(row, Date.now());
  }

  /** Živý combat log běžícího dungeon runu (události do uplynulého času). */
  async getCombatLog(accountId: string, characterId: string): Promise<DungeonLogView | null> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const row = await this.activities.findByCharacter(characterId);
    if (!row || row.activityType !== 'dungeon') return null;
    return this.toLogView(row, Date.now());
  }

  /** Sestaví bojový profil postavy ze snapshotu staty + gear + talentů. */
  private async buildPlayer(character: Character, level: number): Promise<CombatActor> {
    const primary = baseStatsFor(character.race as RaceId, character.class as ClassId, level);
    const equipment = await this.inventory.getEquipmentStats(character.id);
    const talentRows = await this.talents.listTalents(character.id);
    const allocations: Record<string, number> = {};
    for (const r of talentRows) allocations[r.talentId] = r.points;
    const talents = aggregateTalentEffects(character.class as ClassId, allocations);

    return deriveCombatProfile({
      name: character.name,
      level,
      klass: character.class as ClassId,
      primary,
      equipment,
      talents,
    });
  }

  private toLogView(row: CharacterActivity, now: number): DungeonLogView {
    const params = row.params as DungeonActivityParams;
    const dungeon = DUNGEONS[params.dungeonId]!;
    const state: ActivityState = {
      activityType: 'dungeon',
      params,
      startAt: row.startAt.getTime(),
      durationSec: row.durationSec,
      seed: row.seed,
    };
    const p = activityProgress(state, now);

    const enemies = dungeon.encounters.map((e) => buildEnemyActor(e));
    const result = simulateDungeonRun(params.player, enemies, row.seed);
    const visible = result.events.filter((e) => e.t <= p.elapsedSec);

    return {
      dungeonId: params.dungeonId,
      dungeonName: dungeon.name,
      startAt: row.startAt.toISOString(),
      durationSec: row.durationSec,
      progress: {
        elapsedSec: p.elapsedSec,
        remainingSec: p.remainingSec,
        progress: p.progress,
        completed: p.completed,
        finishesAt: new Date(p.finishesAt).toISOString(),
      },
      player: { name: params.player.name, maxHealth: params.player.maxHealth },
      enemies: dungeon.encounters.map((e) => ({ name: e.name, isBoss: e.isBoss ?? false })),
      events: visible,
      victory: p.completed ? result.victory : null,
      wipes: p.completed ? result.wipes : null,
    };
  }
}
