<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import {
    ApiError,
    claimActivity,
    getDungeonLog,
    type ClaimResult,
    type CombatEvent,
    type DungeonLogView,
  } from '$lib/api';
  import { ITEMS } from '@game/shared';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    back: '← Back to character',
    none: 'Not in a dungeon.',
    toDungeons: 'Go to dungeons →',
    victory: '🏆 Victory!',
    defeat: '☠️ Defeat',
    claim: 'Claim loot',
    claiming: 'Claiming…',
    fighting: 'Fighting…',
    loot: 'Loot',
    gained: 'Gained',
  };

  let log = $state<DungeonLogView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let claiming = $state(false);
  let claimResult = $state<ClaimResult | null>(null);

  const characterId = $derived($page.params.id ?? '');
  let poller: ReturnType<typeof setInterval> | undefined;

  onMount(async () => {
    await load();
    // Poll the precomputed timeline; events reveal as wall-clock passes.
    poller = setInterval(async () => {
      if (claimResult) return;
      try {
        log = await getDungeonLog(characterId);
        if (log?.progress.completed) stopPolling();
      } catch {
        // transient — keep polling
      }
    }, 1500);
  });

  onDestroy(stopPolling);

  function stopPolling(): void {
    if (poller) clearInterval(poller);
    poller = undefined;
  }

  async function load(): Promise<void> {
    loading = true;
    try {
      log = await getDungeonLog(characterId);
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

  async function claim(): Promise<void> {
    claiming = true;
    error = null;
    try {
      claimResult = await claimActivity(characterId);
      stopPolling();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      claiming = false;
    }
  }

  function itemName(id: string): string {
    return ITEMS[id as keyof typeof ITEMS]?.name ?? id;
  }

  function eventClass(e: CombatEvent): string {
    if (e.type === 'victory') return 'text-emerald-300 font-semibold';
    if (e.type === 'defeat' || e.type === 'player_defeated') return 'text-red-400 font-semibold';
    if (e.type === 'encounter_start') return 'text-amber-300 font-semibold';
    if (e.type === 'enemy_defeated') return 'text-emerald-200';
    if (e.type === 'ability') return 'text-sky-300';
    if (e.source === log?.player.name) return 'text-amber-100/90';
    return 'text-stone-300/80';
  }
</script>

<main class="mx-auto max-w-lg px-6 py-12">
  <a href={`/characters/${characterId}`} class="text-sm text-amber-300 underline">{ui.back}</a>

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if !log}
    <p class="mt-6 text-amber-100/60">{ui.none}</p>
    <a
      href={`/characters/${characterId}/dungeons`}
      class="mt-3 inline-block rounded bg-red-700 px-4 py-2 text-sm font-medium text-amber-50 hover:bg-red-600"
    >
      {ui.toDungeons}
    </a>
  {:else}
    {@const l = log}
    <h1 class="mt-4 text-3xl font-bold text-amber-200">{l.dungeonName}</h1>
    <p class="mt-1 text-sm text-amber-100/60">{l.player.name} · {l.enemies.length} encounters</p>

    {#if error}
      <p class="mt-4 text-red-400">{error}</p>
    {/if}

    <!-- Progress -->
    <div class="mt-4 h-2 w-full overflow-hidden rounded bg-black/40">
      <div
        class="h-full bg-red-500 transition-all"
        style={`width: ${Math.round(l.progress.progress * 100)}%`}
      ></div>
    </div>

    <!-- Outcome / claim -->
    {#if l.progress.completed}
      {#if claimResult}
        {@const r = claimResult}
        <section class="mt-4 rounded-lg border border-emerald-700/50 bg-emerald-900/20 p-4">
          <p class="font-semibold text-emerald-300">
            {ui.gained}: +{r.reward.xp} XP, +{r.reward.gold} gold
          </p>
          {#if r.items.length > 0}
            <p class="mt-1 text-sm text-amber-200">
              🎁 {ui.loot}: {r.items.map(itemName).join(', ')}
            </p>
          {/if}
          {#if r.leveledUp}
            <p class="mt-1 text-amber-300">⭐ Level {r.levelBefore} → {r.levelAfter}</p>
          {/if}
        </section>
      {:else}
        <div class="mt-4 flex items-center justify-between">
          <span class="text-lg {l.victory ? 'text-emerald-300' : 'text-red-400'} font-bold">
            {l.victory ? ui.victory : ui.defeat}
          </span>
          <button
            onclick={claim}
            disabled={claiming}
            class="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-500 disabled:opacity-50"
          >
            {claiming ? ui.claiming : ui.claim}
          </button>
        </div>
      {/if}
    {:else}
      <p class="mt-3 text-sm text-amber-100/60">{ui.fighting}</p>
    {/if}

    <!-- Combat log -->
    <section class="mt-4 rounded-lg border border-amber-900/40 bg-black/30 p-4">
      <ul class="space-y-1 font-mono text-xs">
        {#each l.events as e, i (i)}
          <li class={eventClass(e)}>
            <span class="text-stone-500">{e.t.toFixed(1)}s</span>
            {e.message}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</main>
