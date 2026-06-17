<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import type { Socket } from 'socket.io-client';
  import {
    getChatHistory,
    getGuild,
    sendChatMessage,
    type ChatMessageView,
  } from '$lib/api';
  import {
    connectSocial,
    joinChat,
    sendChat,
    sendWhisper,
    subscribeSocial,
    type ChatChannel,
    type WhisperEvent,
  } from '$lib/social-socket';
  import { openProfile, whisperTarget } from '$lib/ui-stores';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Chat',
    tabGlobal: 'Global',
    tabGuild: 'Guild',
    tabWhispers: 'Whispers',
    placeholderGlobal: 'Say something…',
    placeholderGuild: 'Message your guild…',
    send: 'Send',
    emptyGlobal: 'No messages yet. Say hello!',
    emptyGuild: 'Guild channel is quiet. Break the silence!',
    emptyWhispers: 'No whispers yet. Open a player’s profile to whisper them.',
    open: 'Open chat',
    whisperTo: (n: string) => `Whisper to ${n}`,
    backToWhispers: '‹ Whispers',
    offline: (n: string) => `${n} is offline — send them Mail instead.`,
    noGuild: 'Join a guild to use this channel.',
  };

  let { viewerId, viewerName }: { viewerId: string; viewerName: string } = $props();

  type Tab = 'global' | 'guild' | 'whisper';

  type Line = {
    id: string;
    name: string;
    characterId: string | null;
    body: string;
  };
  type WLine = { id: string; dir: 'in' | 'out' | 'system'; body: string };
  type Convo = { characterId: string; name: string; lines: WLine[]; unread: number };

  let open = $state(false);
  let tab = $state<Tab>('global');
  let input = $state('');
  let error = $state<string | null>(null);
  let listEl = $state<HTMLUListElement | null>(null);
  let inputEl = $state<HTMLInputElement | null>(null);

  // Persisted channels.
  let globalLines = $state<Line[]>([]);
  let guildLines = $state<Line[]>([]);
  let hasGuild = $state(false);

  // Whisper conversations (per other character).
  let convos = $state<Record<string, Convo>>({});
  let activeWhisper = $state<string | null>(null);

  // Per-tab unread counters (only counted while panel closed or other tab active).
  let unreadGlobal = $state(0);
  let unreadGuild = $state(0);

  let socket: Socket | undefined;
  let unsubGlobal: (() => void) | undefined;
  let unsubGuild: (() => void) | undefined;
  let unsubSocial: (() => void) | undefined;
  let nextId = 0;

  const unreadWhisper = $derived(
    Object.values(convos).reduce((sum, c) => sum + c.unread, 0),
  );
  const totalUnread = $derived(unreadGlobal + unreadGuild + unreadWhisper);
  const activeConvo = $derived(activeWhisper ? convos[activeWhisper] : undefined);

  onMount(async () => {
    socket = connectSocial();
    unsubGlobal = joinChat(
      socket,
      viewerId,
      'global',
      (m) => appendChat('global', m),
      (history) => {
        globalLines = history.slice(-50).map(toLine);
        void scroll();
      },
    );
    unsubSocial = subscribeSocial(socket, viewerId, { onWhisper: (w) => appendWhisper(w) });
    // Guild tab only if the character belongs to a guild.
    try {
      const g = await getGuild(viewerId);
      hasGuild = !!g.guild;
      if (hasGuild) joinGuild();
    } catch {
      hasGuild = false;
    }
  });

  onDestroy(() => {
    unsubGlobal?.();
    unsubGuild?.();
    unsubSocial?.();
    socket?.disconnect();
  });

  function joinGuild(): void {
    if (!socket) return;
    unsubGuild?.();
    unsubGuild = joinChat(
      socket,
      viewerId,
      'guild',
      (m) => appendChat('guild', m),
      (history) => {
        guildLines = history.slice(-50).map(toLine);
        if (tab === 'guild') void scroll();
      },
    );
  }

  // PlayerProfile "Whisper" → open bubble on the whisper conversation.
  $effect(() => {
    const t = $whisperTarget;
    if (t) {
      ensureConvo(t.characterId, t.name);
      activeWhisper = t.characterId;
      tab = 'whisper';
      open = true;
      whisperTarget.set(null);
      clearUnread(t.characterId);
      void focusInput();
    }
  });

  function toLine(m: ChatMessageView): Line {
    return { id: m.id, name: m.name, characterId: m.characterId, body: m.body };
  }

  function appendChat(channel: ChatChannel, m: ChatMessageView): void {
    const isGuild = channel === 'guild';
    const lines = isGuild ? guildLines : globalLines;
    if (lines.some((x) => x.id === m.id)) return;
    const next = [...lines, toLine(m)].slice(-80);
    if (isGuild) guildLines = next;
    else globalLines = next;
    // Count unread unless this is our own message and we're already watching it.
    const watching = open && ((isGuild && tab === 'guild') || (!isGuild && tab === 'global'));
    if (!watching && m.characterId !== viewerId) {
      if (isGuild) unreadGuild += 1;
      else unreadGlobal += 1;
    }
    if (watching) void scroll();
  }

  function ensureConvo(characterId: string, name: string): Convo {
    let c = convos[characterId];
    if (!c) {
      c = { characterId, name, lines: [], unread: 0 };
      convos = { ...convos, [characterId]: c };
    }
    return convos[characterId]!;
  }

  function clearUnread(characterId: string): void {
    const c = convos[characterId];
    if (c && c.unread > 0) convos = { ...convos, [characterId]: { ...c, unread: 0 } };
  }

  function pushWhisper(characterId: string, name: string, line: WLine, countUnread: boolean): void {
    const c = ensureConvo(characterId, name);
    const watching = open && tab === 'whisper' && activeWhisper === characterId;
    convos = {
      ...convos,
      [characterId]: {
        ...c,
        name,
        lines: [...c.lines, line].slice(-80),
        unread: countUnread && !watching ? c.unread + 1 : c.unread,
      },
    };
    if (watching) void scroll();
  }

  function appendWhisper(w: WhisperEvent): void {
    pushWhisper(
      w.fromCharacterId,
      w.fromName,
      { id: `w-${nextId++}`, dir: 'in', body: w.body },
      true,
    );
  }

  async function scroll(): Promise<void> {
    await tick();
    if (open && listEl) listEl.scrollTop = listEl.scrollHeight;
  }

  async function focusInput(): Promise<void> {
    await tick();
    inputEl?.focus();
  }

  function toggle(): void {
    open = !open;
    if (open) {
      markRead();
      void scroll();
    }
  }

  function selectTab(t: Tab): void {
    tab = t;
    markRead();
    void scroll();
    void focusInput();
  }

  function markRead(): void {
    if (!open) return;
    if (tab === 'global') unreadGlobal = 0;
    else if (tab === 'guild') unreadGuild = 0;
    else if (tab === 'whisper' && activeWhisper) clearUnread(activeWhisper);
  }

  function openConvo(characterId: string): void {
    activeWhisper = characterId;
    clearUnread(characterId);
    void scroll();
    void focusInput();
  }

  function placeholder(): string {
    if (tab === 'guild') return ui.placeholderGuild;
    if (tab === 'whisper' && activeConvo) return ui.whisperTo(activeConvo.name);
    return ui.placeholderGlobal;
  }

  const canSend = $derived(
    input.trim().length > 0 && !(tab === 'whisper' && !activeWhisper),
  );

  async function send(): Promise<void> {
    const body = input.trim();
    if (!body || !canSend) return;
    error = null;
    const prev = input;
    input = '';
    try {
      if (tab === 'whisper') {
        const convo = activeConvo;
        if (!convo) return;
        if (!socket?.connected) throw new Error('Not connected');
        const { delivered } = await sendWhisper(socket, viewerId, convo.characterId, body);
        pushWhisper(convo.characterId, convo.name, { id: `w-${nextId++}`, dir: 'out', body }, false);
        if (!delivered) {
          pushWhisper(
            convo.characterId,
            convo.name,
            { id: `s-${nextId++}`, dir: 'system', body: ui.offline(convo.name) },
            false,
          );
        }
      } else {
        const channel: ChatChannel = tab === 'guild' ? 'guild' : 'global';
        if (socket?.connected) {
          await sendChat(socket, viewerId, body, channel);
        } else {
          // REST fallback (no live socket): send + refresh history.
          await sendChatMessage(viewerId, body, channel);
          const history = (await getChatHistory(viewerId, channel)).slice(-50).map(toLine);
          if (channel === 'guild') guildLines = history;
          else globalLines = history;
          await scroll();
        }
      }
    } catch (err) {
      error = (err as Error).message;
      input = prev;
    }
  }

  const tabUnread = (t: Tab): number =>
    t === 'global' ? unreadGlobal : t === 'guild' ? unreadGuild : unreadWhisper;
