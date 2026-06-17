import { writable, get } from 'svelte/store';

export interface Session {
  accessToken: string;
  user: { accountId: string; username: string };
}

/**
 * Reaktivní auth stav — jen v paměti (žádný localStorage).
 * Refresh token je httpOnly cookie (neviditelná pro JS).
 * Po reloadu stránky se access token obnoví prvním API voláním (401 → /auth/refresh → cookie).
 */
export const session = writable<Session | null>(null);

export function setSession(value: Session): void {
  session.set(value);
}

export function clearSession(): void {
  session.set(null);
}

export function currentSession(): Session | null {
  return get(session);
}
