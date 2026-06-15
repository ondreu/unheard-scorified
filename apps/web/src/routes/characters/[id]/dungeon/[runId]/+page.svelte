<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import { ApiError, getDungeonRun, type CombatEvent, type DungeonRunView } from '$lib/api';
  import { ITEMS } from '@game/shared';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    back: '← Back to dungeons',
    notFound: 'Dungeon run not found.',
    victory: '🏆 Dungeon cleared!',
    defeat: '☠️ The party wiped.',
    fighting: 'Fighting…',
    party: 'Party',
    reward: 'Your reward',
    loot: 'Loot',
    lockout: '🔒 Weekly lockout — already cleared this week, no reward.',
  };

  let run = $state<DungeonRunView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const characterId = $derived($page.params.id ?? '');
  const runId = $derived($page.params.runId ?? '');
  let poller: ReturnType<typeof setInterval> | undefined;

  onMount(async () => {
    await load();
    // Poll the precomputed timeline; events reveal as wall-clock passes.
    poller = setInterval(async () => {
      try {
        run = await getDungeonRun(characterId, runId);
        if (run?.progress.completed) stopPolling();
      } catch {
        // transient — keep polling
      }
    }, 1000);
  });

  onDestroy(stopPolling);

  function stopPolling(): void {
    if (poller) clearInterval(poller);
    poller = undefined;
  }

  async function load(): Promise<void> {
    loading = true;
    try {
      run = await getDungeonRun(characterId, runId);
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

  function itemName(id: string): string {
    return ITEMS[id as keyof typeof ITEMS]?.name ?? id;
  }

  function eventClass(e: CombatEvent): string {
    if (e.type === 'victory') return 'text-emerald-300 font-semibold';
    if (e.type === 'defeat' || e.type === 'player_defeated') return 'text-red-400 font-semibold';
    if (e.type === 'encounter_start') return 'text-amber-300 font-semibold';
    if (e.type === 'enemy_defeated') return 'text-emerald-200';
    if (e.type === 'heal') return 'text-green-300';
    if (e.type === 'ability') return 'text-sky-300';
    return 'text-stone-300/80';
  }
</script>

<main class="mx-auto max-w-lg px-6 py-12">
  <a href={`/characters/${characterId}/dungeons`} class="text-sm text-amber-300 underline">{ui.back}</a>

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if error || !run}
    <p class="mt-6 text-red-400">{error ?? ui.notFound}</p>
  {:else}
    {@const r = run}
    <h1 class="mt-4 text-3xl font-bold text-amber-200">{r.dungeonName}</h1>
    <p class="mt-1 text-sm text-amber-100/60">
      {r.size === 1 ? 'Solo' : `${r.size}-player`} · {r.encounters.length} encounters
    </p>

    <!-- Progress -->
    <div class="mt-4 h-2 w-full overflow-hidden rounded bg-black/40">
      <div
        class="h-full bg-red-500 transition-all"
        style={`width: ${Math.round(r.progress.progress * 100)}%`}
      ></div>
    </div>

    <!-- Party (group dungeons) -->
    {#if r.party.length > 1}
      <section class="mt-4 grid grid-cols-1 gap-1 text-sm">
        <h2 class="text-xs uppercase tracking-wide text-amber-100/40">{ui.party}</h2>
        {#each r.party as p (p.name)}
          <div class="flex items-center justify-between rounded bg-black/20 px-3 py-1">
            <span class="text-amber-100/80">{p.name}</span>
            <span class="text-xs uppercase text-amber-300/70">{p.role}</span>
          </div>
        {/each}
      </section>
    {/if}

    <!-- Outcome + reward -->
    {#if r.progress.completed}
      <div class="mt-4 flex items-center justify-between">
        <span class="text-lg {r.victory ? 'text-emerald-300' : 'text-red-400'} font-bold">
          {r.victory ? ui.victory : ui.defeat}
          {#if r.wipes && r.wipes > 0}
            <span class="ml-2 text-xs font-normal text-amber-200/70">
              {r.victory
                ? `(${r.wipes} ${r.wipes === 1 ? 'wipe' : 'wipes'} — reduced reward)`
                : `(${r.wipes} ${r.wipes === 1 ? 'wipe' : 'wipes'})`}
            </span>
          {/if}
        </span>
      </div>
      {#if r.myLockedOut}
        <section class="mt-3 rounded-lg border border-amber-700/50 bg-amber-900/20 p-4">
          <p class="font-semibold text-amber-300">{ui.lockout}</p>
        </section>
      {:else if r.myReward}
        <section class="mt-3 rounded-lg border border-emerald-700/50 bg-emerald-900/20 p-4">
          <p class="font-semibold text-emerald-300">
            {ui.reward}: +{r.myReward.xp} XP, +{r.myReward.gold} gold
          </p>
          {#if r.myReward.items.length > 0}
            <p class="mt-1 text-sm text-amber-200">
              🎁 {ui.loot}: {r.myReward.items.map(itemName).join(', ')}
            </p>
          {/if}
        </section>
      {/if}
    {:else}
      <p class="mt-3 text-sm text-amber-100/60">{ui.fighting}</p>
    {/if}

    <!-- Combat log -->
    <section class="mt-4 rounded-lg border border-amber-900/40 bg-black/30 p-4">
      <ul class="space-y-1 font-mono text-xs">
        {#each [...r.events].reverse() as e, i (r.events.length - 1 - i)}
          <li class={eventClass(e)}>
            <span class="text-stone-500">{e.t.toFixed(1)}s</span>
            {e.message}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</main>
