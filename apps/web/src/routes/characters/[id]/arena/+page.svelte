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
  import { openProfile } from '$lib/ui-stores';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
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

<div class="space-y-6">
  {#if loading}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {:else if error && !arena}
    <p class="text-[var(--danger)]">{error}</p>
  {:else if arena}
    {@const a = arena}
    <div class="flex items-center justify-between">
      <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">⚔️ {ui.title}</h1>
      <a href={`/characters/${characterId}/group`} class="btn">Group (3v3/5v5) →</a>
    </div>
    <p class="text-sm text-[var(--text-dim)]">
      {a.season.name} · {a.bracket} · {ui.seasonEnds} {fmtDate(a.season.endsAt)}
    </p>

    {#if error}
      <p class="text-[var(--danger)]">{error}</p>
    {/if}

    <!-- Season reward banner (lazy rollover) -->
    {#each a.newSeasonRewards as reward (reward.seasonId)}
      <section class="panel panel-pad">
        <p class="panel-title">🏅 {reward.seasonName} reward</p>
        <p class="mt-1 text-sm text-[var(--text-dim)]">
          Finished as <strong class="text-[var(--text)]">{reward.finalTier}</strong> ({reward.finalRating}) · <span class="text-[var(--gold-bright)]">+{reward.rewardGold} gold</span>
        </p>
      </section>
    {/each}

    <!-- Rating panel -->
    <section class="panel panel-pad">
      <div class="flex items-end justify-between">
        <div>
          <p class="font-display text-3xl font-bold text-[var(--gold-bright)]">{a.rating}</p>
          <p class="text-sm text-[var(--gold)]">{a.tierName}</p>
        </div>
        <div class="text-right text-sm text-[var(--text-dim)]">
          <p>{ui.rank}: {a.rank ?? '—'}</p>
          <p>{ui.record}: <span class="text-[var(--success)]">{a.wins}W</span> / <span class="text-[var(--danger)]">{a.losses}L</span></p>
        </div>
      </div>
      {#if a.nextTierAt}
        <p class="mt-2 text-xs text-[var(--text-faint)]">{ui.nextTier} {a.nextTierAt}</p>
      {/if}
    </section>

    <!-- Queue control -->
    <section>
      {#if !a.eligible}
        <p class="panel panel-pad text-sm text-[var(--text-dim)]">
          {ui.ineligible} (Level {a.minLevel})
        </p>
      {:else if a.queued}
        <p class="text-sm text-[var(--text)]">{notice ?? ui.searching}</p>
        <button onclick={leave} disabled={pending} class="btn mt-2">
          {ui.leave}
        </button>
      {:else}
        {#if notice}<p class="mb-2 text-sm text-[var(--success)]">{notice}</p>{/if}
        <button onclick={enterQueue} disabled={pending} class="btn btn-primary">
          {pending ? ui.queuing : ui.queue}
        </button>
      {/if}
    </section>

    <!-- Leaderboard -->
    <section class="panel panel-pad">
      <h2 class="panel-title">{ui.leaderboard}</h2>
      <ul class="mt-3 divide-y divide-[var(--border)]">
        {#each a.leaderboard as row (row.characterId)}
          <li
            class="flex items-center justify-between px-1 py-2 text-sm {row.isSelf
              ? 'text-[var(--gold-bright)]'
              : 'text-[var(--text-dim)]'}"
          >
            <span class="w-8 text-[var(--text-faint)]">#{row.rank}</span>
            <span class="flex-1">
              <button class="hover:underline" onclick={() => openProfile(row.characterId, row.name)}>{row.name}</button>
            </span>
            <span class="text-[var(--gold)]">{row.tierName}</span>
            <span class="ml-4 font-mono text-[var(--gold-bright)]">{row.rating}</span>
          </li>
        {/each}
      </ul>
    </section>

    <!-- Recent matches -->
    <section class="panel panel-pad">
      <h2 class="panel-title">{ui.history}</h2>
      {#if a.recentMatches.length === 0}
        <p class="mt-2 text-sm text-[var(--text-faint)]">{ui.noHistory}</p>
      {:else}
        <ul class="mt-3 space-y-1">
          {#each a.recentMatches as m (m.matchId)}
            <li>
              <a
                href={`/characters/${characterId}/arena/match/${m.matchId}`}
                class="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
              >
                <span class={m.won ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                  {m.won ? ui.win : ui.loss} vs {m.opponentName}
                </span>
                <span class="font-mono {m.ratingDelta >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}">
                  {m.ratingDelta >= 0 ? '+' : ''}{m.ratingDelta} → {m.ratingAfter}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>
