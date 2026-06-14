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

export interface ActivityView {
  id: string;
  activityType: string;
  questId: string;
  startAt: string;
  durationSec: number;
  quest: { id: string; name: string; zoneId: string; kind: string };
  progress: {
    elapsedSec: number;
    remainingSec: number;
    progress: number;
    completed: boolean;
    finishesAt: string;
  };
}

export interface ClaimResult {
  reward: { xp: number; gold: number };
  levelBefore: number;
  levelAfter: number;
  leveledUp: boolean;
  levelsGained: number;
  character: CharacterView;
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
        'Content-Type': 'application/json',
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
