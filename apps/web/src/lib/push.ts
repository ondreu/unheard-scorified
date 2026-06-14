import { getVapidPublicKey, subscribePushApi, unsubscribePushApi } from './api';

/** Konvertuje base64url string na Uint8Array<ArrayBuffer> (potřebné pro applicationServerKey). */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) {
    view[i] = raw.charCodeAt(i);
  }
  return view;
}

/** Vrátí `true`, pokud prohlížeč push notifikace podporuje. */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Přihlásí se k push notifikacím. Vyžádá povolení prohlížeče a uloží subscription na API. */
export async function subscribePush(): Promise<'subscribed' | 'denied' | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const registration = await navigator.serviceWorker.ready;
  const { key: vapidKey } = await getVapidPublicKey();

  const sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  const json = sub.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  await subscribePushApi({ endpoint: json.endpoint, keys: json.keys });
  return 'subscribed';
}

/** Odhlásí push notifikace: zruší browser subscription + smaže ze serveru. */
export async function unsubscribePush(): Promise<void> {
  if (!isPushSupported()) return;

  const registration = await navigator.serviceWorker.ready;
  const sub = await registration.pushManager.getSubscription();
  if (!sub) return;

  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await unsubscribePushApi(endpoint);
}

/** Vrátí aktuální stav push subscription v tomto prohlížeči. */
export async function getPushState(): Promise<'subscribed' | 'denied' | 'default' | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';

  const registration = await navigator.serviceWorker.ready;
  const sub = await registration.pushManager.getSubscription();
  return sub ? 'subscribed' : 'default';
}
