import type { ActiveCondition, BestiaryView, CharacterSheet } from '@game/shared';
export type { BestiaryView, BestiaryEntryView } from '@game/shared';
import { authReady, clearSession, currentSession, setSession, type Session } from './auth';

export interface CharacterView {
  id: string;
  name: string;
  race: string;
  class: string;
  background: string | null;
  backstory: string | null;
  gold: number;
  sheet: CharacterSheet;
}

export interface QuestView {
  id: string;
  name: string;
  description: string;
  zoneId: string;
  kind: string;
  requiredLevel: number;
  durationSec: number;
  baseXp: number;
  baseGold: number;
  /** Combat-objective quest (M12): souboj lze prohrát → odměna gatovaná vítězstvím. */
  combatObjective?: boolean;
}

export interface ActivityProgress {
  elapsedSec: number;
  remainingSec: number;
  progress: number;
  completed: boolean;
  finishesAt: string;
}

export interface ActivityView {
  id: string;
  activityType: string;
  title: string;
  startAt: string;
  durationSec: number;
  questId?: string;
  quest?: { id: string; name: string; zoneId: string; kind: string };
  progress: ActivityProgress;
}

export interface ProfessionGainView {
  id: string;
  name: string;
  skillBefore: number;
  skillAfter: number;
}

export interface ReputationGainView {
  factionId: string;
  name: string;
  gained: number;
  standing: number;
  tier: string;
  tierName: string;
}

export interface ClaimResult {
  reward: { xp: number; gold: number; items: string[] };
  levelBefore: number;
  levelAfter: number;
  leveledUp: boolean;
  levelsGained: number;
  character: CharacterView;
  /** Počet sekund, po které aktivita čekala na claim (offline progres). 0 = okamžitý claim. */
  offlineDurationSec: number;
  /** Itemy přidané do inventáře při claimu. */
  items: string[];
  /** Profession skill-up (jen u gather/craft). */
  profession?: ProfessionGainView;
  /** Reputační zisky (jen u gather/craft). */
  reputation?: ReputationGainView[];
  /** Příběhový log questu (M9): narativní beaty + auto-resolved combaty. */
  questLog?: QuestStepResult[];
  /** Combat-objective quest (M12) prohrán → žádná odměna, quest se nedokončil. */
  questFailed?: boolean;
}

/** Krok vygenerovaného příběhového logu questu (M9). */
export interface QuestStepResult {
  kind: 'narrative' | 'combat';
  text: string;
  enemyName?: string;
  events?: CombatEvent[];
  playerHpPct?: number;
  /** Combat-objective quest (M12): tenhle souboj postava prohrála. */
  defeated?: boolean;
}

export interface DungeonListItem {
  id: string;
  name: string;
  description: string;
  requiredLevel: number;
  recommendedLevel: number;
  encounterCount: number;
  bossName: string;
  sizes: number[];
  unlocked: boolean;
  /** Dungeon vyžaduje attunement questline (M9) nad rámec levelu. */
  requiresAttunement: boolean;
  /** Postava splnila attunement (nebo dungeon žádný nemá). */
  attuned: boolean;
  queuedRole: RaidRole | null;
  hasLockout: boolean;
  lockedOut: boolean;
}

export interface CombatEvent {
  t: number;
  type: string;
  message: string;
  source?: string;
  target?: string;
  amount?: number;
  crit?: boolean;
  ability?: string;
  targetHealthRemaining?: number;
}

export interface DungeonRunView {
  runId: string;
  dungeonId: string;
  dungeonName: string;
  size: number;
  startAt: string;
  durationSec: number;
  progress: ActivityProgress;
  party: { name: string; role: RaidRole; maxHealth: number }[];
  encounters: { name: string; isBoss: boolean }[];
  events: CombatEvent[];
  victory: boolean | null;
  wipes: number | null;
  myReward: { xp: number; gold: number; items: string[] } | null;
  myRole: RaidRole | null;
  /** Vítězství proběhlo, ale odměna propadla weekly lockoutem (M8.6). */
  myLockedOut: boolean;
  /** Reputace získaná za clear (M9 retrofit); 0 pokud žádná. */
  repGain: number;
  /** Frakce reputace (Explorers' Guild), nebo null když repGain = 0. */
  repFactionName: string | null;
}

export interface DungeonRunSummary {
  runId: string;
  dungeonId: string;
  dungeonName: string;
  role: RaidRole;
  victory: boolean;
  reward: { xp: number; gold: number; items: string[] };
  createdAt: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const doFetch = (token?: string): Promise<Response> =>
    fetch(`/api${path}`, {
      ...init,
      // Potřebné pro httpOnly refresh_token cookie (posílá se automaticky).
      credentials: 'include',
      headers: {
        // Content-Type jen s tělem — Fastify odmítá prázdné tělo s JSON content-type.
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });

  const sess = currentSession();
  let res = await doFetch(auth ? sess?.accessToken : undefined);

  // Jednorázový pokus o refresh při vypršení access tokenu.
  // Cookie se pošle automaticky (credentials: 'include') — nepotřebujeme refresh token v JS.
  if (res.status === 401 && auth) {
    try {
      const refreshed = await refreshSession();
      setSession(refreshed);
      res = await doFetch(refreshed.accessToken);
    } catch {
      clearSession();
    }
  }

  const body = await parse(res);
  if (!res.ok) {
    const message =
      (body as { message?: string | string[] })?.message?.toString() ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

export function register(username: string, password: string, email?: string): Promise<Session> {
  return request<Session>(
    '/auth/register',
    { method: 'POST', body: JSON.stringify({ username, password, email: email || undefined }) },
    false,
  );
}

export function login(username: string, password: string): Promise<Session> {
  return request<Session>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ username, password }) },
    false,
  );
}

/**
 * Single-flight refresh: paralelní 401 (dashboard posílá víc dotazů naráz)
 * sdílí JEDEN `/auth/refresh`. Bez toho by každý request rotoval token
 * samostatně → první smaže JTI, ostatní dostanou „revoked" → odhlášení.
 */
let inflightRefresh: Promise<Session> | null = null;

