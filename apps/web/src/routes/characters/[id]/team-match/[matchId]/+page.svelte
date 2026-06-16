<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import { ApiError, getTeamMatch, type CombatEvent, type TeamMatchView } from '$lib/api';

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

  function eventClass(e: CombatEvent): string {
    if (e.type === 'victory') return 'text-[var(--success)] font-semibold';
    if (e.type === 'player_defeated') return 'text-[var(--danger)] font-semibold';
    if (e.type === 'encounter_start') return 'text-[var(--gold-bright)] font-semibold';
    if (e.type === 'heal' || e.type === 'drain') return 'text-[var(--success)]';
    if (e.type === 'dot') return 'text-[var(--gold-bright)]';
    if (e.type === 'absorb' || e.type === 'ability') return 'text-[var(--info)]';
    return 'text-[var(--text-dim)]';
  }

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

    <section class="panel panel-pad max-h-96 overflow-y-auto text-xs">
      {#each [...m.events].reverse() as e, i (m.events.length - 1 - i)}
        <p class={eventClass(e)}>
          <span class="text-[var(--text-faint)]">[{e.t.toFixed(1)}s]</span>
          {e.message}
        </p>
      {/each}
    </section>
  {:else}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {/if}
</div>
