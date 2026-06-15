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
  sizes: number[];
  unlocked: boolean;
  queuedRole: RaidRole | null;
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
  party: { name: string; role: RaidRole; maxHealth: number; isNpc: boolean }[];
  encounters: { name: string; isBoss: boolean }[];
  events: CombatEvent[];
  victory: boolean | null;
  wipes: number | null;
  myReward: { xp: number; gold: number; items: string[] } | null;
  myRole: RaidRole | null;
  /** Vítězství proběhlo, ale odměna propadla weekly lockoutem (M8.6). */
  myLockedOut: boolean;
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

export interface RaidComposition {
  tank: number;
  healer: number;
  dps: number;
}

export interface RaidListItem {
  id: string;
  name: string;
  description: string;
  requiredLevel: number;
  attunementQuests: string[];
  bossNames: string[];
  sizes: number[];
  defaultComposition: Record<number, RaidComposition>;
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
  wipes: number | null;
  myReward: RaidReward | null;
  myRole: RaidRole | null;
  /** Vítězství proběhlo, ale odměna propadla weekly lockoutem (M8.6). */
  myLockedOut: boolean;
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
  size?: number,
  composition?: RaidComposition,
): Promise<RaidRunView> {
  return request<RaidRunView>(`/characters/${characterId}/raids/${raidId}/enter`, {
    method: 'POST',
    body: JSON.stringify({ role, size, composition }),
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

// Social (M9): friends + chat.

export interface FriendView {
  characterId: string;
  name: string;
  level: number;
  race: string;
  class: string;
  faction: string;
  since: string;
}

export interface FriendRequestView {
  requestId: string;
  characterId: string;
  name: string;
  level: number;
  race: string;
  class: string;
  faction: string;
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
  characterId: string | null;
  name: string;
  body: string;
  at: string;
}

export function getChatHistory(characterId: string): Promise<ChatMessageView[]> {
  return request<ChatMessageView[]>(`/characters/${characterId}/chat`);
}

export function sendChatMessage(characterId: string, body: string): Promise<ChatMessageView> {
  return request<ChatMessageView>(`/characters/${characterId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

// Guild (M9)

export type GuildRankName = 'member' | 'officer' | 'leader';

export interface GuildMemberView {
  characterId: string;
  name: string;
  level: number;
  race: string;
  class: string;
  faction: string;
  rank: GuildRankName;
  joinedAt: string;
}

export interface GuildView {
  id: string;
  name: string;
  leaderCharacterId: string;
  memberCount: number;
  myRank: GuildRankName;
  members: GuildMemberView[];
}

export interface GuildInviteView {
  inviteId: string;
  guildId: string;
  guildName: string;
  invitedBy: string | null;
  sentAt: string;
}

export interface GuildState {
  guild: GuildView | null;
  invites: GuildInviteView[];
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

// Raid lobby (M8.5-B, manual formation)

export interface LobbyMemberView {
  characterId: string;
  name: string;
  level: number;
  race: string;
  class: string;
  role: RaidRole;
  status: 'invited' | 'joined';
  isLeader: boolean;
}

export interface RaidLobbyView {
  id: string;
  raidId: string;
  raidName: string;
  size: number;
  composition: RaidComposition;
  status: string;
  runId: string | null;
  leaderCharacterId: string;
  iAmLeader: boolean;
  members: LobbyMemberView[];
  remaining: RaidComposition;
  full: boolean;
}

export interface LobbyInviteView {
  lobbyId: string;
  raidId: string;
  raidName: string;
  role: RaidRole;
  size: number;
}

export interface LobbyState {
  lobby: RaidLobbyView | null;
  invites: LobbyInviteView[];
}

export function getRaidLobby(characterId: string): Promise<LobbyState> {
  return request<LobbyState>(`/characters/${characterId}/raid-lobbies`);
}

export function createRaidLobby(
  characterId: string,
  raidId: string,
  role: RaidRole,
  size?: number,
  composition?: RaidComposition,
): Promise<LobbyState> {
  return request<LobbyState>(`/characters/${characterId}/raid-lobbies`, {
    method: 'POST',
    body: JSON.stringify({ raidId, role, size, composition }),
  });
}

export function inviteToLobby(
  characterId: string,
  lobbyId: string,
  name: string,
  role: RaidRole,
): Promise<LobbyState> {
  return request<LobbyState>(`/characters/${characterId}/raid-lobbies/${lobbyId}/invites`, {
    method: 'POST',
    body: JSON.stringify({ name, role }),
  });
}

export function respondLobbyInvite(
  characterId: string,
  lobbyId: string,
  accept: boolean,
  role?: RaidRole,
): Promise<LobbyState> {
  return request<LobbyState>(
    `/characters/${characterId}/raid-lobbies/${lobbyId}/invites/respond`,
    { method: 'POST', body: JSON.stringify({ accept, role }) },
  );
}

export function leaveRaidLobby(characterId: string, lobbyId: string): Promise<LobbyState> {
  return request<LobbyState>(`/characters/${characterId}/raid-lobbies/${lobbyId}/leave`, {
    method: 'POST',
  });
}

export function kickLobbyMember(
  characterId: string,
  lobbyId: string,
  targetCharacterId: string,
): Promise<LobbyState> {
  return request<LobbyState>(
    `/characters/${characterId}/raid-lobbies/${lobbyId}/members/${targetCharacterId}`,
    { method: 'DELETE' },
  );
}

export function startRaidLobby(characterId: string, lobbyId: string): Promise<{ runId: string }> {
  return request<{ runId: string }>(`/characters/${characterId}/raid-lobbies/${lobbyId}/start`, {
    method: 'POST',
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
  bracket: '3v3' | '5v5';
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
  bracket: '3v3' | '5v5';
  matchId?: string;
}

export interface TeamMatchView {
  matchId: string;
  bracket: string;
  durationSec: number;
  progress: { elapsedSec: number; remainingSec: number; completed: boolean };
  myTeam: { name: string; maxHealth: number }[];
  enemyTeam: { name: string; maxHealth: number }[];
  events: { t: number; type: string; message?: string }[];
  outcome: 'win' | 'loss' | null;
}

export function getTeamArena(characterId: string): Promise<TeamArenaView> {
  return request<TeamArenaView>(`/characters/${characterId}/team-arena`);
}

export function queueTeam(
  characterId: string,
  bracket: '3v3' | '5v5',
  teammateNames: string[],
): Promise<TeamQueueResult> {
  return request<TeamQueueResult>(`/characters/${characterId}/team-arena/queue`, {
    method: 'POST',
    body: JSON.stringify({ bracket, teammateNames }),
  });
}

export function leaveTeamQueue(
  characterId: string,
  bracket: '3v3' | '5v5',
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

export function claimAchievement(
  characterId: string,
  achievementId: string,
): Promise<AchievementClaimResult> {
  return request<AchievementClaimResult>(
    `/characters/${characterId}/achievements/${achievementId}/claim`,
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

export interface DevAccountView {
  id: string;
  username: string;
  email: string | null;
  bannedAt: string | null;
  createdAt: string;
  characterCount: number;
}

export interface DevCharacterInspect {
  id: string;
  name: string;
  race: string;
  class: string;
  faction: string;
  level: number;
  totalXp: number;
  gold: number;
  accountId: string;
  activity: { type: string; startAt: string; durationSec: number } | null;
  inventory: { itemId: string; name: string; quantity: number }[];
  equipment: { slot: string; itemId: string; name: string }[];
  professions: { professionId: string; skill: number }[];
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

export function devSearchCharacters(name: string): Promise<DevCharacterSearchResult[]> {
  return devRequest(`/dev/mod/characters/search?name=${encodeURIComponent(name)}`);
}

export function devInspectCharacter(characterId: string): Promise<DevCharacterInspect> {
  return devRequest(`/dev/mod/characters/${characterId}/inspect`);
}

export function devDeleteCharacter(characterId: string): Promise<{ deleted: boolean }> {
  return devRequest(`/dev/mod/characters/${characterId}`, { method: 'DELETE' });
}
