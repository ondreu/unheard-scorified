import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  aggregateTalentEffects,
  baseStatsFor,
  buildRaidBoss,
  computeRaidReward,
  defaultRaidComposition,
  deriveCombatProfile,
  deriveRaidActor,
  isRaidId,
  isRaidRole,
  isRaidUnlocked,
  isValidComposition,
  levelFromXp,
  lockoutIdForContent,
  RAID_ROLES,
  RAIDS,
  scaleBoss,
  seedFromString,
  simulateRaidRun,
  weeklyLockoutId,
  type ClassId,
  type CombatActor,
  type CombatEvent,
  type RaceId,
  type RaidActor,
  type RaidComposition,
  type RaidReward,
  type RaidRole,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryRepository } from '../inventory/inventory.repository';
import { LockoutRepository } from '../lockout/lockout.repository';
import { TalentRepository } from '../talent/talent.repository';
import { CompletedQuestRepository } from '../quest/quest.repository';
import { PushService } from '../push/push.service';
import type { Character, RaidRun } from '../db/schema';
import { RaidRepository } from './raid.repository';
import { RaidEventsRelay } from './raid.events';
import { RAID_QUEUE, type RaidQueue, type RaidQueueEntry } from './raid.matchmaking';

const RECENT_RUNS_LIMIT = 8;

export interface RaidListItem {
  id: string;
  name: string;
  description: string;
  requiredLevel: number;
  attunementQuests: string[];
  bossNames: string[];
  /** Povolené velikosti party (5/10/20); první = default. */
  sizes: number[];
  /** Default kompozice per velikost (UI předvyplní; hráč ji může upravit). */
  defaultComposition: Record<number, RaidComposition>;
  unlocked: boolean;
  /** Role, ve které postava čeká ve frontě (nebo null). */
  queuedRole: RaidRole | null;
  /** Raidy mají vždy weekly lockout (M8.6) — clear se počítá jednou týdně. */
  hasLockout: boolean;
  /** Postava už tento raid tento týden vyčistila (žádná další odměna). */
  lockedOut: boolean;
}

export interface RaidRewardView {
  xp: number;
  gold: number;
  items: string[];
}

export interface RaidRunView {
  runId: string;
  raidId: string;
  raidName: string;
  startAt: string;
  durationSec: number;
  progress: {
    elapsedSec: number;
    remainingSec: number;
    progress: number;
    completed: boolean;
    finishesAt: string;
  };
  party: { name: string; role: RaidRole; maxHealth: number }[];
  bosses: { name: string }[];
  events: CombatEvent[];
  /** null dokud se boj „neodehraje" (reveal dle času); pak true/false. */
  victory: boolean | null;
  /** Počet wipů (jen po dokončení; řídí snížení odměny). Null dokud běží. */
  wipes: number | null;
  /** Odměna postavy (perspektiva volajícího). */
  myReward: RaidRewardView | null;
  myRole: RaidRole | null;
  /** Vítězství proběhlo, ale odměna propadla weekly lockoutem (M8.6). */
  myLockedOut: boolean;
}

/** Reálný účastník runu (pro udělení odměn). */
export interface RaidParticipantInput {
  character: Character;
  role: RaidRole;
  initiator: boolean;
}

export interface RaidRunSummary {
  runId: string;
  raidId: string;
  raidName: string;
  role: RaidRole;
  victory: boolean;
  reward: RaidRewardView;
  createdAt: string;
}

/**
 * Raid (M8, MP PVE). Idle-first jako arena: hráč buď čeká ve frontě v dané roli
 * (k vytažení do cizí party), nebo raid sám spustí (`enter`) — chybějící role
 * doplní vytažením čekajících hráčů, zbytek NPC backfillem → raid jde vyřešit
 * i sólo. Combat recykluje engine z M5 (party vs boss). Realtime watch přes WS
 * (recykluje vrstvu z M7). Viz ADR 0011.
 */
