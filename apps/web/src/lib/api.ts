import type { CharacterSheet } from '@game/shared';
import { clearTokens, currentTokens, setTokens, type Tokens } from './auth';

export interface CharacterView {
  id: string;
  name: string;
  race: string;
  class: string;
  faction: string;
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
  dungeon?: { id: string; name: string };
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
}

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

export interface DungeonLogView {
  dungeonId: string;
  dungeonName: string;
  startAt: string;
  durationSec: number;
  progress: ActivityProgress;
  player: { name: string; maxHealth: number };
  enemies: { name: string; isBoss: boolean }[];
  events: CombatEvent[];
  victory: boolean | null;
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
      headers: {
        // Content-Type jen s tělem — Fastify odmítá prázdné tělo s JSON content-type.
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });

  const tokens = currentTokens();
  let res = await doFetch(auth ? tokens?.accessToken : undefined);

  // Jednorázový pokus o refresh při vypršení access tokenu.
  if (res.status === 401 && auth && tokens?.refreshToken) {
    try {
      const refreshed = await refresh(tokens.refreshToken);
      setTokens(refreshed);
      res = await doFetch(refreshed.accessToken);
    } catch {
      clearTokens();
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

export function register(username: string, password: string, email?: string): Promise<Tokens> {
  return request<Tokens>(
    '/auth/register',
    { method: 'POST', body: JSON.stringify({ username, password, email: email || undefined }) },
    false,
  );
}

export function login(username: string, password: string): Promise<Tokens> {
  return request<Tokens>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ username, password }) },
    false,
  );
}

export function refresh(refreshToken: string): Promise<Tokens> {
  return request<Tokens>(
    '/auth/refresh',
    { method: 'POST', body: JSON.stringify({ refreshToken }) },
    false,
  );
}

export function listCharacters(): Promise<CharacterView[]> {
  return request<CharacterView[]>('/characters');
}

export function getCharacter(id: string): Promise<CharacterView> {
  return request<CharacterView>(`/characters/${id}`);
}

export function createCharacter(input: {
  name: string;
  race: string;
  class: string;
}): Promise<CharacterView> {
  return request<CharacterView>('/characters', { method: 'POST', body: JSON.stringify(input) });
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

export function claimActivity(characterId: string): Promise<ClaimResult> {
  return request<ClaimResult>(`/characters/${characterId}/activity/claim`, { method: 'POST' });
}

export function listDungeons(characterId: string): Promise<DungeonListItem[]> {
  return request<DungeonListItem[]>(`/characters/${characterId}/dungeons`);
}

export function enterDungeon(characterId: string, dungeonId: string): Promise<DungeonLogView> {
  return request<DungeonLogView>(`/characters/${characterId}/dungeons/${dungeonId}/enter`, {
    method: 'POST',
  });
}

export function getDungeonLog(characterId: string): Promise<DungeonLogView | null> {
  return request<DungeonLogView | null>(`/characters/${characterId}/dungeons/log`);
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

// ── Raids (M8, MP PVE) ───────────────────────────────────────────────────────

export type RaidRole = 'tank' | 'healer' | 'dps';

export interface RaidListItem {
  id: string;
  name: string;
  description: string;
  requiredLevel: number;
  attunementQuests: string[];
  bossNames: string[];
  unlocked: boolean;
  queuedRole: RaidRole | null;
}

export interface RaidReward {
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
  progress: ActivityProgress;
  party: { name: string; role: RaidRole; maxHealth: number; isNpc: boolean }[];
  bosses: { name: string }[];
  events: CombatEvent[];
  victory: boolean | null;
  myReward: RaidReward | null;
  myRole: RaidRole | null;
}

export interface RaidRunSummary {
  runId: string;
  raidId: string;
  raidName: string;
  role: RaidRole;
  victory: boolean;
  reward: RaidReward;
  createdAt: string;
}

export function listRaids(characterId: string): Promise<RaidListItem[]> {
  return request<RaidListItem[]>(`/characters/${characterId}/raids`);
}

export function recentRaidRuns(characterId: string): Promise<RaidRunSummary[]> {
  return request<RaidRunSummary[]>(`/characters/${characterId}/raids/runs`);
}

export function getRaidRun(characterId: string, runId: string): Promise<RaidRunView> {
  return request<RaidRunView>(`/characters/${characterId}/raids/run/${runId}`);
}

export function enterRaid(
  characterId: string,
  raidId: string,
  role: RaidRole,
): Promise<RaidRunView> {
  return request<RaidRunView>(`/characters/${characterId}/raids/${raidId}/enter`, {
    method: 'POST',
    body: JSON.stringify({ role }),
  });
}

export function queueRaid(
  characterId: string,
  raidId: string,
  role: RaidRole,
): Promise<{ queued: true; role: RaidRole }> {
  return request<{ queued: true; role: RaidRole }>(
    `/characters/${characterId}/raids/${raidId}/queue`,
    { method: 'POST', body: JSON.stringify({ role }) },
  );
}

export function leaveRaidQueue(
  characterId: string,
  raidId: string,
): Promise<{ left: boolean }> {
  return request<{ left: boolean }>(`/characters/${characterId}/raids/${raidId}/leave`, {
    method: 'POST',
  });
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
}

export interface InventoryItemView {
  itemId: string;
  quantity: number;
  item?: { name?: string };
}

export function listInventory(characterId: string): Promise<InventoryItemView[]> {
  return request<InventoryItemView[]>(`/characters/${characterId}/inventory`);
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
