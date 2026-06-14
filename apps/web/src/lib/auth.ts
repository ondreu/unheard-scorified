import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const STORAGE_KEY = 'idlerpg.tokens';

function load(): Tokens | null {
  if (!browser) return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Tokens) : null;
}

/** Reaktivní stav přihlášení. Tokeny zatím v localStorage (zpevnění na cookie = follow-up, viz ADR 0005). */
export const tokens = writable<Tokens | null>(load());

tokens.subscribe((value) => {
  if (!browser) return;
  if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  else localStorage.removeItem(STORAGE_KEY);
});

export function setTokens(value: Tokens): void {
  tokens.set(value);
}

export function clearTokens(): void {
  tokens.set(null);
}

export function currentTokens(): Tokens | null {
  return load();
}
