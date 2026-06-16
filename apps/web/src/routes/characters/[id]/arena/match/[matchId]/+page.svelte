<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import type { Socket } from 'socket.io-client';
  import { ApiError, getArenaMatch, type ArenaMatchView, type CombatEvent } from '$lib/api';
  import { connectArena, watchMatch } from '$lib/arena-socket';
  import CombatMeters from '$lib/components/CombatMeters.svelte';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
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
    if (e.type === 'victory') return 'text-[var(--success)] font-semibold';
    if (e.type === 'player_defeated') return 'text-[var(--danger)] font-semibold';
    if (e.type === 'encounter_start') return 'text-[var(--gold-bright)] font-semibold';
    if (e.type === 'heal' || e.type === 'drain') return 'text-[var(--success)]';
    if (e.type === 'dot') return 'text-[var(--gold-bright)]';
    if (e.type === 'absorb') return 'text-[var(--info)]';
    if (e.type === 'ability') return 'text-[var(--info)]';
    if (e.source === match?.me.name) return 'text-[var(--text)]';
    return 'text-[var(--text-dim)]';
  }
</script>

<div class="space-y-6">
  {#if loading}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {:else if error && !match}
    <p class="text-[var(--danger)]">{error}</p>
  {:else if match}
    {@const m = match}
    <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">
      {m.me.name} <span class="text-[var(--text-faint)]">{ui.vs}</span> {m.opponent.name}
    </h1>

    {#if error}<p class="text-[var(--danger)]">{error}</p>{/if}

    <!-- Progress -->
    <div class="bar">
      <div class="bar-fill" style={`width:${Math.round(m.progress.progress * 100)}%`}></div>
    </div>

    <!-- Outcome -->
    {#if m.progress.completed && m.outcome}
      <div class="flex items-center justify-between">
        <span class="text-lg font-bold {m.outcome === 'win' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}">
          {m.outcome === 'win' ? ui.win : ui.loss}
        </span>
        <span class="font-mono {m.ratingDelta >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}">
          {ui.rating}: {m.ratingDelta >= 0 ? '+' : ''}{m.ratingDelta} → {m.ratingAfter}
        </span>
      </div>
    {:else}
      <p class="text-sm text-[var(--text-dim)]">{ui.fighting}</p>
    {/if}

    <CombatMeters events={m.events} names={[m.me.name, m.opponent.name]} />

    <!-- Combat log -->
    <section class="panel panel-pad">
      <ul class="space-y-1 font-mono text-xs">
        {#each [...m.events].reverse() as e, i (m.events.length - 1 - i)}
          <li class={eventClass(e)}>
            <span class="text-[var(--text-faint)]">{e.t.toFixed(1)}s</span>
            {e.message}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>
