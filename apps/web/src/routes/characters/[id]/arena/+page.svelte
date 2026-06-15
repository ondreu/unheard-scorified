<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import type { Socket } from 'socket.io-client';
  import {
    ApiError,
    getArena,
    leaveArenaQueue,
    queueArena,
    type ArenaView,
  } from '$lib/api';
  import { connectArena, subscribeMatchFound } from '$lib/arena-socket';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    back: '← Back to character',
    title: 'Arena',
    rating: 'Rating',
    rank: 'Rank',
    record: 'Record',
    queue: 'Enter queue',
    queuing: 'Joining…',
    leave: 'Leave queue',
    searching: 'Searching for an opponent…',
    matched: 'Match found! Entering the arena…',
    leaderboard: 'Leaderboard',
    history: 'Recent matches',
    noHistory: 'No matches yet. Enter the queue to fight!',
    ineligible: 'Reach the required level to enter the Arena.',
    nextTier: 'Next tier at',
    win: 'Win',
    loss: 'Loss',
    seasonEnds: 'Season ends',
  };

  let arena = $state<ArenaView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let pending = $state(false);
  let notice = $state<string | null>(null);

  const characterId = $derived($page.params.id ?? '');
  let socket: Socket | undefined;
  let unsub: (() => void) | undefined;

  onMount(async () => {
    await load();
    socket = connectArena();
    unsub = subscribeMatchFound(socket, characterId, (e) => {
      notice = ui.matched;
      void goto(`/characters/${characterId}/arena/match/${e.matchId}`);
    });
  });

  onDestroy(() => {
    unsub?.();
    socket?.disconnect();
  });

  async function load(): Promise<void> {
    loading = true;
    try {
      arena = await getArena(characterId);
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

  async function enterQueue(): Promise<void> {
    pending = true;
    error = null;
    try {
      const res = await queueArena(characterId);
      arena = res.arena;
      if (res.status === 'matched' && res.matchId) {
        notice = ui.matched;
        await goto(`/characters/${characterId}/arena/match/${res.matchId}`);
      } else {
        notice = ui.searching;
      }
    } catch (err) {
      error = (err as Error).message;
    } finally {
      pending = false;
    }
  }

  async function leave(): Promise<void> {
    pending = true;
    error = null;
    try {
      await leaveArenaQueue(characterId);
      notice = null;
      arena = await getArena(characterId);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      pending = false;
    }
  }

  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }
</script>

<main class="mx-auto max-w-lg px-6 py-12">
  <a href={`/characters/${characterId}`} class="text-sm text-amber-300 underline">{ui.back}</a>

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if error && !arena}
    <p class="mt-6 text-red-400">{error}</p>
  {:else if arena}
    {@const a = arena}
    <div class="mt-4 flex items-center justify-between">
      <h1 class="text-3xl font-bold text-amber-200">⚔️ {ui.title}</h1>
      <a
        href={`/characters/${characterId}/team-arena`}
        class="rounded bg-red-800/40 px-3 py-1.5 text-sm font-medium text-red-200 hover:bg-red-700/50"
      >
        Team Arena →
      </a>
    </div>
    <p class="mt-1 text-sm text-amber-100/60">
      {a.season.name} · {a.bracket} · {ui.seasonEnds} {fmtDate(a.season.endsAt)}
    </p>

    {#if error}
      <p class="mt-4 text-red-400">{error}</p>
    {/if}

    <!-- Season reward banner (lazy rollover) -->
    {#each a.newSeasonRewards as reward (reward.seasonId)}
      <section class="mt-4 rounded-lg border border-amber-600/50 bg-amber-900/20 p-4">
        <p class="font-semibold text-amber-300">🏅 {reward.seasonName} reward</p>
        <p class="mt-1 text-sm text-amber-200">
          Finished as <strong>{reward.finalTier}</strong> ({reward.finalRating}) · +{reward.rewardGold} gold
        </p>
      </section>
    {/each}

    <!-- Rating panel -->
    <section class="mt-4 rounded-lg border border-amber-900/40 bg-black/20 p-5">
      <div class="flex items-end justify-between">
        <div>
          <p class="text-3xl font-bold text-amber-200">{a.rating}</p>
          <p class="text-sm text-amber-300">{a.tierName}</p>
        </div>
        <div class="text-right text-sm text-amber-100/70">
          <p>{ui.rank}: {a.rank ?? '—'}</p>
          <p>{ui.record}: <span class="text-emerald-300">{a.wins}W</span> / <span class="text-red-400">{a.losses}L</span></p>
        </div>
      </div>
      {#if a.nextTierAt}
        <p class="mt-2 text-xs text-amber-100/50">{ui.nextTier} {a.nextTierAt}</p>
      {/if}
    </section>

    <!-- Queue control -->
    <section class="mt-4">
      {#if !a.eligible}
        <p class="rounded bg-stone-800/50 px-4 py-3 text-sm text-amber-100/60">
          {ui.ineligible} (Level {a.minLevel})
        </p>
      {:else if a.queued}
        <p class="text-sm text-amber-200">{notice ?? ui.searching}</p>
        <button
          onclick={leave}
          disabled={pending}
          class="mt-2 rounded bg-stone-700 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-stone-600 disabled:opacity-50"
        >
          {ui.leave}
        </button>
      {:else}
        {#if notice}<p class="mb-2 text-sm text-emerald-300">{notice}</p>{/if}
        <button
          onclick={enterQueue}
          disabled={pending}
          class="rounded bg-red-700 px-5 py-2 text-sm font-semibold text-amber-50 hover:bg-red-600 disabled:opacity-50"
        >
          {pending ? ui.queuing : ui.queue}
        </button>
      {/if}
    </section>

    <!-- Leaderboard -->
    <section class="mt-6">
      <h2 class="text-lg font-semibold text-amber-200">{ui.leaderboard}</h2>
      <ul class="mt-2 divide-y divide-amber-900/30 rounded-lg border border-amber-900/40 bg-black/20">
        {#each a.leaderboard as row (row.characterId)}
          <li
            class="flex items-center justify-between px-4 py-2 text-sm {row.isSelf
              ? 'bg-amber-900/20 text-amber-200'
              : 'text-amber-100/80'}"
          >
            <span class="w-8 text-stone-400">#{row.rank}</span>
            <span class="flex-1">{row.name}</span>
            <span class="text-amber-300/70">{row.tierName}</span>
            <span class="ml-4 font-mono text-amber-200">{row.rating}</span>
          </li>
        {/each}
      </ul>
    </section>

    <!-- Recent matches -->
    <section class="mt-6">
      <h2 class="text-lg font-semibold text-amber-200">{ui.history}</h2>
      {#if a.recentMatches.length === 0}
        <p class="mt-2 text-sm text-amber-100/50">{ui.noHistory}</p>
      {:else}
        <ul class="mt-2 space-y-1">
          {#each a.recentMatches as m (m.matchId)}
            <li>
              <a
                href={`/characters/${characterId}/arena/match/${m.matchId}`}
                class="flex items-center justify-between rounded px-3 py-2 text-sm hover:bg-amber-900/20"
              >
                <span class={m.won ? 'text-emerald-300' : 'text-red-400'}>
                  {m.won ? ui.win : ui.loss} vs {m.opponentName}
                </span>
                <span class="font-mono {m.ratingDelta >= 0 ? 'text-emerald-300' : 'text-red-400'}">
                  {m.ratingDelta >= 0 ? '+' : ''}{m.ratingDelta} → {m.ratingAfter}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</main>