/** Obnoví session přes httpOnly cookie (nevyžaduje refresh token v JS). */
function refreshSession(): Promise<Session> {
  if (!inflightRefresh) {
    inflightRefresh = request<Session>(
      '/auth/refresh',
      { method: 'POST', body: JSON.stringify({}) },
      false,
    ).finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

/**
 * Pokus o obnovu session z refresh cookie při startu aplikace (root layout).
 * Session žije jen v paměti → po reloadu/reopenu tabu ji nutno rehydratovat,
 * jinak hra vypadá odhlášeně i s platnou 30denní cookie.
 */
export async function bootstrapSession(): Promise<void> {
  try {
    setSession(await refreshSession());
  } catch {
    clearSession();
  } finally {
    authReady.set(true);
  }
}

/** Odhlásí uživatele: revokuje refresh token na serveru + maže cookie. */
export async function logout(): Promise<void> {
  try {
    await request('/auth/logout', { method: 'POST', body: JSON.stringify({}) }, false);
  } finally {
    clearSession();
  }
}

export function listCharacters(): Promise<CharacterView[]> {
  return request<CharacterView[]>('/characters');
}

export function getCharacter(id: string): Promise<CharacterView> {
  return request<CharacterView>(`/characters/${id}`);
}

export function deleteCharacter(id: string): Promise<{ deleted: true }> {
  return request<{ deleted: true }>(`/characters/${id}`, { method: 'DELETE' });
}

export function createCharacter(input: {
  name: string;
  race: string;
  class: string;
  background?: string;
  abilityScores?: Record<string, number>;
  backstory?: string;
}): Promise<CharacterView> {
  return request<CharacterView>('/characters', { method: 'POST', body: JSON.stringify(input) });
}

export interface InspectItemView {
  slot: string;
  itemId: string;
  name: string;
  rarity: string;
  itemLevel: number;
  stats: Record<string, number>;
}

export interface InspectView {
  id: string;
  name: string;
  race: string;
  class: string;
  itemLevel: number;
  inGroup: boolean;
  guild: { name: string; rank: string } | null;
  background: string | null;
  backstory: string | null;
  sheet: CharacterView['sheet'];
  equipment: InspectItemView[];
}

/** Veřejný inspect cizí postavy (chat → klik na jméno): gear, ilvl, staty. */
export function inspectCharacter(targetCharacterId: string): Promise<InspectView> {
  return request<InspectView>(`/characters/${targetCharacterId}/inspect`);
}

export function listAvailableQuests(characterId: string): Promise<QuestView[]> {
  return request<QuestView[]>(`/characters/${characterId}/quests`);
}

export function getActivity(characterId: string): Promise<ActivityView | null> {
  return request<ActivityView | null>(`/characters/${characterId}/activity`);
}

export function startActivity(characterId: string, questId: string): Promise<ActivityView> {
  return request<ActivityView>(`/characters/${characterId}/activity`, {
    method: 'POST',
    body: JSON.stringify({ activityType: 'quest', questId }),
  });
}

/** Spustí generický „Gone Questing" (hráč volí jen délku; level flexuje s ním). */
export function startQuesting(characterId: string, durationSec: number): Promise<ActivityView> {
  return request<ActivityView>(`/characters/${characterId}/activity`, {
    method: 'POST',
    body: JSON.stringify({ activityType: 'grind', durationSec }),
  });
}

export function claimActivity(characterId: string): Promise<ClaimResult> {
  return request<ClaimResult>(`/characters/${characterId}/activity/claim`, { method: 'POST' });
}

export type RotationConditionType =
  | 'always'
  | 'enemy_hp_below'
  | 'enemy_hp_above'
  | 'self_hp_below';

export interface RotationRule {
  abilityId: string;
  enabled: boolean;
  conditionType: RotationConditionType;
  threshold?: number;
}

export interface RotationAbility {
  id: string;
  name: string;
  description: string;
  kind: string;
  cooldownSec: number;
}

export interface RotationView {
  abilities: RotationAbility[];
  rules: RotationRule[];
}

export function getRotation(characterId: string): Promise<RotationView> {
  return request<RotationView>(`/characters/${characterId}/rotation`);
}

export function setRotation(characterId: string, rules: RotationRule[]): Promise<RotationView> {
  return request<RotationView>(`/characters/${characterId}/rotation`, {
    method: 'PUT',
    body: JSON.stringify({ rules }),
  });
}

export interface DummyFightResult {
  events: CombatEvent[];
  durationSec: number;
}

/** Sandbox test uložené rotace proti trénovacímu terči (MIL) — bez party/soupeře. */
export function testRotationDummy(
  characterId: string,
  role: string,
  durationSec: number,
): Promise<DummyFightResult> {
  return request<DummyFightResult>(`/characters/${characterId}/rotation/test-dummy`, {
    method: 'POST',
    body: JSON.stringify({ role, durationSec }),
  });
}

export function listDungeons(characterId: string): Promise<DungeonListItem[]> {
  return request<DungeonListItem[]>(`/characters/${characterId}/dungeons`);
}

export function enterDungeon(
  characterId: string,
  dungeonId: string,
  size?: number,
  role?: RaidRole,
  composition?: RaidComposition,
): Promise<DungeonRunView> {
  return request<DungeonRunView>(`/characters/${characterId}/dungeons/${dungeonId}/enter`, {
    method: 'POST',
    body: JSON.stringify({ size, role, composition }),
  });
}

export function getDungeonRun(characterId: string, runId: string): Promise<DungeonRunView> {
  return request<DungeonRunView>(`/characters/${characterId}/dungeons/run/${runId}`);
}

export function recentDungeonRuns(characterId: string): Promise<DungeonRunSummary[]> {
  return request<DungeonRunSummary[]>(`/characters/${characterId}/dungeons/runs`);
}

export function queueDungeon(
  characterId: string,
  dungeonId: string,
  role: RaidRole,
): Promise<{ queued: true; role: RaidRole }> {
  return request<{ queued: true; role: RaidRole }>(
    `/characters/${characterId}/dungeons/${dungeonId}/queue`,
    { method: 'POST', body: JSON.stringify({ role }) },
  );
}

export function leaveDungeonQueue(
  characterId: string,
  dungeonId: string,
): Promise<{ left: boolean }> {
  return request<{ left: boolean }>(`/characters/${characterId}/dungeons/${dungeonId}/leave`, {
    method: 'POST',
  });
}

// ── Tahový (solo) dungeon (dungeon overhaul Slice 2, ADR 0037) ────────────────

export interface DungeonTurnAbilityView {
  id: string;
  name: string;
  description: string;
  kind: string;
  cooldownSec: number;
  cooldownRemaining: number;
  ready: boolean;
  spellTier: number;
  outOfSlots: boolean;
  kiCost: number;
  outOfKi: boolean;
  /** D&D akční slot (ADR 0042) — 'action' (default) / 'bonus' (Healing Word). */
  actionCost: 'action' | 'bonus';
  /** Kostky/slot tier nad `spellTier` (Upcast — volba slotu). 0 = neupcastovatelné. */
  upcastPerSlot: number;
}

export interface DungeonTurnEnemyView {
  idx: number;
  name: string;
  isBoss: boolean;
  maxHealth: number;
  currentHealth: number;
  conditions: ActiveCondition[];
}

export interface DungeonTurnAllyView {
  name: string;
  role: 'tank' | 'healer' | 'dps';
  maxHealth: number;
  currentHealth: number;
  absorb: number;
  conditions: ActiveCondition[];
}

export interface DungeonTurnRunView {
  runId: string;
  dungeonId: string;
  dungeonName: string;
  status: 'in_combat' | 'cleared' | 'dead';
  encounterIndex: number;
  encounterCount: number;
  encountersCleared: number;
  size: number;
  playerRole: 'tank' | 'healer' | 'dps';
  player: {
    name: string;
    maxHealth: number;
    currentHealth: number;
    absorb: number;
    mitigationTurns: number;
    spellSlots: Record<number, number>;
    maxSpellSlots: Record<number, number>;
    kiPoints: number;
    maxKiPoints: number;
    rageCharges: number;
    maxRageCharges: number;
    raging: boolean;
    conditions: ActiveCondition[];
  };
  allies: DungeonTurnAllyView[];
  enemies: DungeonTurnEnemyView[];
  abilities: DungeonTurnAbilityView[];
  events: CombatEvent[];
  reward: { xp: number; gold: number; items: string[] } | null;
  myLockedOut: boolean;
}

export function enterDungeonTurn(characterId: string, dungeonId: string): Promise<DungeonTurnRunView> {
  return request<DungeonTurnRunView>(`/characters/${characterId}/dungeons/${dungeonId}/turn/enter`, {
    method: 'POST',
  });
}

export function enterDungeonTurnGroup(
  characterId: string,
  dungeonId: string,
  role: 'tank' | 'healer' | 'dps',
): Promise<DungeonTurnRunView> {
  return request<DungeonTurnRunView>(`/characters/${characterId}/dungeons/${dungeonId}/turn/enter-group`, {
    method: 'POST',
    body: JSON.stringify({ role, size: 3 }),
  });
}

export function getDungeonTurnRun(characterId: string, runId: string): Promise<DungeonTurnRunView> {
  return request<DungeonTurnRunView>(`/characters/${characterId}/dungeons/turn/run/${runId}`);
}

export function actDungeonTurn(
  characterId: string,
  runId: string,
  abilityId: string,
  targetId: number,
  bonusAbilityId?: string,
  castTier?: number,
): Promise<DungeonTurnRunView> {
  return request<DungeonTurnRunView>(`/characters/${characterId}/dungeons/turn/run/${runId}/act`, {
    method: 'POST',
    body: JSON.stringify({ abilityId, targetId, bonusAbilityId, castTier }),
  });
}

export function abandonDungeonTurn(characterId: string, runId: string): Promise<DungeonTurnRunView> {
  return request<DungeonTurnRunView>(`/characters/${characterId}/dungeons/turn/run/${runId}/abandon`, {
    method: 'POST',
  });
}

export interface DungeonTurnRunSummary {
  runId: string;
  dungeonId: string;
  dungeonName: string;
  status: 'in_combat' | 'cleared' | 'dead';
  reward: { xp: number; gold: number; items: string[] };
  createdAt: string;
}

export function getDungeonTurnRuns(characterId: string): Promise<DungeonTurnRunSummary[]> {
  return request<DungeonTurnRunSummary[]>(`/characters/${characterId}/dungeons/turn/runs`);
}

// ── Živé MP tahové sezení (ADR 0038, Slice 4) ──────────────────────────────────

export interface DungeonPartyMemberView {
  slot: number;
  name: string;
  role: 'tank' | 'healer' | 'dps';
  isAi: boolean;
  isYou: boolean;
  currentHealth: number;
  maxHealth: number;
  absorb: number;
  submitted: boolean;
  conditions: ActiveCondition[];
}

export interface DungeonPartyRunView {
  runId: string;
  dungeonId: string;
  dungeonName: string;
  status: 'in_combat' | 'cleared' | 'wiped';
  size: number;
  encounterIndex: number;
  encounterCount: number;
  encountersCleared: number;
  roundReady: boolean;
  roundDeadline: number | null;
  members: DungeonPartyMemberView[];
  enemies: DungeonTurnEnemyView[];
  you: {
    slot: number;
    role: 'tank' | 'healer' | 'dps';
    currentHealth: number;
    maxHealth: number;
    absorb: number;
    submitted: boolean;
    spellSlots: Record<number, number>;
    maxSpellSlots: Record<number, number>;
    kiPoints: number;
    maxKiPoints: number;
    abilities: DungeonTurnAbilityView[];
  } | null;
  events: CombatEvent[];
  reward: { xp: number; gold: number; items: string[] } | null;
  myLockedOut: boolean;
}

export function launchDungeonParty(characterId: string, dungeonId: string): Promise<DungeonPartyRunView> {
  return request<DungeonPartyRunView>(`/characters/${characterId}/dungeons/${dungeonId}/party/launch`, {
    method: 'POST',
  });
}

export function getDungeonPartyRun(characterId: string, runId: string): Promise<DungeonPartyRunView> {
  return request<DungeonPartyRunView>(`/characters/${characterId}/dungeons/party/run/${runId}`);
}

export function submitDungeonParty(
  characterId: string,
  runId: string,
  abilityId: string,
  targetId: number,
  bonusAbilityId?: string,
  castTier?: number,
): Promise<DungeonPartyRunView> {
  return request<DungeonPartyRunView>(`/characters/${characterId}/dungeons/party/run/${runId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ abilityId, targetId, bonusAbilityId, castTier }),
  });
}

export function abandonDungeonParty(characterId: string, runId: string): Promise<DungeonPartyRunView> {
  return request<DungeonPartyRunView>(`/characters/${characterId}/dungeons/party/run/${runId}/abandon`, {
    method: 'POST',
  });
}

export interface ProfessionSkillView {
  id: string;
  name: string;
  kind: 'gathering' | 'crafting';
  skill: number;
  maxSkill: number;
  factionId: string;
}

export interface ReputationView {
  factionId: string;
  name: string;
  standing: number;
  tier: string;
  tierName: string;
  currentMin: number;
  nextMin: number | null;
}

export interface MaterialStackView {
  itemId: string;
  name: string;
  kind: 'material' | 'consumable';
  rarity: string;
  quantity: number;
}

export interface GatheringNodeView {
  id: string;
  professionId: string;
  name: string;
  description: string;
  requiredSkill: number;
  durationSec: number;
  baseXp: number;
  repReward: number;
  skill: number;
  unlocked: boolean;
}

export interface RecipeInputView {
  materialId: string;
  name: string;
  quantity: number;
  have: number;
}

export interface RecipeView {
  id: string;
  professionId: string;
  name: string;
  description: string;
  requiredSkill: number;
  durationSec: number;
  baseXp: number;
  repReward: number;
  skill: number;
  inputs: RecipeInputView[];
  output: { itemId: string; name: string; quantity: number };
  requiredReputation?: { factionId: string; factionName: string; tier: string; tierName: string; met: boolean };
  unlocked: boolean;
  craftable: boolean;
}

export interface ProfessionPanel {
  skills: ProfessionSkillView[];
  reputation: ReputationView[];
  materials: MaterialStackView[];
  gathering: GatheringNodeView[];
  recipes: RecipeView[];
}

export function getProfessions(characterId: string): Promise<ProfessionPanel> {
  return request<ProfessionPanel>(`/characters/${characterId}/professions`);
}

export function startGather(characterId: string, nodeId: string): Promise<ProfessionPanel> {
  return request<ProfessionPanel>(`/characters/${characterId}/professions/gather/${nodeId}`, {
    method: 'POST',
  });
}

export function startCraft(characterId: string, recipeId: string): Promise<ProfessionPanel> {
  return request<ProfessionPanel>(`/characters/${characterId}/professions/craft/${recipeId}`, {
    method: 'POST',
  });
}

// ── Arena (M7, PVP) ──────────────────────────────────────────────────────────

export interface LeaderboardRow {
  rank: number;
  characterId: string;
  name: string;
  rating: number;
  tier: string;
  tierName: string;
  isSelf: boolean;
}

export interface MatchSummary {
  matchId: string;
  opponentName: string;
  won: boolean;
  ratingDelta: number;
  ratingAfter: number;
  createdAt: string;
}

export interface SeasonRewardView {
  seasonId: string;
  seasonName: string;
  finalRating: number;
  finalTier: string;
  rewardGold: number;
}

export interface ArenaView {
  season: { id: string; name: string; endsAt: string };
  bracket: string;
  minLevel: number;
  eligible: boolean;
  rating: number;
  tier: string;
  tierName: string;
  nextTierAt: number | null;
  wins: number;
  losses: number;
  rank: number | null;
  queued: boolean;
  leaderboard: LeaderboardRow[];
  recentMatches: MatchSummary[];
  newSeasonRewards: SeasonRewardView[];
}

export interface QueueResult {
  status: 'queued' | 'matched';
  matchId?: string;
  arena: ArenaView;
}

export interface ArenaMatchView {
  matchId: string;
  seasonId: string;
  bracket: string;
  startAt: string;
  durationSec: number;
  progress: ActivityProgress;
  me: { characterId: string; name: string; maxHealth: number };
  opponent: { characterId: string; name: string; maxHealth: number };
  events: CombatEvent[];
  outcome: 'win' | 'loss' | null;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
}

export function getArena(characterId: string): Promise<ArenaView> {
  return request<ArenaView>(`/characters/${characterId}/arena`);
}

export function queueArena(characterId: string): Promise<QueueResult> {
  return request<QueueResult>(`/characters/${characterId}/arena/queue`, { method: 'POST' });
}

export function leaveArenaQueue(characterId: string): Promise<{ left: boolean }> {
  return request<{ left: boolean }>(`/characters/${characterId}/arena/leave`, { method: 'POST' });
}

export function getArenaMatch(characterId: string, matchId: string): Promise<ArenaMatchView> {
  return request<ArenaMatchView>(`/characters/${characterId}/arena/match/${matchId}`);
}

// ── Group PVE roles (sdílené dungeon + group; raidy vyříznuty — ADR 0033) ─────

export type RaidRole = 'tank' | 'healer' | 'dps';

export interface RaidComposition {
  tank: number;
  healer: number;
  dps: number;
}

// ── Auction House (M8, economy) ──────────────────────────────────────────────

export interface AuctionView {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  sellerName: string;
  startBid: number;
  buyout: number | null;
  currentBid: number | null;
  minBid: number;
  deposit: number;
  status: 'active' | 'sold' | 'expired' | 'cancelled';
  endsAt: string;
  timeLeftSec: number;
  isMine: boolean;
  isMyBid: boolean;
  /** Seedovaný NPC listing (živá aukce) — jen buyout, nelze přihazovat. */
  isNpc: boolean;
}

export interface InventoryItemView {
  itemId: string;
  quantity: number;
  item?: { name?: string };
}

export function listInventory(characterId: string): Promise<InventoryItemView[]> {
  return request<InventoryItemView[]>(`/characters/${characterId}/inventory`);
}

export interface BankItemView {
  itemId: string;
  name: string;
  quantity: number;
}

export interface BankView {
  items: BankItemView[];
  usedSlots: number;
  capacity: number;
}

export function getBank(characterId: string): Promise<BankView> {
  return request<BankView>(`/characters/${characterId}/bank`);
}

export function depositToBank(
  characterId: string,
  itemId: string,
  quantity: number,
): Promise<BankView> {
  return request<BankView>(`/characters/${characterId}/bank/deposit`, {
    method: 'POST',
    body: JSON.stringify({ itemId, quantity }),
  });
}

export function withdrawFromBank(
  characterId: string,
  itemId: string,
  quantity: number,
): Promise<BankView> {
  return request<BankView>(`/characters/${characterId}/bank/withdraw`, {
    method: 'POST',
    body: JSON.stringify({ itemId, quantity }),
  });
}

export function browseAuctions(characterId: string, itemId?: string): Promise<AuctionView[]> {
  const q = itemId ? `?itemId=${encodeURIComponent(itemId)}` : '';
  return request<AuctionView[]>(`/characters/${characterId}/auctions${q}`);
}

export function myAuctions(characterId: string): Promise<AuctionView[]> {
  return request<AuctionView[]>(`/characters/${characterId}/auctions/mine`);
}

export function createAuction(
  characterId: string,
  input: {
    itemId: string;
    quantity: number;
    startBid: number;
    buyout?: number | null;
    duration: 'short' | 'medium' | 'long';
  },
): Promise<AuctionView> {
  return request<AuctionView>(`/characters/${characterId}/auctions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function bidAuction(
  characterId: string,
  auctionId: string,
  amount: number,
): Promise<AuctionView> {
  return request<AuctionView>(`/characters/${characterId}/auctions/${auctionId}/bid`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export function buyoutAuction(characterId: string, auctionId: string): Promise<AuctionView> {
  return request<AuctionView>(`/characters/${characterId}/auctions/${auctionId}/buyout`, {
    method: 'POST',
  });
}

export function cancelAuction(characterId: string, auctionId: string): Promise<AuctionView> {
  return request<AuctionView>(`/characters/${characterId}/auctions/${auctionId}/cancel`, {
    method: 'POST',
  });
}

// Mail (M9): offline messages + item/gold attachments.

export interface MailItemView {
  itemId: string;
  name: string;
  quantity: number;
}

export interface MailView {
  id: string;
  fromName: string;
  fromCharacterId: string | null;
  subject: string;
  body: string;
  gold: number;
  items: MailItemView[];
  read: boolean;
  claimed: boolean;
  hasAttachments: boolean;
  sentAt: string;
}

export interface Mailbox {
  mail: MailView[];
  unread: number;
}

export function getMailbox(characterId: string): Promise<Mailbox> {
  return request<Mailbox>(`/characters/${characterId}/mail`);
}

export function sendMail(
  characterId: string,
  input: {
    toName: string;
    subject: string;
    body?: string;
    items?: { itemId: string; quantity: number }[];
    gold?: number;
  },
): Promise<{ sent: true }> {
  return request<{ sent: true }>(`/characters/${characterId}/mail`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function readMail(characterId: string, mailId: string): Promise<Mailbox> {
  return request<Mailbox>(`/characters/${characterId}/mail/${mailId}/read`, { method: 'POST' });
}

export function claimMail(characterId: string, mailId: string): Promise<Mailbox> {
  return request<Mailbox>(`/characters/${characterId}/mail/${mailId}/claim`, { method: 'POST' });
}

export function deleteMail(characterId: string, mailId: string): Promise<Mailbox> {
  return request<Mailbox>(`/characters/${characterId}/mail/${mailId}`, { method: 'DELETE' });
}

export function getVapidPublicKey(): Promise<{ key: string }> {
  return request<{ key: string }>('/push/vapid-public-key', {}, false);
}

export function subscribePushApi(payload: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<void> {
  return request<void>('/push/subscribe', { method: 'POST', body: JSON.stringify(payload) });
}

export function unsubscribePushApi(endpoint: string): Promise<void> {
  return request<void>('/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint }) });
}

// Social (M9): friends + chat.

export interface FriendView {
  characterId: string;
  name: string;
  level: number;
  race: string;
  class: string;
  online: boolean;
  since: string;
}

export interface FriendRequestView {
  requestId: string;
  characterId: string;
  name: string;
  level: number;
  race: string;
  class: string;
  sentAt: string;
}

export interface SocialView {
  friends: FriendView[];
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
}

export interface FriendActionResult {
  accepted: boolean;
  social: SocialView;
}

export function getSocial(characterId: string): Promise<SocialView> {
  return request<SocialView>(`/characters/${characterId}/social`);
}

export function sendFriendRequest(characterId: string, name: string): Promise<FriendActionResult> {
  return request<FriendActionResult>(`/characters/${characterId}/social/requests`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function respondFriendRequest(
  characterId: string,
  requestId: string,
  accept: boolean,
): Promise<SocialView> {
  return request<SocialView>(
    `/characters/${characterId}/social/requests/${requestId}/respond`,
    { method: 'POST', body: JSON.stringify({ accept }) },
  );
}

export function removeFriend(characterId: string, otherCharacterId: string): Promise<SocialView> {
  return request<SocialView>(`/characters/${characterId}/social/friends/${otherCharacterId}`, {
    method: 'DELETE',
  });
}

export interface ChatMessageView {
  id: string;
  channel: string;
  scopeId: string | null;
  characterId: string | null;
  name: string;
  body: string;
  at: string;
}

/** REST fallback k WS chatu (historie kanálu). `channel` default `global`. */
export function getChatHistory(
  characterId: string,
  channel: 'global' | 'guild' = 'global',
): Promise<ChatMessageView[]> {
  return request<ChatMessageView[]>(
    `/characters/${characterId}/chat?channel=${encodeURIComponent(channel)}`,
  );
}

export function sendChatMessage(
  characterId: string,
  body: string,
  channel: 'global' | 'guild' = 'global',
): Promise<ChatMessageView> {
  return request<ChatMessageView>(`/characters/${characterId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ body, channel }),
  });
}

// Activity history — výsledky dokončených aktivit (quest/dungeon/raid/arena).

export interface HistoryEntry {
  id: string;
  kind: string;
  title: string;
  detail: string;
  outcome: string | null;
  createdAt: string;
}

export function getHistory(characterId: string): Promise<HistoryEntry[]> {
  return request<HistoryEntry[]>(`/characters/${characterId}/history`);
}

// Guild (M9)

export type GuildRankName = 'member' | 'officer' | 'leader';

export interface GuildMemberView {
  characterId: string;
  name: string;
  level: number;
  race: string;
  class: string;
  rank: GuildRankName;
  joinedAt: string;
}

export interface GuildView {
  id: string;
  name: string;
  leaderCharacterId: string;
  memberCount: number;
  myRank: GuildRankName;
  /** Zpráva dne (MOTD), nebo null. */
  motd: string | null;
  members: GuildMemberView[];
}

export interface GuildInviteView {
  inviteId: string;
  guildId: string;
  guildName: string;
  invitedBy: string | null;
  sentAt: string;
}

export interface CharterSignatureView {
  characterId: string;
  name: string;
  signed: boolean;
}

export interface GuildCharterView {
  id: string;
  name: string;
  cost: number;
  signedCount: number;
  required: number;
  canFound: boolean;
  signatures: CharterSignatureView[];
}

export interface CharterInviteView {
  charterId: string;
  guildName: string;
  founderName: string | null;
}

export interface GuildState {
  guild: GuildView | null;
  invites: GuildInviteView[];
  charter: GuildCharterView | null;
  charterInvites: CharterInviteView[];
}

export function getGuild(characterId: string): Promise<GuildState> {
  return request<GuildState>(`/characters/${characterId}/guild`);
}

export function createGuild(characterId: string, name: string): Promise<GuildState> {
  return request<GuildState>(`/characters/${characterId}/guild`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

// Guild charter (vanilla-WoW style founding: gold cost + signatures).

export function startGuildCharter(characterId: string, name: string): Promise<GuildState> {
  return request<GuildState>(`/characters/${characterId}/guild/charter`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function inviteGuildCharterSign(characterId: string, name: string): Promise<GuildState> {
  return request<GuildState>(`/characters/${characterId}/guild/charter/invite`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function respondGuildCharterSign(
  characterId: string,
  charterId: string,
  accept: boolean,
): Promise<GuildState> {
  return request<GuildState>(`/characters/${characterId}/guild/charter/sign`, {
    method: 'POST',
    body: JSON.stringify({ charterId, accept }),
  });
}

export function foundGuildFromCharter(characterId: string): Promise<GuildState> {
  return request<GuildState>(`/characters/${characterId}/guild/charter/found`, { method: 'POST' });
}

export function cancelGuildCharter(characterId: string): Promise<GuildState> {
  return request<GuildState>(`/characters/${characterId}/guild/charter`, { method: 'DELETE' });
}

export function inviteToGuild(characterId: string, name: string): Promise<GuildState> {
  return request<GuildState>(`/characters/${characterId}/guild/invites`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function respondGuildInvite(
  characterId: string,
  inviteId: string,
  accept: boolean,
): Promise<GuildState> {
  return request<GuildState>(`/characters/${characterId}/guild/invites/${inviteId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ accept }),
  });
}

export function leaveGuild(characterId: string): Promise<GuildState> {
  return request<GuildState>(`/characters/${characterId}/guild/leave`, { method: 'POST' });
}

export function disbandGuild(characterId: string): Promise<GuildState> {
  return request<GuildState>(`/characters/${characterId}/guild`, { method: 'DELETE' });
}

export function kickGuildMember(
  characterId: string,
  targetCharacterId: string,
): Promise<GuildState> {
  return request<GuildState>(`/characters/${characterId}/guild/members/${targetCharacterId}`, {
    method: 'DELETE',
  });
}

export function setGuildRank(
  characterId: string,
  targetCharacterId: string,
  rank: 'member' | 'officer',
): Promise<GuildState> {
  return request<GuildState>(
    `/characters/${characterId}/guild/members/${targetCharacterId}/rank`,
    { method: 'POST', body: JSON.stringify({ rank }) },
  );
}

/** Nastaví zprávu dne (MOTD) guildy (officer+; prázdný text ji zruší). */
export function setGuildMotd(characterId: string, motd: string): Promise<GuildState> {
  return request<GuildState>(`/characters/${characterId}/guild/motd`, {
    method: 'POST',
    body: JSON.stringify({ motd }),
  });
}

// Persistent group / party (M9, ADR 0022) — one formation system for dungeon/raid/arena

export type GroupActivityType = 'dungeon' | 'raid' | 'arena';

export interface GroupMemberView {
  characterId: string;
  name: string;
  level: number;
  race: string;
  class: string;
  role: RaidRole;
  status: 'invited' | 'requested' | 'joined';
  isLeader: boolean;
}

export interface GroupView {
  id: string;
  leaderCharacterId: string;
  iAmLeader: boolean;
  members: GroupMemberView[];
  joinedCount: number;
}

export interface GroupInviteView {
  groupId: string;
  leaderName: string;
  role: RaidRole;
}

export interface GroupState {
  group: GroupView | null;
  invites: GroupInviteView[];
}

export type GroupLaunchResult =
  | { activityType: 'dungeon'; runId: string }
  | { activityType: 'arena'; bracket: '1v1' | '2v2' | '3v3' | '5v5'; status: 'queued' | 'matched'; matchId?: string };

export function getGroup(characterId: string): Promise<GroupState> {
  return request<GroupState>(`/characters/${characterId}/group`);
}

export function createGroup(characterId: string, role: RaidRole): Promise<GroupState> {
  return request<GroupState>(`/characters/${characterId}/group/create`, {
    method: 'POST',
    body: JSON.stringify({ role }),
  });
}

export function inviteToGroup(
  characterId: string,
  targetName: string,
  role: RaidRole,
): Promise<GroupState> {
  return request<GroupState>(`/characters/${characterId}/group/invite`, {
    method: 'POST',
    body: JSON.stringify({ targetName, role }),
  });
}

export function respondGroupInvite(
  characterId: string,
  groupId: string,
  accept: boolean,
  role?: RaidRole,
): Promise<GroupState> {
  return request<GroupState>(`/characters/${characterId}/group/invite/respond`, {
    method: 'POST',
    body: JSON.stringify({ groupId, accept, role }),
  });
}

/** Požádá o vstup do skupiny jiného hráče (když sám skupinu nemám a cíl ano). */
export function requestGroupJoin(characterId: string, targetName: string): Promise<GroupState> {
  return request<GroupState>(`/characters/${characterId}/group/request`, {
    method: 'POST',
    body: JSON.stringify({ targetName }),
  });
}

/** Leader schválí/odmítne žádost o vstup do skupiny. */
export function respondGroupJoinRequest(
  characterId: string,
  requesterCharacterId: string,
  accept: boolean,
): Promise<GroupState> {
  return request<GroupState>(`/characters/${characterId}/group/request/respond`, {
    method: 'POST',
    body: JSON.stringify({ requesterCharacterId, accept }),
  });
}

export function setGroupRole(characterId: string, role: RaidRole): Promise<GroupState> {
  return request<GroupState>(`/characters/${characterId}/group/role`, {
    method: 'POST',
    body: JSON.stringify({ role }),
  });
}

export function leaveGroup(characterId: string): Promise<GroupState> {
  return request<GroupState>(`/characters/${characterId}/group/leave`, { method: 'POST' });
}

export function kickGroupMember(characterId: string, targetCharacterId: string): Promise<GroupState> {
  return request<GroupState>(`/characters/${characterId}/group/kick`, {
    method: 'POST',
    body: JSON.stringify({ targetCharacterId }),
  });
}

export function promoteGroupMember(characterId: string, targetCharacterId: string): Promise<GroupState> {
  return request<GroupState>(`/characters/${characterId}/group/promote`, {
    method: 'POST',
    body: JSON.stringify({ targetCharacterId }),
  });
}

export function disbandGroup(characterId: string): Promise<GroupState> {
  return request<GroupState>(`/characters/${characterId}/group/disband`, { method: 'POST' });
}

export function launchGroup(
  characterId: string,
  activityType: GroupActivityType,
  contentId?: string,
): Promise<GroupLaunchResult> {
  return request<GroupLaunchResult>(`/characters/${characterId}/group/launch`, {
    method: 'POST',
    body: JSON.stringify({ activityType, contentId }),
  });
}

// P2P trade (M8.5-D)

export interface TradeOfferItem {
  itemId: string;
  name: string;
  quantity: number;
}

export interface TradeSideView {
  characterId: string;
  name: string;
  gold: number;
  confirmed: boolean;
  items: TradeOfferItem[];
}

export interface TradeView {
  id: string;
  status: string;
  mySide: 'initiator' | 'partner';
  me: TradeSideView;
  them: TradeSideView;
}

export interface TradeState {
  trade: TradeView | null;
}

export function getTrade(characterId: string): Promise<TradeState> {
  return request<TradeState>(`/characters/${characterId}/trade`);
}

export function startTrade(characterId: string, partnerName: string): Promise<TradeState> {
  return request<TradeState>(`/characters/${characterId}/trade`, {
    method: 'POST',
    body: JSON.stringify({ partnerName }),
  });
}

export function setTradeOffer(
  characterId: string,
  items: { itemId: string; quantity: number }[],
  gold: number,
): Promise<TradeState> {
  return request<TradeState>(`/characters/${characterId}/trade/offer`, {
    method: 'PUT',
    body: JSON.stringify({ items, gold }),
  });
}

export function confirmTrade(characterId: string): Promise<TradeState> {
  return request<TradeState>(`/characters/${characterId}/trade/confirm`, { method: 'POST' });
}

export function unconfirmTrade(characterId: string): Promise<TradeState> {
  return request<TradeState>(`/characters/${characterId}/trade/unconfirm`, { method: 'POST' });
}

export function cancelTrade(characterId: string): Promise<TradeState> {
  return request<TradeState>(`/characters/${characterId}/trade/cancel`, { method: 'POST' });
}

// Team arena (M8.5-C, 3v3/5v5)

export interface TeamBracketView {
  bracket: '2v2' | '3v3' | '5v5';
  teamSize: number;
  rating: number;
  tier: string;
  wins: number;
  losses: number;
  queued: boolean;
}

export interface TeamArenaView {
  eligible: boolean;
  minLevel: number;
  seasonId: string;
  brackets: TeamBracketView[];
}

export interface TeamQueueResult {
  status: 'queued' | 'matched';
  bracket: '2v2' | '3v3' | '5v5';
  matchId?: string;
}

export interface TeamMatchView {
  matchId: string;
  bracket: string;
  durationSec: number;
  progress: { elapsedSec: number; remainingSec: number; completed: boolean };
  myTeam: { name: string; maxHealth: number }[];
  enemyTeam: { name: string; maxHealth: number }[];
  events: CombatEvent[];
  outcome: 'win' | 'loss' | null;
}

export function getTeamArena(characterId: string): Promise<TeamArenaView> {
  return request<TeamArenaView>(`/characters/${characterId}/team-arena`);
}

export function leaveTeamQueue(
  characterId: string,
  bracket: '2v2' | '3v3' | '5v5',
): Promise<{ left: boolean }> {
  return request<{ left: boolean }>(`/characters/${characterId}/team-arena/leave`, {
    method: 'POST',
    body: JSON.stringify({ bracket }),
  });
}

export function getTeamMatch(characterId: string, matchId: string): Promise<TeamMatchView> {
  return request<TeamMatchView>(`/characters/${characterId}/team-arena/match/${matchId}`);
}

// Achievements (M9)

export interface AchievementView {
  id: string;
  name: string;
  description: string;
  metric: string;
  threshold: number;
  rewardGold: number;
  value: number;
  pct: number;
  completed: boolean;
  claimed: boolean;
  claimable: boolean;
}

export interface AchievementsView {
  achievements: AchievementView[];
  completedCount: number;
  total: number;
}

export interface AchievementClaimResult {
  achievementId: string;
  rewardGold: number;
  goldAfter: number;
}

export function getAchievements(characterId: string): Promise<AchievementsView> {
  return request<AchievementsView>(`/characters/${characterId}/achievements`);
}

export function getBestiary(characterId: string): Promise<BestiaryView> {
  return request<BestiaryView>(`/characters/${characterId}/bestiary`);
}

export function markBestiarySeen(characterId: string): Promise<BestiaryView> {
  return request<BestiaryView>(`/characters/${characterId}/bestiary/seen`, { method: 'POST' });
}

export function claimAchievement(
  characterId: string,
  achievementId: string,
): Promise<AchievementClaimResult> {
  return request<AchievementClaimResult>(
    `/characters/${characterId}/achievements/${achievementId}/claim`,
    { method: 'POST' },
  );
}

export interface GoalView {
  id: string;
  name: string;
  description: string;
  period: 'daily' | 'weekly';
  metric: string;
  target: number;
  rewardGold: number;
  value: number;
  pct: number;
  completed: boolean;
  claimed: boolean;
  claimable: boolean;
}

export interface GoalsView {
  daily: GoalView[];
  weekly: GoalView[];
  resetsAt: { daily: string; weekly: string };
}

export function getGoals(characterId: string): Promise<GoalsView> {
  return request<GoalsView>(`/characters/${characterId}/achievements/goals`);
}

export function claimGoal(
  characterId: string,
  goalId: string,
): Promise<{ goalId: string; rewardGold: number; goldAfter: number }> {
  return request<{ goalId: string; rewardGold: number; goldAfter: number }>(
    `/characters/${characterId}/achievements/goals/${goalId}/claim`,
    { method: 'POST' },
  );
}

// Dev tools — only available when NODE_ENV=development (backed by DevGuard on server).

export interface DevCharacterState {
  id: string;
  name: string;
  level: number;
  totalXp: number;
  gold: number;
}

export interface DevItemDef {
  id: string;
  name: string;
  slot: string;
  rarity: string;
  itemLevel: number;
}

export interface DevProfessionDef {
  id: string;
  name: string;
}

export interface MountView {
  id: string;
  name: string;
  description: string;
  tier: 'basic' | 'epic';
  requiredLevel: number;
  cost: number;
  speedBonus: number;
  owned: boolean;
  active: boolean;
  affordable: boolean;
  meetsLevel: boolean;
}

export interface MountsView {
  characterLevel: number;
  gold: number;
  speedBonus: number;
  activeMountId: string | null;
  mounts: MountView[];
}

export function listMounts(characterId: string): Promise<MountsView> {
  return request<MountsView>(`/characters/${characterId}/mounts`);
}

export function buyMount(characterId: string, mountId: string): Promise<MountsView> {
  return request<MountsView>(`/characters/${characterId}/mounts/${mountId}/buy`, {
    method: 'POST',
  });
}

export function selectMount(characterId: string, mountId: string): Promise<MountsView> {
  return request<MountsView>(`/characters/${characterId}/mounts/${mountId}/select`, {
    method: 'POST',
  });
}

// --- Bags & inventory capacity (M10) ---
export interface BagSlotView {
  slotIndex: number;
  bagId: string | null;
  name: string | null;
  slots: number;
}
export interface BagsView {
  slotCount: number;
  capacity: number;
  usedSlots: number;
  freeSlots: number;
  bags: BagSlotView[];
}

export function getBags(characterId: string): Promise<BagsView> {
  return request<BagsView>(`/characters/${characterId}/bags`);
}

export function equipBag(characterId: string, slotIndex: number, itemId: string): Promise<BagsView> {
  return request<BagsView>(`/characters/${characterId}/bags/${slotIndex}`, {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  });
}

export function unequipBag(characterId: string, slotIndex: number): Promise<BagsView> {
  return request<BagsView>(`/characters/${characterId}/bags/${slotIndex}`, { method: 'DELETE' });
}

// --- Vendor (M10) ---
export interface VendorStockView {
  itemId: string;
  name: string;
  price: number;
}
export interface VendorSellView {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}
export interface VendorView {
  gold: number;
  stock: VendorStockView[];
  sellable: VendorSellView[];
}

export function getVendor(characterId: string): Promise<VendorView> {
  return request<VendorView>(`/characters/${characterId}/vendor`);
}

export function vendorBuy(characterId: string, itemId: string, quantity = 1): Promise<VendorView> {
  return request<VendorView>(`/characters/${characterId}/vendor/buy/${itemId}`, {
    method: 'POST',
    body: JSON.stringify({ quantity }),
  });
}

export function vendorSell(characterId: string, itemId: string, quantity = 1): Promise<VendorView> {
  return request<VendorView>(`/characters/${characterId}/vendor/sell/${itemId}`, {
    method: 'POST',
    body: JSON.stringify({ quantity }),
  });
}

// --- Consumables (M10) ---
export interface ConsumableStackView {
  itemId: string;
  name: string;
  quantity: number;
  effect: string;
}
export interface ActiveBuffView {
  consumableId: string;
  name: string;
  stats: Record<string, number>;
  expiresAt: string;
}
export interface ConsumablesView {
  consumables: ConsumableStackView[];
  activeBuffs: ActiveBuffView[];
}

export function getConsumables(characterId: string): Promise<ConsumablesView> {
  return request<ConsumablesView>(`/characters/${characterId}/consumables`);
}

export function useConsumable(characterId: string, itemId: string): Promise<ConsumablesView> {
  return request<ConsumablesView>(`/characters/${characterId}/consumables/use/${itemId}`, {
    method: 'POST',
  });
}

export interface DevAccountView {
  id: string;
  username: string;
  email: string | null;
  bannedAt: string | null;
  createdAt: string;
  characterCount: number;
}

export interface DevQuestDef {
  id: string;
  name: string;
  zone: string;
}

export interface DevCharacterInspect {
  id: string;
  name: string;
  race: string;
  class: string;
  level: number;
  totalXp: number;
  gold: number;
  accountId: string;
  activity: { type: string; startAt: string; durationSec: number } | null;
  inventory: { itemId: string; name: string; quantity: number }[];
  equipment: { slot: string; itemId: string; name: string }[];
  professions: { professionId: string; skill: number }[];
  reputation: { factionId: string; factionName: string; standing: number; tier: string }[];
  arenaRatings: { bracket: string; seasonId: string; rating: number; wins: number; losses: number }[];
  guild: { id: string; name: string; rank: string } | null;
  lockouts: { lockoutId: string; weekId: string }[];
  achievements: { id: string; name: string; earnedAt: string }[];
}

export interface DevCharacterSearchResult {
  id: string;
  name: string;
  race: string;
  class: string;
  level: number;
  accountId: string;
}

function devRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const secret = typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem('dev_secret') ?? '') : '';
  const headers: Record<string, string> = {
    ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(secret ? { 'X-Dev-Secret': secret } : {}),
  };
  return fetch(`/api${path}`, { ...init, headers }).then(async (res) => {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body as { message?: string })?.message ?? `HTTP ${res.status}`);
    return body as T;
  });
}

export function devVerifyAuth(secret: string): Promise<{ ok: boolean }> {
  return devRequest('/dev/auth', { method: 'POST', body: JSON.stringify({ secret }) });
}

export function devGetState(characterId: string): Promise<DevCharacterState> {
  return devRequest(`/dev/characters/${characterId}/state`);
}

export function devListItems(characterId: string): Promise<DevItemDef[]> {
  return devRequest(`/dev/characters/${characterId}/items`);
}

export function devListProfessions(characterId: string): Promise<DevProfessionDef[]> {
  return devRequest(`/dev/characters/${characterId}/professions`);
}

export function devSetLevel(characterId: string, level: number): Promise<DevCharacterState> {
  return devRequest(`/dev/characters/${characterId}/set-level`, { method: 'POST', body: JSON.stringify({ level }) });
}

export function devAddGold(characterId: string, amount: number): Promise<DevCharacterState> {
  return devRequest(`/dev/characters/${characterId}/add-gold`, { method: 'POST', body: JSON.stringify({ amount }) });
}

export function devAddItem(characterId: string, itemId: string, quantity: number): Promise<{ itemId: string; quantity: number; name: string }> {
  return devRequest(`/dev/characters/${characterId}/add-item`, { method: 'POST', body: JSON.stringify({ itemId, quantity }) });
}

export function devCompleteActivity(characterId: string): Promise<{ completed: boolean; message: string }> {
  return devRequest(`/dev/characters/${characterId}/complete-activity`, { method: 'POST' });
}

export function devTimeWarp(characterId: string, hours: number): Promise<{ warped: boolean; message: string }> {
  return devRequest(`/dev/characters/${characterId}/time-warp`, { method: 'POST', body: JSON.stringify({ hours }) });
}

export function devSetProfession(characterId: string, professionId: string, skill: number): Promise<{ professionId: string; skill: number }> {
  return devRequest(`/dev/characters/${characterId}/set-profession`, { method: 'POST', body: JSON.stringify({ professionId, skill }) });
}

export function devResetCharacter(characterId: string): Promise<{ reset: boolean }> {
  return devRequest(`/dev/characters/${characterId}/reset`, { method: 'POST' });
}

export function devGrantMounts(characterId: string): Promise<DevCharacterState> {
  return devRequest(`/dev/characters/${characterId}/grant-mounts`, { method: 'POST' });
}

export function devListQuests(characterId: string): Promise<DevQuestDef[]> {
  return devRequest(`/dev/characters/${characterId}/quests`);
}

export function devSetArenaRating(
  characterId: string,
  bracket: string,
  rating: number,
): Promise<{ bracket: string; seasonId: string; rating: number }> {
  return devRequest(`/dev/characters/${characterId}/set-arena-rating`, {
    method: 'POST',
    body: JSON.stringify({ bracket, rating }),
  });
}

export function devSetReputation(
  characterId: string,
  factionId: string,
  standing: number,
): Promise<{ factionId: string; standing: number }> {
  return devRequest(`/dev/characters/${characterId}/set-reputation`, {
    method: 'POST',
    body: JSON.stringify({ factionId, standing }),
  });
}

export function devClearLockouts(characterId: string): Promise<{ cleared: number }> {
  return devRequest(`/dev/characters/${characterId}/clear-lockouts`, { method: 'POST' });
}

export function devCompleteQuest(
  characterId: string,
  questId: string,
): Promise<{ questId: string; alreadyDone: boolean }> {
  return devRequest(`/dev/characters/${characterId}/complete-quest`, {
    method: 'POST',
    body: JSON.stringify({ questId }),
  });
}

// Moderation
export function devListAccounts(): Promise<DevAccountView[]> {
  return devRequest('/dev/mod/accounts');
}

export function devBanAccount(accountId: string): Promise<{ banned: boolean }> {
  return devRequest(`/dev/mod/accounts/${accountId}/ban`, { method: 'POST' });
}

export function devUnbanAccount(accountId: string): Promise<{ banned: boolean }> {
  return devRequest(`/dev/mod/accounts/${accountId}/unban`, { method: 'POST' });
}

export function devDeleteAccount(accountId: string): Promise<{ deleted: boolean }> {
  return devRequest(`/dev/mod/accounts/${accountId}`, { method: 'DELETE' });
}

export function devListAccountCharacters(accountId: string): Promise<DevCharacterSearchResult[]> {
  return devRequest(`/dev/mod/accounts/${accountId}/characters`);
}

export function devSearchCharacters(name: string): Promise<DevCharacterSearchResult[]> {
  return devRequest(`/dev/mod/characters/search?name=${encodeURIComponent(name)}`);
}

export function devInspectCharacter(characterId: string): Promise<DevCharacterInspect> {
  return devRequest(`/dev/mod/characters/${characterId}/inspect`);
}

export function devDeleteCharacter(characterId: string): Promise<{ deleted: boolean }> {
  return devRequest(`/dev/mod/characters/${characterId}`, { method: 'DELETE' });
}

export interface DevChatMessage {
  id: string;
  channel: string;
  senderId: string | null;
  senderName: string;
  body: string;
  at: string;
}

export interface DevChatHistoryResult {
  messages: DevChatMessage[];
  hasMore: boolean;
}

export function devListChat(opts: {
  channel?: string;
  search?: string;
  senderId?: string;
  before?: string;
  limit?: number;
}): Promise<DevChatHistoryResult> {
  const params = new URLSearchParams();
  if (opts.channel) params.set('channel', opts.channel);
  if (opts.search) params.set('search', opts.search);
  if (opts.senderId) params.set('senderId', opts.senderId);
  if (opts.before) params.set('before', opts.before);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  return devRequest(`/dev/mod/chat?${params.toString()}`);
}

export function devDeleteChatMessage(messageId: string): Promise<{ deleted: boolean }> {
  return devRequest(`/dev/mod/chat/${messageId}`, { method: 'DELETE' });
}

// ── The Gauntlet (M13) — aktivní tahová survival aréna ──────────────────────

export interface GauntletAbilityView {
  id: string;
  name: string;
  description: string;
  kind: string;
  cooldownSec: number;
  cooldownRemaining: number;
  ready: boolean;
  spellTier: number;
  outOfSlots: boolean;
  kiCost: number;
  outOfKi: boolean;
  /** D&D akční slot (ADR 0042) — 'action' (default) / 'bonus' (Healing Word). */
  actionCost: 'action' | 'bonus';
  /** Kostky/slot tier nad `spellTier` (Upcast — volba slotu). 0 = neupcastovatelné. */
  upcastPerSlot: number;
}

export interface GauntletDailyView {
  xpEarned: number;
  xpCap: number;
  goldEarned: number;
  goldCap: number;
}

export interface GauntletStatComparison {
  label: string;
  current: number;
  offered: number;
}

export interface GauntletDraftOption {
  id: string;
  kind: 'buff' | 'gear' | 'ability';
  name: string;
  description: string;
  comparison?: GauntletStatComparison[];
}

export interface GauntletRunView {
  runId: string;
  status: 'in_combat' | 'drafting' | 'dead' | 'retired';
  wave: number;
  wavesCleared: number;
  player: {
    name: string;
    maxHealth: number;
    currentHealth: number;
    absorb: number;
    mitigationTurns: number;
    spellSlots: Record<number, number>;
    maxSpellSlots: Record<number, number>;
    kiPoints: number;
    maxKiPoints: number;
    rageCharges: number;
    maxRageCharges: number;
    raging: boolean;
    conditions: ActiveCondition[];
  };
  enemy: {
    name: string;
    isElite: boolean;
    maxHealth: number;
    currentHealth: number;
    conditions: ActiveCondition[];
  } | null;
  abilities: GauntletAbilityView[];
  events: CombatEvent[];
  draft: GauntletDraftOption[] | null;
  reward: { xp: number; gold: number; items: string[] } | null;
  daily: GauntletDailyView;
}

export interface GauntletStatusView {
  level: number;
  activeRunId: string | null;
  bestWave: number;
  daily: GauntletDailyView;
}

export interface GauntletRunSummary {
  runId: string;
  wavesCleared: number;
  status: string;
  reward: { xp: number; gold: number; items: string[] };
  createdAt: string;
}

export function getGauntletStatus(characterId: string): Promise<GauntletStatusView> {
  return request<GauntletStatusView>(`/characters/${characterId}/gauntlet`);
}

export function recentGauntletRuns(characterId: string): Promise<GauntletRunSummary[]> {
  return request<GauntletRunSummary[]>(`/characters/${characterId}/gauntlet/runs`);
}

export function getGauntletRun(characterId: string, runId: string): Promise<GauntletRunView> {
  return request<GauntletRunView>(`/characters/${characterId}/gauntlet/run/${runId}`);
}

export function enterGauntlet(characterId: string): Promise<GauntletRunView> {
  return request<GauntletRunView>(`/characters/${characterId}/gauntlet/enter`, { method: 'POST' });
}

export function gauntletAct(
  characterId: string,
  runId: string,
  abilityId: string,
  bonusAbilityId?: string,
  castTier?: number,
): Promise<GauntletRunView> {
  return request<GauntletRunView>(`/characters/${characterId}/gauntlet/run/${runId}/act`, {
    method: 'POST',
    body: JSON.stringify({ abilityId, bonusAbilityId, castTier }),
  });
}

export function gauntletDraft(
  characterId: string,
  runId: string,
  optionId: string,
): Promise<GauntletRunView> {
  return request<GauntletRunView>(`/characters/${characterId}/gauntlet/run/${runId}/draft`, {
    method: 'POST',
    body: JSON.stringify({ optionId }),
  });
}

export function gauntletRetire(characterId: string, runId: string): Promise<GauntletRunView> {
  return request<GauntletRunView>(`/characters/${characterId}/gauntlet/run/${runId}/retire`, {
    method: 'POST',
  });
}
