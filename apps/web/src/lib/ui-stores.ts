/**
 * Sdílené UI stavy pro perzistentní shell (M9 refresh): notifikace (toast + bell),
 * prefill rychlého chatu a otevírání inspect/profilu hráče odkudkoli (chat, group,
 * friends, leaderboard). Drží UI vrstvu oddělenou od dat/logiky.
 */
import { writable } from 'svelte/store';

export type NotificationKind = 'info' | 'success' | 'social' | 'reward';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  at: number;
  read: boolean;
}

function createNotifications() {
  const { subscribe, update } = writable<AppNotification[]>([]);
  return {
    subscribe,
    push(kind: NotificationKind, title: string, body?: string): void {
      const n: AppNotification = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind,
        title,
        body,
        at: Date.now(),
        read: false,
      };
      update((list) => [n, ...list].slice(0, 30));
    },
    markAllRead(): void {
      update((list) => list.map((n) => ({ ...n, read: true })));
    },
    clear(): void {
      update(() => []);
    },
  };
}

export const notifications = createNotifications();

/** Cíl inspect/profil modalu — null = zavřeno. */
export const inspectTarget = writable<{ characterId: string; name: string } | null>(null);

export function openProfile(characterId: string, name: string): void {
  inspectTarget.set({ characterId, name });
}

/** Prefill pro rychlý chat (např. „@Name " z whisperu). Shell ho přečte a otevře bublinu. */
export const chatPrefill = writable<string | null>(null);

export function prefillChat(text: string): void {
  chatPrefill.set(text);
}

/** Jméno NPC k „inspect" (klik na jméno nepřítele v combat logu) — null = zavřeno. */
export const inspectNpc = writable<string | null>(null);

export function openNpc(name: string): void {
  inspectNpc.set(name);
}

/** Jméno ability k zobrazení detailu (klik na ability v combat logu) — null = zavřeno. */
export const inspectAbility = writable<string | null>(null);

export function openAbility(name: string): void {
  inspectAbility.set(name);
}

/** Cíl whisperu — chat bublina se otevře v režimu „whisper to X". */
export const whisperTarget = writable<{ characterId: string; name: string } | null>(null);

export function startWhisper(characterId: string, name: string): void {
  whisperTarget.set({ characterId, name });
}
