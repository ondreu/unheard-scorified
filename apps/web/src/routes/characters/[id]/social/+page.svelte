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
    type SocialView,
  } from '$lib/api';
  import { connectSocial, joinChat, sendChat, subscribeSocial } from '$lib/social-socket';
  import { CLASSES } from '@game/shared';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    back: '← Back to character',
    title: 'Friends',
    addPlaceholder: 'Character name…',
    add: 'Add friend',
    adding: 'Sending…',
    friends: 'Friends',
    noFriends: 'No friends yet. Add someone by their character name.',
    incoming: 'Friend requests',
    outgoing: 'Pending requests',
    accept: 'Accept',
    decline: 'Decline',
    cancel: 'Cancel',
    remove: 'Remove',
    trade: 'Trade',
    nowFriends: 'You are now friends!',
    requestSent: 'Friend request sent.',
    level: 'Lv',
    chat: 'Global chat',
    chatPlaceholder: 'Say something…',
    send: 'Send',
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
    });
    unsubChat = joinChat(
      socket,
      characterId,
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
        await sendChat(socket, characterId, body);
      } else {
        // REST fallback (no live socket): send + refresh history.
        await sendChatMessage(characterId, body);
        messages = await getChatHistory(characterId);
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
</script>

<main class="mx-auto max-w-lg px-6 py-12">
  <a href={`/characters/${characterId}`} class="text-sm text-amber-300 underline">{ui.back}</a>
  <h1 class="mt-4 text-3xl font-bold text-amber-200">{ui.title}</h1>

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if social}
    {@const s = social}

    <!-- Add friend -->
    <form
      class="mt-6 flex gap-2"
      onsubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <input
        bind:value={addName}
        maxlength="16"
        placeholder={ui.addPlaceholder}
        class="flex-1 rounded border border-amber-900/50 bg-black/30 px-3 py-2 text-sm text-amber-100 placeholder:text-amber-100/30"
      />
      <button
        type="submit"
        disabled={busy || addName.trim().length === 0}
        class="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-black hover:bg-amber-500 disabled:opacity-40"
      >
        {busy ? ui.adding : ui.add}
      </button>
    </form>

    {#if notice}
      <p class="mt-3 text-sm text-emerald-300">{notice}</p>
    {/if}
    {#if error}
      <p class="mt-3 text-sm text-red-400">{error}</p>
    {/if}

    <!-- Incoming requests -->
    {#if s.incoming.length > 0}
      <section class="mt-6">
        <h2 class="text-lg font-semibold text-amber-200">{ui.incoming}</h2>
        <ul class="mt-2 space-y-2">
          {#each s.incoming as r (r.requestId)}
            <li
              class="flex items-center justify-between rounded border border-amber-900/40 bg-black/20 px-4 py-2"
            >
              <span class="text-amber-100">
                {r.name}
                <span class="text-xs text-amber-100/50">· {ui.level} {r.level} {className(r.class)}</span>
              </span>
              <span class="flex gap-2">
                <button
                  onclick={() => respond(r.requestId, true)}
                  disabled={busy}
                  class="rounded bg-emerald-700/60 px-3 py-1 text-xs font-medium text-emerald-100 hover:bg-emerald-600/60 disabled:opacity-40"
                >
                  {ui.accept}
                </button>
                <button
                  onclick={() => respond(r.requestId, false)}
                  disabled={busy}
                  class="rounded border border-amber-900/50 px-3 py-1 text-xs text-amber-100/70 hover:border-red-700/60 hover:text-red-400 disabled:opacity-40"
                >
                  {ui.decline}
                </button>
              </span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <!-- Friends list -->
    <section class="mt-6">
      <h2 class="text-lg font-semibold text-amber-200">{ui.friends} ({s.friends.length})</h2>
      {#if s.friends.length === 0}
        <p class="mt-2 text-sm text-amber-100/60">{ui.noFriends}</p>
      {:else}
        <ul class="mt-2 space-y-2">
          {#each s.friends as f (f.characterId)}
            <li
              class="flex items-center justify-between rounded border border-amber-900/40 bg-black/20 px-4 py-2"
            >
              <span class="text-amber-100">
                {f.name}
                <span class="text-xs text-amber-100/50">· {ui.level} {f.level} {className(f.class)}</span>
              </span>
              <span class="flex gap-2">
                <a
                  href={`/characters/${characterId}/trade?with=${encodeURIComponent(f.name)}`}
                  class="rounded border border-amber-900/50 px-3 py-1 text-xs text-sky-300 hover:border-sky-600"
                >
                  {ui.trade}
                </a>
                <button
                  onclick={() => remove(f.characterId)}
                  disabled={busy}
                  class="rounded border border-amber-900/50 px-3 py-1 text-xs text-amber-100/60 hover:border-red-700/60 hover:text-red-400 disabled:opacity-40"
                >
                  {ui.remove}
                </button>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <!-- Outgoing requests -->
    {#if s.outgoing.length > 0}
      <section class="mt-6">
        <h2 class="text-lg font-semibold text-amber-200">{ui.outgoing}</h2>
        <ul class="mt-2 space-y-2">
          {#each s.outgoing as r (r.requestId)}
            <li
              class="flex items-center justify-between rounded border border-amber-900/40 bg-black/20 px-4 py-2 text-amber-100/70"
            >
              <span>{r.name} <span class="text-xs text-amber-100/40">· awaiting reply</span></span>
              <button
                onclick={() => remove(r.characterId)}
                disabled={busy}
                class="rounded border border-amber-900/50 px-3 py-1 text-xs text-amber-100/60 hover:border-red-700/60 hover:text-red-400 disabled:opacity-40"
              >
                {ui.cancel}
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
    <!-- Global chat -->
    <section class="mt-8">
      <h2 class="text-lg font-semibold text-amber-200">{ui.chat}</h2>
      <ul
        bind:this={chatList}
        class="mt-2 h-64 space-y-1 overflow-y-auto rounded border border-amber-900/40 bg-black/30 p-3 text-sm"
      >
        {#each messages as m (m.id)}
          <li>
            <span class="font-medium text-sky-300">{m.name}</span>
            <span class="text-amber-100/90">{m.body}</span>
          </li>
        {/each}
        {#if messages.length === 0}
          <li class="text-amber-100/40">No messages yet. Say hello!</li>
        {/if}
      </ul>
      <form
        class="mt-2 flex gap-2"
        onsubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          bind:value={chatInput}
          maxlength="256"
          placeholder={ui.chatPlaceholder}
          class="flex-1 rounded border border-amber-900/50 bg-black/30 px-3 py-2 text-sm text-amber-100 placeholder:text-amber-100/30"
        />
        <button
          type="submit"
          disabled={chatInput.trim().length === 0}
          class="rounded bg-sky-700/70 px-4 py-2 text-sm font-medium text-sky-100 hover:bg-sky-600/70 disabled:opacity-40"
        >
          {ui.send}
        </button>
      </form>
      {#if chatError}
        <p class="mt-2 text-sm text-red-400">{chatError}</p>
      {/if}
    </section>
  {:else if error}
    <p class="mt-6 text-red-400">{error}</p>
  {/if}
</main>
