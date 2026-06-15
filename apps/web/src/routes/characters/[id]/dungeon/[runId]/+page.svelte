<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import { ApiError, getDungeonRun, type CombatEvent, type DungeonRunView } from '$lib/api';
  import { ITEMS } from '@game/shared';
  import { ROLE_META } from '$lib/cosmetics';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
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

  function eventStyle(e: CombatEvent): string {
    if (e.type === 'victory') return 'color:var(--success);font-weight:600';
    if (e.type === 'defeat' || e.type === 'player_defeated') return 'color:var(--danger);font-weight:600';
    if (e.type === 'encounter_start') return 'color:var(--gold-bright);font-weight:600';
    if (e.type === 'enemy_defeated') return 'color:var(--success)';
    if (e.type === 'heal') return 'color:var(--success)';
    if (e.type === 'ability') return 'color:var(--info)';
    return 'color:var(--text-dim)';
  }
</script>

<div class="space-y-6">
  {#if loading}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {:else if error || !run}
    <p class="text-[var(--danger)]">{error ?? ui.notFound}</p>
  {:else}
    {@const r = run}
    <div>
      <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{r.dungeonName}</h1>
      <p class="mt-1 text-sm text-[var(--text-dim)]">
        {r.size === 1 ? 'Solo' : `${r.size}-player`} · {r.encounters.length} encounters
      </p>
    </div>

    <!-- Progress -->
    <div class="bar">
      <div class="bar-fill" style={`width:${Math.round(r.progress.progress * 100)}%`}></div>
    </div>

    <!-- Party (group dungeons) -->
    {#if r.party.length > 1}
      <section class="panel panel-pad">
        <h2 class="panel-title">{ui.party}</h2>
        <div class="mt-2 grid grid-cols-1 gap-1 text-sm">
          {#each r.party as p (p.name)}
            <div class="flex items-center justify-between rounded-lg bg-black/20 px-3 py-1.5">
              <span class="text-[var(--text)]">{p.name}</span>
              <span class="shrink-0 text-sm" style={`color:${ROLE_META[p.role].color}`} title={ROLE_META[p.role].label}>
                {ROLE_META[p.role].icon}
              </span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Outcome + reward -->
    {#if r.progress.completed}
      <div class="flex items-center justify-between">
        <span class="text-lg font-bold" style={`color:${r.victory ? 'var(--success)' : 'var(--danger)'}`}>
          {r.victory ? ui.victory : ui.defeat}
          {#if r.wipes && r.wipes > 0}
            <span class="ml-2 text-xs font-normal text-[var(--text-dim)]">
              {r.victory
                ? `(${r.wipes} ${r.wipes === 1 ? 'wipe' : 'wipes'} — reduced reward)`
                : `(${r.wipes} ${r.wipes === 1 ? 'wipe' : 'wipes'})`}
            </span>
          {/if}
        </span>
      </div>
      {#if r.myLockedOut}
        <section class="panel panel-pad">
          <p class="font-semibold text-[var(--gold-bright)]">{ui.lockout}</p>
        </section>
      {:else if r.myReward}
        <section class="panel panel-pad">
          <p class="font-semibold text-[var(--success)]">
            {ui.reward}: +{r.myReward.xp} XP, +{r.myReward.gold} gold
          </p>
          {#if r.myReward.items.length > 0}
            <p class="mt-1 text-sm text-[var(--text-dim)]">
              🎁 {ui.loot}: {r.myReward.items.map(itemName).join(', ')}
            </p>
          {/if}
        </section>
      {/if}
    {:else}
      <p class="text-sm text-[var(--text-dim)]">{ui.fighting}</p>
    {/if}

    <!-- Combat log -->
    <section class="panel panel-pad">
      <ul class="space-y-1 font-mono text-xs">
        {#each [...r.events].reverse() as e, i (r.events.length - 1 - i)}
          <li style={eventStyle(e)}>
            <span class="text-[var(--text-faint)]">{e.t.toFixed(1)}s</span>
            {e.message}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>
