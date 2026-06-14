/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

// Vite-PWA injectuje manifest (seznam buildnutých assets k precachování).
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

interface PushPayload {
  title: string;
  body: string;
  characterId?: string;
}

// Zobrazí notifikaci při push eventu (i když je app zavřená).
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;
  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { characterId: payload.characterId },
    }),
  );
});

// Klik na notifikaci otevře/focusne záložku s postavou.
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const characterId = (event.notification.data as { characterId?: string } | null)?.characterId;
  const url = characterId ? `/characters/${characterId}` : '/characters';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        const existing = windowClients.find((c) => c.url.includes(url));
        if (existing) return existing.focus();
        return clients.openWindow(url);
      }),
  );
});
