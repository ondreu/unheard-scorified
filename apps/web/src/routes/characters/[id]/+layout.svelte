<script lang="ts">
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import type { Socket } from 'socket.io-client';
  import {
    ApiError,
    getCharacter,
    getGroup,
    getGuild,
    getHistory,
    getMailbox,
    getSocial,
    type CharacterView,
    type GroupState,
  } from '$lib/api';
  import { connectSocial, subscribeSocial } from '$lib/social-socket';
  import { backdropStyle } from '$lib/pixelart/backdrop';
  import { getPushState, isPushSupported, subscribePush, unsubscribePush } from '$lib/push';
  import { RACES, CLASSES } from '@game/shared';
  import { CLASS_COLOR, ROLE_META } from '$lib/cosmetics';
  import {
    notifications,
    openProfile,
    activeCharacterLevel,
    activeCharacterSpellSaveDc,
  } from '$lib/ui-stores';
  import { NAV_CATEGORIES, sectionsInGroup, type NavGroup } from '$lib/nav';
  import Avatar from '$lib/components/Avatar.svelte';
  import NotificationBell from '$lib/components/NotificationBell.svelte';
  import Toasts from '$lib/components/Toasts.svelte';
  import ChatBubble from '$lib/components/ChatBubble.svelte';
  import PlayerProfile from '$lib/components/PlayerProfile.svelte';
  import NpcProfile from '$lib/components/NpcProfile.svelte';
  import AbilityDetail from '$lib/components/AbilityDetail.svelte';
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
    groupJoinReq: (n: string) => `${n} requested to join your group`,
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
    notifications.setScope(id);
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
      activeCharacterLevel.set(character.sheet.level);
      activeCharacterSpellSaveDc.set(character.sheet.derived.spellSaveDc);
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
      for (const inv of invites)
        notifications.push(
          'social',
          ui.inviteGroup(inv.leaderName),
          undefined,
          `group-invite:${inv.groupId}`,
        );
      // As group leader, surface pending join requests that arrived while offline
      // (they otherwise only appear on the group card).
      if (group?.group?.iAmLeader) {
        for (const m of group.group.members) {
          if (m.status === 'requested')
            notifications.push(
              'social',
              ui.groupJoinReq(m.name),
              undefined,
              `group-join-req:${m.characterId}`,
            );
        }
      }
    } catch {
      group = null;
    }
    // Surface pending friend requests received while offline (otherwise only
    // visible on the social card).
    try {
      const social = await getSocial(id);
      for (const req of social.incoming)
        notifications.push(
          'social',
          ui.inviteFriendReq(req.name),
          undefined,
          `friend-req:${req.requestId}`,
        );
    } catch {
      // best-effort; social panel still reachable from nav
    }
    // Surface pending guild + charter invites that may have arrived while offline.
    try {
      const g = await getGuild(id);
      for (const inv of g.invites)
        notifications.push(
          'social',
          ui.inviteGuildShort(inv.guildName),
          undefined,
          `guild-invite:${inv.inviteId}`,
        );
      for (const req of g.charterInvites)
        notifications.push(
          'social',
          ui.inviteCharterShort(req.guildName),
          undefined,
          `charter-invite:${req.charterId}`,
        );
    } catch {
      // best-effort; guild panel still reachable from nav
    }
    // Unread mail — keyed by the newest unread mail ID. Only shows again when
    // a genuinely new (unseen) mail arrives; never repeats for already-shown mail.
    try {
      const box = await getMailbox(id);
      const unread = box.mail.filter((m) => !m.read);
      if (unread.length > 0) {
        const newestId = [...unread].sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0]!.id;
        notifications.push(
          'info',
          ui.mailUnread(unread.length),
          undefined,
          `mail-unread:${newestId}`,
        );
      }
    } catch {
      // best-effort
    }
    // Surface the latest completed-activity results (quest/dungeon/raid/arena)
    // in the bell — full log lives on the History page.
    try {
      const history = await getHistory(id);
      for (const h of history.slice(0, 3).reverse())
        notifications.push('reward', h.title, h.detail || undefined, `history:${h.id}`);
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

  function isOverview(): boolean {
    return pathname === `/characters/${characterId}`;
  }

  // Kategorie je aktivní na své hub-stránce i na kterékoli své leaf-sekci.
  function isCategoryActive(group: NavGroup): boolean {
    const base = `/characters/${characterId}`;
    if (pathname.startsWith(`${base}/hub/${group}`)) return true;
    return sectionsInGroup(group).some((s) => pathname.startsWith(`${base}/${s.path}`));
  }

  const c = $derived(character);
  const members = $derived((group?.group?.members ?? []).filter((m) => m.status === 'joined'));

  // Procedurální (neutrální) pozadí appky (browser-only; frakce odstraněny).
  const backdrop = $derived(browser ? backdropStyle() : '');
</script>

<div class="app-backdrop" style={backdrop}></div>

<div class="min-h-dvh">
  <!-- Top bar: identity + gold + alerts -->
  <header class="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur">
    <div class="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2.5">
      <a
        href="/characters"
        class="text-[var(--text-faint)] hover:text-[var(--gold)]"
        title="Switch character">‹</a
      >

      {#if c}
        <button class="flex min-w-0 items-center gap-2.5" onclick={() => openProfile(c.id, c.name)}>
          <Avatar name={c.name} race={c.race} klass={c.class} size={40} />
          <span class="min-w-0 text-left">
            <span class="block truncate font-display font-semibold text-[var(--gold-bright)]"
              >{c.name}</span
            >
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

        <span
          class="ml-auto whitespace-nowrap font-semibold text-[var(--gold-bright)]"
          title="Gold"
        >
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

    <!-- Top nav: Overview + 4 categories (leaves live on the category pages) -->
    <nav class="border-t border-[var(--border)]/60">
      <div class="mx-auto flex max-w-4xl gap-1 px-3 py-1.5 text-sm">
        <a
          href={`/characters/${characterId}`}
          class="flex-1 rounded-md px-2.5 py-1 text-center {isOverview()
            ? 'bg-[var(--surface-raised)] text-[var(--gold-bright)]'
            : 'text-[var(--text-dim)] hover:text-[var(--text)]'}"
        >
          🏠 <span class="hidden sm:inline">Overview</span>
        </a>
        {#each NAV_CATEGORIES as cat (cat.group)}
          <a
            href={`/characters/${characterId}/hub/${cat.group}`}
            class="flex-1 rounded-md px-2.5 py-1 text-center {isCategoryActive(cat.group)
              ? 'bg-[var(--surface-raised)] text-[var(--gold-bright)]'
              : 'text-[var(--text-dim)] hover:text-[var(--text)]'}"
          >
            {cat.icon} <span class="hidden sm:inline">{cat.title}</span>
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
<NpcProfile />
<AbilityDetail />
<Toasts />
<DevPanel {characterId} />
