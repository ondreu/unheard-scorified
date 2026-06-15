<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import type { Socket } from 'socket.io-client';
  import { getChatHistory, sendChatMessage, type ChatMessageView } from '$lib/api';
  import { connectSocial, joinChat, sendChat } from '$lib/social-socket';
  import { chatPrefill, openProfile } from '$lib/ui-stores';

  const ui = {
    title: 'Global chat',
    placeholder: 'Say something…',
    send: 'Send',
    empty: 'No messages yet. Say hello!',
    open: 'Open chat',
  };

  let { viewerId, viewerName }: { viewerId: string; viewerName: string } = $props();

  let open = $state(false);
  let messages = $state<ChatMessageView[]>([]);
  let input = $state('');
  let error = $state<string | null>(null);
  let unread = $state(0);
  let listEl = $state<HTMLUListElement | null>(null);
  let inputEl = $state<HTMLInputElement | null>(null);

  let socket: Socket | undefined;
  let unsub: (() => void) | undefined;

  onMount(() => {
    socket = connectSocial();
    unsub = joinChat(
      socket,
      viewerId,
      (m) => void append(m),
      (history) => {
        messages = history.slice(-50);
        void scroll();
      },
    );
  });

  onDestroy(() => {
    unsub?.();
    socket?.disconnect();
  });

  // Whisper prefill from PlayerProfile → open bubble focused with "@Name ".
  $effect(() => {
    const text = $chatPrefill;
    if (text !== null) {
      open = true;
      input = text;
      chatPrefill.set(null);
      void focusInput();
    }
  });

  async function append(m: ChatMessageView): Promise<void> {
    if (messages.some((x) => x.id === m.id)) return;
    messages = [...messages, m].slice(-50);
    if (!open && m.characterId !== viewerId) unread += 1;
    await scroll();
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

  async function send(): Promise<void> {
    const body = input.trim();
    if (!body) return;
    error = null;
    const prev = input;
    input = '';
    try {
      if (socket?.connected) {
        await sendChat(socket, viewerId, body);
      } else {
        await sendChatMessage(viewerId, body);
        messages = (await getChatHistory(viewerId)).slice(-50);
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
        <span class="panel-title text-sm">{ui.title}</span>
        <button class="text-[var(--text-faint)] hover:text-[var(--text)]" onclick={toggle}>✕</button>
      </div>
      <ul bind:this={listEl} class="flex-1 space-y-1 overflow-y-auto px-3 py-2 text-sm">
        {#each messages as m (m.id)}
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
        {#if messages.length === 0}
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
          placeholder={ui.placeholder}
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
