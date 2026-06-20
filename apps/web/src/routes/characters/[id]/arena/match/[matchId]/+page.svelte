<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import type { Socket } from 'socket.io-client';
  import { ApiError, getArenaMatch, type ArenaMatchView } from '$lib/api';
  import { connectArena, watchMatch } from '$lib/arena-socket';
  import CombatMeters from '$lib/components/CombatMeters.svelte';
  import CombatLog from '$lib/components/CombatLog.svelte';
  import { arenaActors } from '$lib/combat-actors';

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

  // Player name → id map so combat-log names open the player card.
  const actors = $derived(match ? arenaActors(match) : {});
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

    <!-- Combat log: player names + abilities are clickable for details. -->
    <CombatLog events={m.events} {actors} />
  {/if}
</div>
