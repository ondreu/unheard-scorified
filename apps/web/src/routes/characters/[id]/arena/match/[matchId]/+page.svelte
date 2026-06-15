<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import type { Socket } from 'socket.io-client';
  import { ApiError, getArenaMatch, type ArenaMatchView, type CombatEvent } from '$lib/api';
  import { connectArena, watchMatch } from '$lib/arena-socket';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    back: '← Back to arena',
    vs: 'vs',
    fighting: 'Fighting…',
    win: '🏆 Victory!',
    loss: '☠️ Defeat',
    rating: 'Rating',
  };

  let match = $state<ArenaMatchView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const characterId = $derived($page.params.id ?? '');
  const matchId = $derived($page.params.matchId ?? '');
  let socket: Socket | undefined;
  let stop: (() => void) | undefined;

  onMount(async () => {
    // Initial load via REST (authoritative), then live stream over WebSocket.
    try {
      match = await getArenaMatch(characterId, matchId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await goto('/login');
        return;
      }
      error = (err as Error).message;
    } finally {
      loading = false;
    }

    socket = connectArena();
    stop = watchMatch(
      socket,
      characterId,
      matchId,
      (view) => {
        match = view;
      },
      (msg) => {
        error = msg;
      },
    );
  });

  onDestroy(() => {
    stop?.();
    socket?.disconnect();
  });

  function eventClass(e: CombatEvent): string {
    if (e.type === 'victory') return 'text-emerald-300 font-semibold';
    if (e.type === 'player_defeated') return 'text-red-400 font-semibold';
    if (e.type === 'encounter_start') return 'text-amber-300 font-semibold';
    if (e.type === 'ability') return 'text-sky-300';
    if (e.source === match?.me.name) return 'text-amber-100/90';
    return 'text-stone-300/80';
  }
</script>

<main class="mx-auto max-w-lg px-6 py-12">
  <a href={`/characters/${characterId}/arena`} class="text-sm text-amber-300 underline">{ui.back}</a>

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if error && !match}
    <p class="mt-6 text-red-400">{error}</p>
  {:else if match}
    {@const m = match}
    <h1 class="mt-4 text-2xl font-bold text-amber-200">
      {m.me.name} <span class="text-amber-100/50">{ui.vs}</span> {m.opponent.name}
    </h1>

    {#if error}<p class="mt-3 text-red-400">{error}</p>{/if}

    <!-- Progress -->
    <div class="mt-4 h-2 w-full overflow-hidden rounded bg-black/40">
      <div
        class="h-full bg-red-500 transition-all"
        style={`width: ${Math.round(m.progress.progress * 100)}%`}
      ></div>
    </div>

    <!-- Outcome -->
    {#if m.progress.completed && m.outcome}
      <div class="mt-4 flex items-center justify-between">
        <span class="text-lg font-bold {m.outcome === 'win' ? 'text-emerald-300' : 'text-red-400'}">
          {m.outcome === 'win' ? ui.win : ui.loss}
        </span>
        <span class="font-mono {m.ratingDelta >= 0 ? 'text-emerald-300' : 'text-red-400'}">
          {ui.rating}: {m.ratingDelta >= 0 ? '+' : ''}{m.ratingDelta} → {m.ratingAfter}
        </span>
      </div>
    {:else}
      <p class="mt-3 text-sm text-amber-100/60">{ui.fighting}</p>
    {/if}

    <!-- Combat log -->
    <section class="mt-4 rounded-lg border border-amber-900/40 bg-black/30 p-4">
      <ul class="space-y-1 font-mono text-xs">
        {#each [...m.events].reverse() as e, i (m.events.length - 1 - i)}
          <li class={eventClass(e)}>
            <span class="text-stone-500">{e.t.toFixed(1)}s</span>
            {e.message}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</main>
