<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import { ApiError, getRaidRun, type RaidRunView } from '$lib/api';
  import { ITEMS } from '@game/shared';
  import { ROLE_META } from '$lib/cosmetics';
  import CombatMeters from '$lib/components/CombatMeters.svelte';
  import CombatLog from '$lib/components/CombatLog.svelte';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    notFound: 'Raid run not found.',
    victory: '🏆 Raid cleared!',
    defeat: '☠️ The raid wiped.',
    fighting: 'Fighting…',
    party: 'Party',
    reward: 'Your reward',
    loot: 'Loot',
    lockout: '🔒 Weekly lockout — already cleared this week, no reward.',
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

</script>

<div class="space-y-6">
  {#if loading}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {:else if error || !run}
    <p class="text-[var(--danger)]">{error ?? ui.notFound}</p>
  {:else}
    {@const r = run}
    <div>
      <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{r.raidName}</h1>
      <p class="mt-1 text-sm text-[var(--text-dim)]">{r.party.length}-player party · {r.bosses.length} bosses</p>
    </div>

    <!-- Progress -->
    <div class="bar">
      <div class="bar-fill" style={`width:${Math.round(r.progress.progress * 100)}%`}></div>
    </div>

    <!-- Party -->
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

    <CombatMeters events={r.events} names={r.party.map((p) => p.name)} />

    <!-- Combat log: NPC names + abilities are clickable for details. -->
    <CombatLog events={r.events} />
  {/if}
</div>
