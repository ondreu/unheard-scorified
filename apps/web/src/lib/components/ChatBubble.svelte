<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import type { Socket } from 'socket.io-client';
  import { getChatHistory, sendChatMessage, type ChatMessageView } from '$lib/api';
  import {
    connectSocial,
    joinChat,
    sendChat,
    sendWhisper,
    subscribeSocial,
    type WhisperEvent,
  } from '$lib/social-socket';
  import { openProfile, whisperTarget } from '$lib/ui-stores';

  const ui = {
    title: 'Chat',
    placeholder: 'Say something…',
    send: 'Send',
    empty: 'No messages yet. Say hello!',
    open: 'Open chat',
    whisperTo: (n: string) => `Whisper to ${n}`,
    backToGlobal: 'Back to global chat',
    offline: (n: string) => `${n} is offline — send them Mail instead.`,
  };

  let { viewerId, viewerName }: { viewerId: string; viewerName: string } = $props();

  type Line = {
    id: string;
    kind: 'chat' | 'whisper-in' | 'whisper-out' | 'system';
    name: string;
    characterId: string | null;
    body: string;
  };

  let open = $state(false);
  let lines = $state<Line[]>([]);
  let input = $state('');
  let error = $state<string | null>(null);
  let unread = $state(0);
  let listEl = $state<HTMLUListElement | null>(null);
  let inputEl = $state<HTMLInputElement | null>(null);

  // Whisper compose target (null = global chat).
  let whisperTo = $state<{ characterId: string; name: string } | null>(null);

  let socket: Socket | undefined;
  let unsubChat: (() => void) | undefined;
  let unsubSocial: (() => void) | undefined;
  let nextId = 0;

  onMount(() => {
    socket = connectSocial();
    unsubChat = joinChat(
      socket,
      viewerId,
      (m) => void appendChat(m),
      (history) => {
        lines = history.slice(-50).map(toChatLine);
        void scroll();
      },
    );
    // Join our character room (whisper delivery) + listen for whispers.
    unsubSocial = subscribeSocial(socket, viewerId, { onWhisper: (w) => void appendWhisper(w) });
  });

  onDestroy(() => {
    unsubChat?.();
    unsubSocial?.();
    socket?.disconnect();
  });

  // PlayerProfile "Whisper" → open bubble in whisper mode.
  $effect(() => {
    const t = $whisperTarget;
    if (t) {
      whisperTo = t;
      open = true;
      whisperTarget.set(null);
      void focusInput();
    }
  });

  function toChatLine(m: ChatMessageView): Line {
    return { id: m.id, kind: 'chat', name: m.name, characterId: m.characterId, body: m.body };
  }

  function push(line: Line, countUnread = true): void {
    lines = [...lines, line].slice(-60);
    if (countUnread && !open) unread += 1;
    void scroll();
  }

  async function appendChat(m: ChatMessageView): Promise<void> {
    if (lines.some((x) => x.id === m.id)) return;
    push(toChatLine(m), m.characterId !== viewerId);
  }

  function appendWhisper(w: WhisperEvent): void {
    push({
      id: `w-${nextId++}`,
      kind: 'whisper-in',
      name: w.fromName,
      characterId: w.fromCharacterId,
      body: w.body,
    });
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
      unread = 0;
      void scroll();
    }
  }

  function clearWhisper(): void {
    whisperTo = null;
  }

  async function send(): Promise<void> {
    const body = input.trim();
    if (!body) return;
    error = null;
    const prev = input;
    input = '';
    try {
      if (whisperTo) {
        if (!socket?.connected) throw new Error('Not connected');
        const { delivered } = await sendWhisper(socket, viewerId, whisperTo.characterId, body);
        push(
          { id: `w-${nextId++}`, kind: 'whisper-out', name: whisperTo.name, characterId: whisperTo.characterId, body },
          false,
        );
        if (!delivered) {
          push(
            { id: `s-${nextId++}`, kind: 'system', name: '', characterId: null, body: ui.offline(whisperTo.name) },
            false,
          );
        }
      } else if (socket?.connected) {
        await sendChat(socket, viewerId, body);
      } else {
        await sendChatMessage(viewerId, body);
        lines = (await getChatHistory(viewerId)).slice(-50).map(toChatLine);
        await scroll();
      }
    } catch (err) {
      error = (err as Error).message;
      input = prev;
    }
  }
</script>

<div class="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
  {#if open}
    <div class="panel flex h-96 w-80 max-w-[calc(100vw-2rem)] flex-col">
      <div class="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <span class="panel-title text-sm">
          {#if whisperTo}💬 {ui.whisperTo(whisperTo.name)}{:else}{ui.title}{/if}
        </span>
        <div class="flex items-center gap-2">
          {#if whisperTo}
            <button class="text-xs text-[var(--text-faint)] hover:text-[var(--text)]" onclick={clearWhisper} title={ui.backToGlobal}># global</button>
          {/if}
          <button class="text-[var(--text-faint)] hover:text-[var(--text)]" onclick={toggle}>✕</button>
        </div>
      </div>
      <ul bind:this={listEl} class="flex-1 space-y-1 overflow-y-auto px-3 py-2 text-sm">
        {#each lines as m (m.id)}
          <li class="leading-snug">
            {#if m.kind === 'system'}
              <span class="text-xs italic text-[var(--text-faint)]">{m.body}</span>
            {:else}
              {#if m.kind === 'whisper-in'}<span class="text-[var(--r-epic)]">[from]</span>{/if}
              {#if m.kind === 'whisper-out'}<span class="text-[var(--r-epic)]">[to]</span>{/if}
              {#if m.characterId}
                <button
                  class="font-semibold hover:underline {m.kind === 'chat' ? 'text-[var(--info)]' : 'text-[var(--r-epic)]'}"
                  onclick={() => openProfile(m.characterId!, m.name)}>{m.name}</button
                >
              {:else}
                <span class="font-semibold text-[var(--text-faint)]">{m.name}</span>
              {/if}
              <span class="text-[var(--text-dim)]">{m.body}</span>
            {/if}
          </li>
        {/each}
        {#if lines.length === 0}
          <li class="text-[var(--text-faint)]">{ui.empty}</li>
        {/if}
      </ul>
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
          placeholder={whisperTo ? ui.whisperTo(whisperTo.name) : ui.placeholder}
          class="input"
        />
        <button class="btn btn-primary btn-sm" type="submit" disabled={input.trim().length === 0}>
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
    {#if unread > 0 && !open}
      <span
        class="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--danger)] px-1 text-xs font-bold text-white"
        >{unread > 9 ? '9+' : unread}</span
      >
    {/if}
  </button>
</div>
