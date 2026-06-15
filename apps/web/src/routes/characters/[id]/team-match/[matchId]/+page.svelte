<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import { ApiError, getTeamMatch, type TeamMatchView } from '$lib/api';

  const ui = {
    back: '← Back to team arena',
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

<main class="mx-auto max-w-lg px-6 py-12">
  <a href={`/characters/${characterId}/group`} class="text-sm text-amber-300 underline">{ui.back}</a>
  <h1 class="mt-4 text-3xl font-bold text-amber-200">{ui.title}</h1>

  {#if error}
    <p class="mt-6 text-red-400">{error}</p>
  {:else if match}
    {@const m = match}
    <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
      <div class="rounded border border-emerald-900/40 bg-black/20 p-3">
        <h2 class="font-semibold text-emerald-300">{ui.myTeam}</h2>
        <ul class="mt-1 text-amber-100/80">
          {#each m.myTeam as p (p.name)}<li>{p.name}</li>{/each}
        </ul>
      </div>
      <div class="rounded border border-red-900/40 bg-black/20 p-3">
        <h2 class="font-semibold text-red-300">{ui.enemyTeam}</h2>
        <ul class="mt-1 text-amber-100/80">
          {#each m.enemyTeam as p (p.name)}<li>{p.name}</li>{/each}
        </ul>
      </div>
    </div>

    {#if m.outcome}
      <p class="mt-4 text-lg font-semibold {m.outcome === 'win' ? 'text-emerald-300' : 'text-red-400'}">
        {m.outcome === 'win' ? ui.win : ui.loss}
      </p>
    {:else}
      <p class="mt-4 text-sm text-amber-300">{ui.fighting}</p>
    {/if}

    <section class="mt-4 max-h-96 overflow-y-auto rounded border border-amber-900/40 bg-black/30 p-3 text-xs">
      {#each [...m.events].reverse() as e, i (m.events.length - 1 - i)}
        <p class="text-amber-100/80">
          <span class="text-amber-100/30">[{e.t.toFixed(1)}s]</span>
          {e.message}
        </p>
      {/each}
    </section>
  {:else}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {/if}
</main>
