<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount, tick } from 'svelte';
  import type { Socket } from 'socket.io-client';
  import {
    ApiError,
    getChatHistory,
    getSocial,
    removeFriend,
    respondFriendRequest,
    sendChatMessage,
    sendFriendRequest,
    type ChatMessageView,
    type FriendView,
    type SocialView,
  } from '$lib/api';
  import { connectSocial, joinChat, sendChat, subscribeSocial } from '$lib/social-socket';
  import { CLASSES } from '@game/shared';
  import { CLASS_COLOR } from '$lib/cosmetics';
  import { openProfile, startWhisper } from '$lib/ui-stores';
  import Avatar from '$lib/components/Avatar.svelte';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    back: '← Back to character',
    title: 'Friends',
    addPlaceholder: 'Character name…',
    add: 'Add friend',
    adding: 'Sending…',
    friends: 'Friends',
    online: 'Online',
    offline: 'Offline',
    noFriends: 'No friends yet. Add someone by their character name.',
    incoming: 'Friend requests',
    outgoing: 'Pending requests',
    accept: 'Accept',
    decline: 'Decline',
    cancel: 'Cancel',
    remove: 'Remove',
    inspect: 'Profile',
    whisper: 'Whisper',
    nowFriends: 'You are now friends!',
    requestSent: 'Friend request sent.',
    level: 'Lv',
    chat: 'Global chat',
    chatPlaceholder: 'Say something…',
    send: 'Send',
    awaiting: 'awaiting reply',
    empty: 'No messages yet. Say hello!',
    newRequest: (name: string): string => `${name} sent you a friend request.`,
    accepted: (name: string): string => `${name} accepted your friend request.`,
    guildInvite: (guild: string, by: string): string => `${by} invited you to ${guild}.`,
  };

  let social = $state<SocialView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let addName = $state('');
  let busy = $state(false);

  // Chat
  let messages = $state<ChatMessageView[]>([]);
  let chatInput = $state('');
  let chatError = $state<string | null>(null);
  let chatList = $state<HTMLUListElement | null>(null);

  const characterId = $derived($page.params.id ?? '');

  let socket: Socket | undefined;
  let unsubSocial: (() => void) | undefined;
  let unsubChat: (() => void) | undefined;

  const onlineCount = $derived(social?.friends.filter((f) => f.online).length ?? 0);

  onMount(async () => {
    await load();
    socket = connectSocial();
    unsubSocial = subscribeSocial(socket, characterId, {
      onFriendRequest: (e) => {
        notice = ui.newRequest(e.fromName);
        void loadSocialOnly();
      },
      onFriendAccepted: (e) => {
        notice = ui.accepted(e.byName);
        void loadSocialOnly();
      },
      onGuildInvite: (e) => {
        notice = ui.guildInvite(e.guildName, e.byName);
      },
      onPresence: (e) => updatePresence(e.characterId, e.online),
    });
    unsubChat = joinChat(
      socket,
      characterId,
      'global',
      (m) => void appendMessage(m),
      (history) => {
        messages = history;
        void scrollChat();
      },
    );
  });

  onDestroy(() => {
    unsubSocial?.();
    unsubChat?.();
    socket?.disconnect();
  });

  /** Realtime online/offline flip without a full reload. */
  function updatePresence(id: string, online: boolean): void {
    if (!social) return;
    const friends = social.friends.map((f) => (f.characterId === id ? { ...f, online } : f));
    social = { ...social, friends };
  }

  async function appendMessage(m: ChatMessageView): Promise<void> {
    if (messages.some((x) => x.id === m.id)) return;
    messages = [...messages, m];
    await scrollChat();
  }

  async function scrollChat(): Promise<void> {
    await tick();
    if (chatList) chatList.scrollTop = chatList.scrollHeight;
  }

  async function send(): Promise<void> {
    const body = chatInput.trim();
    if (!body) return;
    chatError = null;
    const text = chatInput;
    chatInput = '';
    try {
      if (socket?.connected) {
        await sendChat(socket, characterId, body, 'global');
      } else {
        // REST fallback (no live socket): send + refresh history.
        await sendChatMessage(characterId, body, 'global');
        messages = await getChatHistory(characterId, 'global');
        await scrollChat();
      }
    } catch (err) {
      chatError = (err as Error).message;
      chatInput = text;
    }
  }

  async function loadSocialOnly(): Promise<void> {
    social = await getSocial(characterId);
  }

  async function load(): Promise<void> {
    loading = true;
    try {
      social = await getSocial(characterId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await goto('/login');
        return;
      }
      error = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  function className(id: string): string {
    return CLASSES[id as keyof typeof CLASSES]?.name ?? id;
  }

  async function add(): Promise<void> {
    const name = addName.trim();
    if (!name || busy) return;
    busy = true;
    error = null;
    notice = null;
    try {
      const res = await sendFriendRequest(characterId, name);
      social = res.social;
      notice = res.accepted ? ui.nowFriends : ui.requestSent;
      addName = '';
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  async function respond(requestId: string, accept: boolean): Promise<void> {
    if (busy) return;
    busy = true;
    error = null;
    try {
      social = await respondFriendRequest(characterId, requestId, accept);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  async function remove(otherCharacterId: string): Promise<void> {
    if (busy) return;
    busy = true;
    error = null;
    try {
      social = await removeFriend(characterId, otherCharacterId);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  function whisper(f: FriendView): void {
    startWhisper(f.characterId, f.name);
  }
</script>

<main class="mx-auto max-w-2xl">
  <a href={`/characters/${characterId}`} class="text-sm text-[var(--text-dim)] hover:text-[var(--gold)]">{ui.back}</a>
  <h1 class="mt-3 font-display text-2xl font-bold text-[var(--gold-bright)]">{ui.title}</h1>

  {#if loading}
    <p class="mt-6 text-[var(--text-faint)]">Loading…</p>
  {:else if social}
    {@const s = social}

    <!-- Add friend -->
    <form
      class="mt-5 flex gap-2"
      onsubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <input bind:value={addName} maxlength="16" placeholder={ui.addPlaceholder} class="input flex-1" />
      <button type="submit" disabled={busy || addName.trim().length === 0} class="btn btn-primary">
        {busy ? ui.adding : ui.add}
      </button>
    </form>

    {#if notice}<p class="mt-3 text-sm text-[var(--success)]">{notice}</p>{/if}
    {#if error}<p class="mt-3 text-sm text-[var(--danger)]">{error}</p>{/if}

    <!-- Incoming requests -->
    {#if s.incoming.length > 0}
      <section class="mt-6">
        <h2 class="panel-title text-sm">{ui.incoming}</h2>
        <ul class="mt-2 space-y-2">
          {#each s.incoming as r (r.requestId)}
            <li class="panel flex items-center justify-between px-4 py-2">
              <span class="text-[var(--text)]">
                {r.name}
                <span class="text-xs text-[var(--text-faint)]">· {ui.level} {r.level} {className(r.class)}</span>
              </span>
              <span class="flex gap-2">
                <button onclick={() => respond(r.requestId, true)} disabled={busy} class="btn btn-sm btn-primary">{ui.accept}</button>
                <button onclick={() => respond(r.requestId, false)} disabled={busy} class="btn btn-sm">{ui.decline}</button>
              </span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <!-- Friends list -->
    <section class="mt-6">
      <h2 class="panel-title text-sm">
        {ui.friends} <span class="text-[var(--text-faint)]">({onlineCount}/{s.friends.length} {ui.online.toLowerCase()})</span>
      </h2>
      {#if s.friends.length === 0}
        <p class="mt-2 text-sm text-[var(--text-dim)]">{ui.noFriends}</p>
      {:else}
        <ul class="mt-2 space-y-2">
          {#each s.friends as f (f.characterId)}
            <li class="panel flex items-center gap-3 px-3 py-2 {f.online ? '' : 'opacity-60'}">
              <span class="relative shrink-0">
                <Avatar name={f.name} race={f.race} klass={f.class} size={32} showEmblem={false} />
                <span
                  class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[var(--bg)]"
                  style={`background:${f.online ? 'var(--success)' : 'var(--text-faint)'}`}
                  title={f.online ? ui.online : ui.offline}
                ></span>
              </span>
              <button class="min-w-0 flex-1 text-left" onclick={() => openProfile(f.characterId, f.name)}>
                <span class="block truncate font-medium" style={`color:${CLASS_COLOR[f.class] ?? 'var(--text)'}`}>{f.name}</span>
                <span class="block text-xs text-[var(--text-faint)]">{ui.level} {f.level} {className(f.class)}</span>
              </button>
              <span class="flex shrink-0 gap-1.5">
                <button onclick={() => whisper(f)} class="btn btn-sm" title={ui.whisper}>💬</button>
                <button onclick={() => openProfile(f.characterId, f.name)} class="btn btn-sm">{ui.inspect}</button>
                <button onclick={() => remove(f.characterId)} disabled={busy} class="btn btn-sm" title={ui.remove}>✕</button>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <!-- Outgoing requests -->
    {#if s.outgoing.length > 0}
      <section class="mt-6">
        <h2 class="panel-title text-sm">{ui.outgoing}</h2>
        <ul class="mt-2 space-y-2">
          {#each s.outgoing as r (r.requestId)}
            <li class="panel flex items-center justify-between px-4 py-2 text-[var(--text-dim)]">
              <span>{r.name} <span class="text-xs text-[var(--text-faint)]">· {ui.awaiting}</span></span>
              <button onclick={() => remove(r.characterId)} disabled={busy} class="btn btn-sm">{ui.cancel}</button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <!-- Global chat -->
    <section class="mt-8">
      <h2 class="panel-title text-sm">{ui.chat}</h2>
      <ul bind:this={chatList} class="panel mt-2 h-64 space-y-1 overflow-y-auto p-3 text-sm">
        {#each messages as m (m.id)}
          <li>
            {#if m.characterId}
              <button class="font-medium text-[var(--info)] hover:underline" onclick={() => openProfile(m.characterId!, m.name)}>{m.name}</button>
            {:else}
              <span class="font-medium text-[var(--text-faint)]">{m.name}</span>
            {/if}
            <span class="text-[var(--text-dim)]">{m.body}</span>
          </li>
        {/each}
        {#if messages.length === 0}
          <li class="text-[var(--text-faint)]">{ui.empty}</li>
        {/if}
      </ul>
      <form
        class="mt-2 flex gap-2"
        onsubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input bind:value={chatInput} maxlength="256" placeholder={ui.chatPlaceholder} class="input flex-1" />
        <button type="submit" disabled={chatInput.trim().length === 0} class="btn btn-primary">{ui.send}</button>
      </form>
      {#if chatError}<p class="mt-2 text-sm text-[var(--danger)]">{chatError}</p>{/if}
    </section>
  {:else if error}
    <p class="mt-6 text-[var(--danger)]">{error}</p>
  {/if}
</main>
