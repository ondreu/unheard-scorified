import type { CharacterSheet } from '@game/shared';
import { clearTokens, currentTokens, setTokens, type Tokens } from './auth';

export interface CharacterView {
  id: string;
  name: string;
  race: string;
  class: string;
  faction: string;
  sheet: CharacterSheet;
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
