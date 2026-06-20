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
  /** Stabilní klíč podkladové serverové položky (mail/invite/history) pro dedup. */
  key?: string;
}

const MAX_LIST = 30;
const MAX_DISMISSED = 200;

function createNotifications() {
  const { subscribe, set } = writable<AppNotification[]>([]);

  // Notifikace se chovají „normálně": perzistují per postava (přežijí reload i
  // nový login), drží read/unread stav a jdou mazat jednotlivě. Podkladová
  // serverová data (invites/mail/history) se při každém načtení layoutu
  // re-fetchnou, takže pushe se deduplikují podle stabilního `key`:
  //  - už je v seznamu (ať přečtená/nepřečtená) → nepřidávat znovu,
  //  - byla ručně smazána (`dismissed`) → už nikdy znovu (i když serverová
  //    položka stále existuje).
  let scope = '';
  let list: AppNotification[] = [];
  let dismissed: string[] = [];

  function key(s: string): string {
    return `afk60:notif:${s || 'anon'}`;
  }
  function persist(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(key(scope), JSON.stringify({ list, dismissed }));
    } catch {
      /* quota / private mode */
    }
  }
  function commit(): void {
    list = list.slice(0, MAX_LIST);
    set(list);
    persist();
  }

  return {
    subscribe,
    /** Přepne kontext na danou postavu a načte její perzistovaný stav. */
    setScope(characterId: string): void {
      if (characterId === scope) return;
      scope = characterId;
      list = [];
      dismissed = [];
      if (typeof localStorage !== 'undefined') {
        try {
          const raw = localStorage.getItem(key(scope));
          if (raw) {
            const parsed = JSON.parse(raw) as { list?: AppNotification[]; dismissed?: string[] };
            list = Array.isArray(parsed.list) ? parsed.list.slice(0, MAX_LIST) : [];
            dismissed = Array.isArray(parsed.dismissed) ? parsed.dismissed : [];
          }
        } catch {
          /* corrupt / private mode → prázdný start */
        }
      }
      set(list);
    },
    push(kind: NotificationKind, title: string, body?: string, k?: string): void {
      if (k) {
        if (dismissed.includes(k)) return; // smazané už nikdy znovu
        if (list.some((n) => n.key === k)) return; // už v seznamu → dedup
      }
      const n: AppNotification = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind,
        title,
        body,
        at: Date.now(),
        read: false,
        key: k,
      };
      list = [n, ...list];
      commit();
    },
    markAllRead(): void {
      let changed = false;
      list = list.map((n) => {
        if (n.read) return n;
        changed = true;
        return { ...n, read: true };
      });
      if (changed) commit();
    },
    /** Smaže jednu notifikaci; keyed se zapamatuje jako „dismissed" (nevrátí se). */
    dismiss(id: string): void {
      const n = list.find((x) => x.id === id);
      if (n?.key && !dismissed.includes(n.key)) {
        dismissed = [n.key, ...dismissed].slice(0, MAX_DISMISSED);
      }
      list = list.filter((x) => x.id !== id);
      commit();
    },
    /** Smaže vše; keyed položky se zapamatují jako „dismissed". */
    clear(): void {
      for (const n of list) {
        if (n.key && !dismissed.includes(n.key)) dismissed.unshift(n.key);
      }
      dismissed = dismissed.slice(0, MAX_DISMISSED);
      list = [];
      commit();
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

/**
 * Level aktivní postavy — nastaví char layout při načtení. Slouží detailu ability
 * (AbilityDetail) ke správnému zobrazení škálovaných cantripů (D&D 1→2→3→4 kostek
 * na 5/11/17), aby zobrazení sedělo s enginem. `null` = neznámý level (→ baseline).
 */
export const activeCharacterLevel = writable<number | null>(null);

/** Cíl whisperu — chat bublina se otevře v režimu „whisper to X". */
export const whisperTarget = writable<{ characterId: string; name: string } | null>(null);

export function startWhisper(characterId: string, name: string): void {
  whisperTarget.set({ characterId, name });
}
