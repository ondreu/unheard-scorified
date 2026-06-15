<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import type { Socket } from 'socket.io-client';
  import {
    ApiError,
    getCharacter,
    getGroup,
    getGuild,
    getMailbox,
    type CharacterView,
    type GroupState,
  } from '$lib/api';
  import { connectSocial, subscribeSocial } from '$lib/social-socket';
  import { getPushState, isPushSupported, subscribePush, unsubscribePush } from '$lib/push';
  import { RACES, CLASSES } from '@game/shared';
  import { CLASS_COLOR, ROLE_META } from '$lib/cosmetics';
  import { notifications, openProfile } from '$lib/ui-stores';
  import { NAV_SECTIONS } from '$lib/nav';
  import Avatar from '$lib/components/Avatar.svelte';
  import NotificationBell from '$lib/components/NotificationBell.svelte';
  import Toasts from '$lib/components/Toasts.svelte';
  import ChatBubble from '$lib/components/ChatBubble.svelte';
  import PlayerProfile from '$lib/components/PlayerProfile.svelte';
  import DevPanel from '$lib/DevPanel.svelte';

  let { children } = $props();

  const ui = {
    notificationsOn: 'Notifications on',
    enableNotifications: 'Enable alerts',
    notificationsDenied: 'Alerts blocked',
    party: 'Party',
    inviteFriendReq: (n: string) => `${n} sent a friend request`,
    inviteFriendAcc: (n: string) => `${n} accepted your friend request`,
    inviteGuild: (g: string, b: string) => `${b} invited you to ${g}`,
    inviteGuildShort: (g: string) => `Guild invite: ${g}`,
    inviteCharter: (g: string, b: string) => `${b} asked you to sign the charter of ${g}`,
    inviteCharterShort: (g: string) => `Charter signature request: ${g}`,
    inviteGroup: (n: string) => `${n} invited you to a group`,
    whisper: (n: string, b: string) => `${n} whispers: ${b}`,
    mailUnread: (n: number) => `You have ${n} unread mail`,
  };

  let character = $state<CharacterView | null>(null);
  let group = $state<GroupState | null>(null);
  let loadError = $state<string | null>(null);

  let pushState = $state<'subscribed' | 'denied' | 'default' | 'unsupported'>('unsupported');
  let pushPending = $state(false);

  const characterId = $derived($page.params.id ?? '');
  const pathname = $derived($page.url.pathname);

  let socket: Socket | undefined;
  let unsub: (() => void) | undefined;
  let lastLoadedId = '';

  onMount(() => {
    socket = connectSocial();
    if (isPushSupported()) void getPushState().then((s) => (pushState = s));
  });

  onDestroy(() => {
    unsub?.();
    socket?.disconnect();
  });

  // Reload identity + group + social subscription whenever the active character changes.
  $effect(() => {
    const id = characterId;
    if (!id || id === lastLoadedId) return;
    lastLoadedId = id;
    void load(id);
    if (socket) {
      unsub?.();
      unsub = subscribeSocial(socket, id, {
        onFriendRequest: (e) => notifications.push('social', ui.inviteFriendReq(e.fromName)),
        onFriendAccepted: (e) => notifications.push('social', ui.inviteFriendAcc(e.byName)),
        onGuildInvite: (e) => notifications.push('social', ui.inviteGuild(e.guildName, e.byName)),
        onGuildCharterInvite: (e) =>
          notifications.push('social', ui.inviteCharter(e.guildName, e.byName)),
        onWhisper: (e) => notifications.push('social', ui.whisper(e.fromName, e.body)),
      });
    }
  });

  async function load(id: string): Promise<void> {
    try {
      character = await getCharacter(id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await goto('/login');
        return;
      }
      loadError = (err as Error).message;
      return;
    }
    try {
      group = await getGroup(id);
      const invites = group?.invites ?? [];
      for (const inv of invites) notifications.push('social', ui.inviteGroup(inv.leaderName));
    } catch {
      group = null;
    }
    // Surface pending guild + charter invites that may have arrived while offline.
    try {
      const g = await getGuild(id);
      for (const inv of g.invites) notifications.push('social', ui.inviteGuildShort(inv.guildName));
      for (const req of g.charterInvites)
        notifications.push('social', ui.inviteCharterShort(req.guildName));
    } catch {
      // best-effort; guild panel still reachable from nav
    }
    // Unread mail badge (offline messages arrived).
    try {
      const box = await getMailbox(id);
      if (box.unread > 0) notifications.push('info', ui.mailUnread(box.unread));
    } catch {
      // best-effort
    }
  }

  async function togglePush(): Promise<void> {
    pushPending = true;
    try {
      if (pushState === 'subscribed') {
        await unsubscribePush();
        pushState = 'default';
      } else {
        const r = await subscribePush();
        pushState = r === 'subscribed' ? 'subscribed' : r;
      }
    } finally {
      pushPending = false;
    }
  }

  function isActive(path: string): boolean {
    const base = `/characters/${characterId}`;
    if (path === '') return pathname === base;
    return pathname.startsWith(`${base}/${path}`);
  }

  const c = $derived(character);
  const members = $derived((group?.group?.members ?? []).filter((m) => m.status === 'joined'));
