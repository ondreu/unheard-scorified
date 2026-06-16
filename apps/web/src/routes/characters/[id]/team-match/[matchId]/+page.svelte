<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import { ApiError, getTeamMatch, type TeamMatchView } from '$lib/api';
  import CombatMeters from '$lib/components/CombatMeters.svelte';
  import CombatLog from '$lib/components/CombatLog.svelte';

  const ui = {
    title: 'Arena Match',
    myTeam: 'Your team',
    enemyTeam: 'Enemy team',
    win: '🏆 Victory!',
    loss: '💀 Defeat.',
    fighting: 'Fighting…',
  };

  let match = $state<TeamMatchView | null>(null);
  let error = $state<string | null>(null);

  const characterId = $derived($page.params.id ?? '');
  const matchId = $derived($page.params.matchId ?? '');
  let poll: ReturnType<typeof setInterval> | undefined;

  onMount(async () => {
    await load();
    poll = setInterval(() => {
      if (match && !match.progress.completed) void load();
      else clearInterval(poll);
    }, 800);
  });

  onDestroy(() => clearInterval(poll));

  async function load(): Promise<void> {
    try {
      match = await getTeamMatch(characterId, matchId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await goto('/login');
        return;
      }
      error = (err as Error).message;
    }
  }
</script>

<div class="space-y-6">
  <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{ui.title}</h1>

  {#if error}
    <p class="text-[var(--danger)]">{error}</p>
  {:else if match}
    {@const m = match}
    <div class="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      <div class="panel panel-pad">
        <h2 class="panel-title">{ui.myTeam}</h2>
        <ul class="mt-2 space-y-1 text-[var(--text-dim)]">
          {#each m.myTeam as p (p.name)}<li>{p.name}</li>{/each}
        </ul>
      </div>
      <div class="panel panel-pad">
        <h2 class="panel-title">{ui.enemyTeam}</h2>
        <ul class="mt-2 space-y-1 text-[var(--text-dim)]">
          {#each m.enemyTeam as p (p.name)}<li>{p.name}</li>{/each}
        </ul>
      </div>
    </div>

    {#if m.outcome}
      <p class="text-lg font-semibold {m.outcome === 'win' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}">
        {m.outcome === 'win' ? ui.win : ui.loss}
      </p>
    {:else}
      <p class="text-sm text-[var(--text-dim)]">{ui.fighting}</p>
    {/if}

    <CombatMeters
      events={m.events}
      names={[...m.myTeam.map((p) => p.name), ...m.enemyTeam.map((p) => p.name)]}
    />

    <!-- Combat log: abilities are clickable for details. -->
    <CombatLog events={m.events} />
  {:else}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {/if}
</div>
