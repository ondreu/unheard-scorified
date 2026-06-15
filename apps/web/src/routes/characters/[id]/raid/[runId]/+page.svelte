<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import { ApiError, getRaidRun, type CombatEvent, type RaidRunView } from '$lib/api';
  import { ITEMS } from '@game/shared';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    back: '← Back to raids',
    notFound: 'Raid run not found.',
    victory: '🏆 Raid cleared!',
    defeat: '☠️ The raid wiped.',
    fighting: 'Fighting…',
    party: 'Party',
    reward: 'Your reward',
    loot: 'Loot',
    npc: 'NPC',
  };

  let run = $state<RaidRunView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const characterId = $derived($page.params.id ?? '');
  const runId = $derived($page.params.runId ?? '');
  let poller: ReturnType<typeof setInterval> | undefined;

  onMount(async () => {
    await load();
    // Poll the precomputed timeline; events reveal as wall-clock passes (REST is
    // the authoritative fallback to the WS gateway).
    poller = setInterval(async () => {
      try {
        run = await getRaidRun(characterId, runId);
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
      run = await getRaidRun(characterId, runId);
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
  <a href={`/characters/${characterId}/raids`} class="text-sm text-amber-300 underline">{ui.back}</a>

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if error || !run}
    <p class="mt-6 text-red-400">{error ?? ui.notFound}</p>
  {:else}
    {@const r = run}
    <h1 class="mt-4 text-3xl font-bold text-amber-200">{r.raidName}</h1>
    <p class="mt-1 text-sm text-amber-100/60">{r.party.length}-player party · {r.bosses.length} bosses</p>

    <!-- Progress -->
    <div class="mt-4 h-2 w-full overflow-hidden rounded bg-black/40">
      <div
        class="h-full bg-red-500 transition-all"
        style={`width: ${Math.round(r.progress.progress * 100)}%`}
      ></div>
    </div>

    <!-- Party -->
    <section class="mt-4 grid grid-cols-1 gap-1 text-sm">
      <h2 class="text-xs uppercase tracking-wide text-amber-100/40">{ui.party}</h2>
      {#each r.party as p (p.name)}
        <div class="flex items-center justify-between rounded bg-black/20 px-3 py-1">
          <span class="text-amber-100/80">
            {p.name}
            {#if p.isNpc}<span class="ml-1 text-xs text-stone-500">({ui.npc})</span>{/if}
          </span>
          <span class="text-xs uppercase text-amber-300/70">{p.role}</span>
        </div>
      {/each}
    </section>

    <!-- Outcome + reward -->
    {#if r.progress.completed}
      <div class="mt-4 flex items-center justify-between">
        <span class="text-lg {r.victory ? 'text-emerald-300' : 'text-red-400'} font-bold">
          {r.victory ? ui.victory : ui.defeat}
        </span>
      </div>
      {#if r.myReward}
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
        {#each r.events as e, i (i)}
          <li class={eventClass(e)}>
            <span class="text-stone-500">{e.t.toFixed(1)}s</span>
            {e.message}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</main>