</script>

<div class="min-h-dvh">
  <!-- Top bar: identity + gold + alerts -->
  <header class="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur">
    <div class="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2.5">
      <a href="/characters" class="text-[var(--text-faint)] hover:text-[var(--gold)]" title="Switch character">‹</a>

      {#if c}
        <button class="flex min-w-0 items-center gap-2.5" onclick={() => openProfile(c.id, c.name)}>
          <Avatar name={c.name} race={c.race} klass={c.class} size={40} />
          <span class="min-w-0 text-left">
            <span class="block truncate font-display font-semibold text-[var(--gold-bright)]">{c.name}</span>
            <span class="block truncate text-xs text-[var(--text-dim)]">
              Lv {c.sheet.level} · {RACES[c.race as keyof typeof RACES]?.name}
              <span style={`color:${CLASS_COLOR[c.class] ?? 'inherit'}`}
                >{CLASSES[c.class as keyof typeof CLASSES]?.name}</span
              >
            </span>
          </span>
        </button>

        <!-- XP bar (hidden on narrow) -->
        <div class="mx-2 hidden flex-1 sm:block">
          <div class="bar">
            <div
              class="bar-fill"
              style={`width:${c.sheet.xpForNext > 0 ? Math.min(100, (c.sheet.xpIntoLevel / c.sheet.xpForNext) * 100) : 100}%`}
            ></div>
          </div>
        </div>

        <span class="ml-auto whitespace-nowrap font-semibold text-[var(--gold-bright)]" title="Gold">
          {c.gold} <span class="text-xs text-[var(--text-faint)]">g</span>
        </span>
      {:else}
        <span class="text-sm text-[var(--text-faint)]">Loading…</span>
        <span class="ml-auto"></span>
      {/if}

      {#if pushState !== 'unsupported' && pushState !== 'denied'}
        <button
          class="btn btn-sm"
          onclick={togglePush}
          disabled={pushPending}
          title={pushState === 'subscribed' ? ui.notificationsOn : ui.enableNotifications}
        >
          {pushState === 'subscribed' ? '🔕' : '🔔'}
        </button>
      {/if}
      <NotificationBell />
    </div>

    <!-- Group strip: party visible from anywhere -->
    {#if members.length > 0}
      <div class="border-t border-[var(--border)]/60 bg-[var(--surface-2)]/40">
        <div class="mx-auto flex max-w-4xl items-center gap-2 overflow-x-auto px-4 py-1.5 text-xs">
          <span class="shrink-0 font-semibold text-[var(--text-faint)]">{ui.party}:</span>
          {#each members as m (m.characterId)}
            <button
              class="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-black/20 py-0.5 pl-0.5 pr-2 hover:border-[var(--border-strong)]"
              onclick={() => openProfile(m.characterId, m.name)}
              title={`${m.name} — ${ROLE_META[m.role].label}`}
            >
              <Avatar name={m.name} race={m.race} klass={m.class} size={22} showEmblem={false} />
              <span class="font-medium">{m.name}</span>
              <span style={`color:${ROLE_META[m.role].color}`}>{ROLE_META[m.role].icon}</span>
              <span class="text-[var(--text-faint)]">{m.level}</span>
              {#if m.isLeader}<span title="Leader">👑</span>{/if}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Compact section nav -->
    <nav class="border-t border-[var(--border)]/60">
      <div class="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-3 py-1.5 text-sm">
        <a
          href={`/characters/${characterId}`}
          class="shrink-0 rounded-md px-2.5 py-1 {isActive('')
            ? 'bg-[var(--surface-raised)] text-[var(--gold-bright)]'
            : 'text-[var(--text-dim)] hover:text-[var(--text)]'}"
        >
          🏠 Overview
        </a>
        {#each NAV_SECTIONS as s (s.path)}
          <a
            href={`/characters/${characterId}/${s.path}`}
            class="shrink-0 rounded-md px-2.5 py-1 {isActive(s.path)
              ? 'bg-[var(--surface-raised)] text-[var(--gold-bright)]'
              : 'text-[var(--text-dim)] hover:text-[var(--text)]'}"
          >
            {s.icon} {s.title}
          </a>
        {/each}
      </div>
    </nav>
  </header>

  {#if loadError && !c}
    <p class="mx-auto max-w-4xl px-4 py-8 text-[var(--danger)]">{loadError}</p>
  {/if}

  <div class="character-content mx-auto max-w-4xl px-4 py-6">
    {@render children()}
  </div>
</div>

{#if c}
  <ChatBubble viewerId={c.id} viewerName={c.name} />
  <PlayerProfile viewerId={c.id} viewerInGroup={!!group?.group} />
{/if}
<Toasts />
<DevPanel {characterId} />