</script>

<div class="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
  {#if open}
    <div class="panel flex h-[26rem] w-80 max-w-[calc(100vw-2rem)] flex-col">
      <!-- Header + tabs -->
      <div class="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <span class="panel-title text-sm">{ui.title}</span>
        <button class="text-[var(--text-faint)] hover:text-[var(--text)]" onclick={toggle}>✕</button>
      </div>
      <div class="flex gap-1 border-b border-[var(--border)] px-2 py-1.5 text-xs">
        {#each [{ id: 'global', label: ui.tabGlobal }, ...(hasGuild ? [{ id: 'guild', label: ui.tabGuild }] : []), { id: 'whisper', label: ui.tabWhispers }] as t (t.id)}
          <button
            class="relative rounded-md px-2.5 py-1 font-medium transition {tab === t.id
              ? 'bg-[var(--surface-raised)] text-[var(--gold-bright)]'
              : 'text-[var(--text-dim)] hover:text-[var(--text)]'}"
            onclick={() => selectTab(t.id as Tab)}
          >
            {t.label}
            {#if tabUnread(t.id as Tab) > 0 && tab !== t.id}
              <span
                class="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold text-white"
                >{tabUnread(t.id as Tab) > 9 ? '9+' : tabUnread(t.id as Tab)}</span
              >
            {/if}
          </button>
        {/each}
      </div>

      <!-- Message area -->
      {#if tab === 'whisper' && !activeWhisper}
        <!-- Whisper conversation list -->
        <ul class="flex-1 space-y-1 overflow-y-auto px-2 py-2 text-sm">
          {#each Object.values(convos) as c (c.characterId)}
            <li>
              <button
                class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-[var(--surface-raised)]"
                onclick={() => openConvo(c.characterId)}
              >
                <span class="truncate font-medium text-[var(--info)]">{c.name}</span>
                {#if c.unread > 0}
                  <span
                    class="ml-2 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold text-white"
                    >{c.unread > 9 ? '9+' : c.unread}</span
                  >
                {/if}
              </button>
            </li>
          {/each}
          {#if Object.keys(convos).length === 0}
            <li class="px-2 text-[var(--text-faint)]">{ui.emptyWhispers}</li>
          {/if}
        </ul>
      {:else}
        <ul bind:this={listEl} class="flex-1 space-y-1 overflow-y-auto px-3 py-2 text-sm">
          {#if tab === 'whisper' && activeConvo}
            <li class="mb-1">
              <button
                class="text-xs text-[var(--text-faint)] hover:text-[var(--text)]"
                onclick={() => (activeWhisper = null)}>{ui.backToWhispers}</button
              >
            </li>
            {#each activeConvo.lines as l (l.id)}
              <li class="leading-snug">
                {#if l.dir === 'system'}
                  <span class="text-xs italic text-[var(--text-faint)]">{l.body}</span>
                {:else}
                  <span class="text-[var(--r-epic)]">{l.dir === 'in' ? '[from]' : '[to]'}</span>
                  <span class="text-[var(--text-dim)]">{l.body}</span>
                {/if}
              </li>
            {/each}
          {:else}
            {@const lines = tab === 'guild' ? guildLines : globalLines}
            {#each lines as m (m.id)}
              <li class="leading-snug">
                {#if m.characterId}
                  <button
                    class="font-semibold text-[var(--info)] hover:underline"
                    onclick={() => openProfile(m.characterId!, m.name)}>{m.name}</button
                  >
                {:else}
                  <span class="font-semibold text-[var(--text-faint)]">{m.name}</span>
                {/if}
                <span class="text-[var(--text-dim)]">{m.body}</span>
              </li>
            {/each}
            {#if lines.length === 0}
              <li class="text-[var(--text-faint)]">
                {tab === 'guild' ? ui.emptyGuild : ui.emptyGlobal}
              </li>
            {/if}
          {/if}
        </ul>
      {/if}

      <!-- Composer -->
      <form
        class="flex gap-2 border-t border-[var(--border)] p-2"
        onsubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          bind:this={inputEl}
          bind:value={input}
          maxlength="256"
          placeholder={placeholder()}
          class="input"
          disabled={tab === 'whisper' && !activeWhisper}
        />
        <button class="btn btn-primary btn-sm" type="submit" disabled={!canSend}>
          {ui.send}
        </button>
      </form>
      {#if error}<p class="px-3 pb-2 text-xs text-[var(--danger)]">{error}</p>{/if}
    </div>
  {/if}

  <button
    class="relative grid h-14 w-14 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-raised)] text-2xl shadow-lg transition hover:brightness-110"
    onclick={toggle}
    aria-label={ui.open}
    title={`${ui.title} — ${viewerName}`}
  >
    💬
    {#if totalUnread > 0 && !open}
      <span
        class="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--danger)] px-1 text-xs font-bold text-white"
        >{totalUnread > 9 ? '9+' : totalUnread}</span
      >
    {/if}
  </button>
</div>