@Injectable()
export class RaidService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly inventory: InventoryService,
    private readonly inventoryRepo: InventoryRepository,
    private readonly talents: TalentRepository,
    private readonly completed: CompletedQuestRepository,
    private readonly push: PushService,
    private readonly repo: RaidRepository,
    private readonly events: RaidEventsRelay,
    private readonly lockouts: LockoutRepository,
    @Inject(RAID_QUEUE) private readonly queue: RaidQueue,
  ) {}

  /** Seznam raidů s flagem unlocked (level + attunement) a stavem fronty. */
  async listRaids(accountId: string, characterId: string): Promise<RaidListItem[]> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const level = levelFromXp(character.totalXp);
    const completedIds = await this.completed.completedIds(characterId);
    const weekId = weeklyLockoutId(Date.now());
    const result: RaidListItem[] = [];
    for (const raid of Object.values(RAIDS).sort(
      (a, b) => a.attunement.requiredLevel - b.attunement.requiredLevel,
    )) {
      const queuedRole = await this.queue.queuedRole(raid.id, characterId);
      const defaultComposition: Record<number, RaidComposition> = {};
      for (const size of raid.sizes) defaultComposition[size] = defaultRaidComposition(size);
      const lockoutId = lockoutIdForContent('raid', raid.id);
      const lockedOut = lockoutId !== null && (await this.lockouts.isLocked(characterId, lockoutId, weekId));
      result.push({
        id: raid.id,
        name: raid.name,
        description: raid.description,
        requiredLevel: raid.attunement.requiredLevel,
        attunementQuests: raid.attunement.questAnyOf,
        bossNames: raid.bosses.map((b) => b.name),
        sizes: raid.sizes,
        defaultComposition,
        unlocked: isRaidUnlocked(raid.id, level, completedIds),
        queuedRole,
        hasLockout: lockoutId !== null,
        lockedOut,
      });
    }
    return result;
  }

  /** Zařadí postavu do fronty raidu v dané roli (čeká na vytažení do party). */
  async queueForRaid(
    accountId: string,
    characterId: string,
    raidId: string,
    role: string,
  ): Promise<{ queued: true; role: RaidRole }> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    if (!isRaidId(raidId)) throw new BadRequestException('Unknown raid');
    if (!isRaidRole(role)) throw new BadRequestException('Invalid role');

    const level = levelFromXp(character.totalXp);
    const completedIds = await this.completed.completedIds(characterId);
    if (!isRaidUnlocked(raidId, level, completedIds)) {
      throw new BadRequestException('Raid is not unlocked (level / attunement)');
    }

    const snapshot = await this.buildRaidActor(character, level, role);
    await this.queue.enqueue(raidId, {
      characterId,
      accountId,
      name: character.name,
      role,
      snapshot,
      queuedAt: Date.now(),
    });
    return { queued: true, role };
  }

  /** Opustí frontu raidu. */
  async leaveQueue(
    accountId: string,
    characterId: string,
    raidId: string,
  ): Promise<{ left: boolean }> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    if (!isRaidId(raidId)) throw new BadRequestException('Unknown raid');
    const wasQueued = await this.queue.isQueued(raidId, characterId);
    await this.queue.remove(raidId, characterId);
    return { left: wasQueued };
  }

  /**
   * Spustí raid: postava se zařadí v dané roli a okamžitě se sestaví party
   * (vytažení čekajících hráčů pro chybějící role + NPC backfill) a deterministicky
   * vyřeší. Odměny se udělí všem reálným účastníkům (offline soupeři dostanou push).
   */
  async enter(
    accountId: string,
    characterId: string,
    raidId: string,
    role: string,
    size?: number,
    composition?: RaidComposition,
  ): Promise<RaidRunView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    if (!isRaidId(raidId)) throw new BadRequestException('Unknown raid');
    if (!isRaidRole(role)) throw new BadRequestException('Invalid role');

    const level = levelFromXp(character.totalXp);
    const completedIds = await this.completed.completedIds(characterId);
    if (!isRaidUnlocked(raidId, level, completedIds)) {
      throw new BadRequestException('Raid is not unlocked (level / attunement)');
    }

    const raid = RAIDS[raidId]!;

    // Velikost: default = první povolená; jinak musí být v seznamu povolených.
    const chosenSize = size ?? raid.sizes[0]!;
    if (!raid.sizes.includes(chosenSize)) {
      throw new BadRequestException(`Raid size ${chosenSize} not allowed (${raid.sizes.join('/')})`);
    }

    // Kompozice: hráčem zvolená (validovaná) nebo default pro velikost.
    const comp = composition ?? defaultRaidComposition(chosenSize);
    if (!isValidComposition(comp, chosenSize, role)) {
      throw new BadRequestException(
        `Invalid composition: counts must be non-negative, sum to ${chosenSize}, and include your role`,
      );
    }

    // Vstupuji-li, opustím případnou frontu (nečekám, hraju teď).
    await this.queue.remove(raidId, characterId);

    const myActor = await this.buildRaidActor(character, level, role);
    const party: RaidActor[] = [myActor];
    const pulled: RaidQueueEntry[] = [];

    // Party se skládá JEN z reálných hráčů ve frontě (žádný NPC backfill).
    // Chybí-li dost hráčů role, party bude menší — boss se škáluje skutečnou
    // velikostí party (`finalizeRun` → `scaleBoss(party.length)`).
    const need: Record<RaidRole, number> = { tank: comp.tank, healer: comp.healer, dps: comp.dps };
    need[role] -= 1;

    for (const r of RAID_ROLES) {
      for (let i = 0; i < need[r]; i++) {
        const candidate = await this.queue.takeByRole(raidId, r, characterId);
        if (!candidate) break; // žádný další čekající hráč této role
        party.push(candidate.snapshot);
        pulled.push(candidate);
      }
    }

    // Reální účastníci: já (iniciátor) + vytažení z fronty.
    const real: RaidParticipantInput[] = [{ character, role, initiator: true }];
    for (const p of pulled) {
      const pc = await this.characters.findById(p.characterId);
      if (pc) real.push({ character: pc, role: p.role, initiator: false });
    }

    const { run, rewards } = await this.finalizeRun(raid, party, real, characterId);
    return this.toRunView(run, characterId, Date.now(), rewards.get(characterId) ?? null, role);
  }

  /**
   * Spustí raid s předem sestavenou **skupinou** (M9 group): leader (`members[0]`)
   * + členové. Gatuje attunement leaderovým levelem + questline. Sdílí
   * `finalizeRun` (stejná simulace/odměny/lockout). Vrací id runu.
   */
  async runForGroup(
    leader: Character,
    raidId: string,
    members: { character: Character; role: RaidRole }[],
  ): Promise<{ runId: string }> {
    if (!isRaidId(raidId)) throw new BadRequestException('Unknown raid');
    const level = levelFromXp(leader.totalXp);
    const completedIds = await this.completed.completedIds(leader.id);
    if (!isRaidUnlocked(raidId, level, completedIds)) {
      throw new BadRequestException('Raid is not unlocked (level / attunement)');
    }
    const raid = RAIDS[raidId]!;
    const party: RaidActor[] = [];
    const real: RaidParticipantInput[] = [];
    for (let i = 0; i < members.length; i++) {
      const m = members[i]!;
      party.push(await this.buildRaidActor(m.character, levelFromXp(m.character.totalXp), m.role));
      real.push({ character: m.character, role: m.role, initiator: i === 0 });
    }
    const { run } = await this.finalizeRun(raid, party, real, leader.id);
    return { runId: run.id };
  }

  /**
   * Sdílené dokončení raid runu (M8.5-B): odsimuluje předanou party, uloží run a
   * udělí odměny všem reálným účastníkům. Vrací run + mapu odměn per postava.
   * Volá `enter` (idle queue), group launch i lobby. Iniciátor seeduje běh.
   */
  async finalizeRun(
    raid: (typeof RAIDS)[keyof typeof RAIDS],
    party: RaidActor[],
    real: RaidParticipantInput[],
    initiatorCharacterId: string,
  ): Promise<{ run: RaidRun; rewards: Map<string, RaidReward> }> {
    const seed = seedFromString(`${raid.id}:${initiatorCharacterId}:${Date.now()}`);
    const bosses = raid.bosses.map((b) => scaleBoss(buildRaidBoss(b), party.length));
    const result = simulateRaidRun(party, bosses, seed);

    const run = await this.repo.createRun({
      contentType: 'raid',
      raidId: raid.id,
      party,
      seed,
      victory: result.victory ? 1 : 0,
      durationSec: result.durationSec,
    });

    const rewards = new Map<string, RaidReward>();
    for (const rp of real) {
      const reward = await this.grantParticipant(
        run.id,
        rp.character,
        rp.role,
        rp.initiator,
        raid.id,
        result.victory,
        result.wipes,
      );
      rewards.set(rp.character.id, reward);
      if (!rp.initiator) {
        this.events.raidResolved(run.id, raid.id, rp.character.id);
        await this.push.sendToAccount(rp.character.accountId, {
          title: 'Raid Complete!',
          body: `${rp.character.name}'s ${raid.name} ${result.victory ? 'was victorious' : 'wiped'}.`,
          characterId: rp.character.id,
        });
      }
    }

    return { run, rewards };
  }

  /** Detail/přehrání raid runu z perspektivy postavy (reveal dle času). */
  async getRun(accountId: string, characterId: string, runId: string): Promise<RaidRunView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const run = await this.repo.findRun(runId);
    if (!run || run.contentType !== 'raid') throw new NotFoundException('Raid run not found');
    const participants = await this.repo.listParticipants(runId);
    const mine = participants.find((p) => p.characterId === characterId);
    if (!mine) throw new ForbiddenException('Not a participant of this raid run');

    return this.toRunView(
      run,
      characterId,
      Date.now(),
      { xp: mine.rewardXp, gold: mine.rewardGold, items: mine.rewardItems },
      mine.role,
    );
  }

  /** Nedávné raid runy postavy. */
  async recentRuns(accountId: string, characterId: string): Promise<RaidRunSummary[]> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const rows = await this.repo.listRecentForCharacter(characterId, RECENT_RUNS_LIMIT, 'raid');
    return rows.map(({ run, participant }) => ({
      runId: run.id,
      raidId: run.raidId,
      raidName: RAIDS[run.raidId]?.name ?? run.raidId,
      role: participant.role,
      victory: run.victory === 1,
      reward: { xp: participant.rewardXp, gold: participant.rewardGold, items: participant.rewardItems },
      createdAt: run.createdAt.toISOString(),
    }));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async grantParticipant(
    runId: string,
    character: Character,
    role: RaidRole,
    initiator: boolean,
    raidId: string,
    victory: boolean,
    wipes: number,
  ): Promise<RaidReward> {
    const raid = RAIDS[raidId]!;
    const rewardSeed = seedFromString(`${runId}:${character.id}`);
    let reward = computeRaidReward(raid, victory, rewardSeed, wipes);

    // Weekly lockout (M8.6): první vítězný run obsahu v týdnu postavu zamkne;
    // další clear v témže UTC týdnu pak odměnu nedá (drží progresi / AH).
    if (victory) {
      const lockoutId = lockoutIdForContent('raid', raidId);
      if (lockoutId) {
        const weekId = weeklyLockoutId(Date.now());
        const acquired = await this.lockouts.acquire(character.id, lockoutId, weekId);
        if (!acquired) reward = { xp: 0, gold: 0, items: [] }; // už zamčeno tento týden
      }
    }

    await this.characters.addRewards(character.id, reward.xp, reward.gold);
    for (const itemId of reward.items) {
      await this.inventoryRepo.addItem(character.id, itemId);
    }
    await this.repo.addParticipant({
      raidRunId: runId,
      characterId: character.id,
      role,
      initiator: initiator ? 1 : 0,
      rewardXp: reward.xp,
      rewardGold: reward.gold,
      rewardItems: reward.items,
    });
    return reward;
  }

  /** Bojový profil postavy (jako dungeon/arena) převedený na RaidActor dle role. */
  async buildRaidActor(
    character: Character,
    level: number,
    role: RaidRole,
  ): Promise<RaidActor> {
    const base = await this.buildCombatProfile(character, level);
    return deriveRaidActor(base, role);
  }

  private async buildCombatProfile(character: Character, level: number): Promise<CombatActor> {
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

  private toRunView(
    run: RaidRun,
    viewerId: string,
    now: number,
    myReward: RaidReward | null,
    myRole: RaidRole | null,
  ): RaidRunView {
    const raid = RAIDS[run.raidId];
    const startMs = run.createdAt.getTime();
    const elapsedSec = Math.max(0, Math.floor((now - startMs) / 1000));
    const remainingSec = Math.max(0, run.durationSec - elapsedSec);
    const completed = now >= startMs + run.durationSec * 1000;
    const progress = run.durationSec <= 0 ? 1 : Math.min(1, elapsedSec / run.durationSec);

    // Bossy se škálují stejně jako při enter (dle velikosti party) → identický
    // deterministický timeline.
    const bosses = (raid?.bosses ?? []).map((b) => scaleBoss(buildRaidBoss(b), run.party.length));
    const result = simulateRaidRun(run.party, bosses, run.seed);
    const visible = result.events.filter((e) => e.t <= elapsedSec);

    // Lockout: vítězný run lockoutovaného obsahu s nulovou odměnou = propadlo
    // weekly lockoutem (M8.6). Odvozeno z uloženého výsledku + odměny (nezávisí
    // na reveal čase).
    const hasLockout = lockoutIdForContent('raid', run.raidId) !== null;
    const myLockedOut =
      hasLockout && run.victory === 1 && myReward !== null && myReward.xp === 0;

    return {
      runId: run.id,
      raidId: run.raidId,
      raidName: raid?.name ?? run.raidId,
      startAt: run.createdAt.toISOString(),
      durationSec: run.durationSec,
      progress: {
        elapsedSec,
        remainingSec,
        progress,
        completed,
        finishesAt: new Date(startMs + run.durationSec * 1000).toISOString(),
      },
      party: run.party.map((a) => ({
        name: a.name,
        role: a.role,
        maxHealth: a.maxHealth,
      })),
      bosses: (raid?.bosses ?? []).map((b) => ({ name: b.name })),
      events: visible,
      victory: completed ? run.victory === 1 : null,
      wipes: completed ? result.wipes : null,
      myReward: myReward ? { xp: myReward.xp, gold: myReward.gold, items: myReward.items } : null,
      myRole,
      myLockedOut,
    };
  }
}
