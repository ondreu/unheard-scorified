<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { ApiError, enterDungeon, listDungeons, type DungeonListItem } from '$lib/api';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Dungeons',
    back: '← Back to character',
    empty: 'No dungeons known.',
    enter: 'Enter',
    entering: 'Entering…',
    boss: 'Boss',
    encounters: 'Encounters',
    locked: 'Locked',
    reqLevel: 'Requires level',
    party: 'Party',
    solo: 'Solo',
  };

  let dungeons = $state<DungeonListItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let enteringId = $state<string | null>(null);
  // Zvolená velikost party per dungeon (default 1 = solo).
  let sizeById = $state<Record<string, number>>({});

  const characterId = $derived($page.params.id ?? '');

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      dungeons = await listDungeons(characterId);
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

  async function enter(d: DungeonListItem): Promise<void> {
    enteringId = d.id;
    error = null;
    try {
      const size = sizeById[d.id] ?? 1;
      const run = await enterDungeon(characterId, d.id, size);
      await goto(`/characters/${characterId}/dungeon/${run.runId}`);
    } catch (err) {
      error = (err as Error).message;
      enteringId = null;
    }
  }

  function sizeLabel(n: number): string {
    return n === 1 ? ui.solo : `${n}-player`;
  }
</script>

<main class="mx-auto max-w-lg px-6 py-12">
  <a href={`/characters/${characterId}`} class="text-sm text-amber-300 underline">{ui.back}</a>
  <h1 class="mt-4 text-3xl font-bold text-amber-200">{ui.title}</h1>

  {#if error}
    <p class="mt-4 text-red-400">{error}</p>
  {/if}

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if dungeons.length === 0}
    <p class="mt-6 text-amber-100/60">{ui.empty}</p>
  {:else}
    <ul class="mt-6 space-y-4">
      {#each dungeons as d (d.id)}
        <li
          class="rounded-lg border p-5 {d.unlocked
            ? 'border-amber-900/40 bg-black/20'
            : 'border-stone-800/60 bg-black/10 opacity-60'}"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="font-semibold text-amber-200">{d.name}</h2>
              <p class="text-xs uppercase tracking-wide text-amber-100/40">
                {ui.reqLevel}
                {d.requiredLevel} · {d.encounterCount}
                {ui.encounters} · {ui.boss}: {d.bossName}
              </p>
            </div>
            {#if d.unlocked}
              <div class="flex shrink-0 items-center gap-2">
                <label class="sr-only" for={`size-${d.id}`}>{ui.party}</label>
                <select
                  id={`size-${d.id}`}
                  bind:value={sizeById[d.id]}
                  class="rounded border border-amber-900/50 bg-black/40 px-2 py-1.5 text-sm text-amber-100"
                >
                  {#each d.sizes as s (s)}
                    <option value={s}>{sizeLabel(s)}</option>
                  {/each}
                </select>
                <button
                  onclick={() => enter(d)}
                  disabled={enteringId !== null}
                  class="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-red-600 disabled:opacity-50"
                >
                  {enteringId === d.id ? ui.entering : ui.enter}
                </button>
              </div>
            {:else}
              <span class="shrink-0 rounded border border-stone-700 px-3 py-1.5 text-xs text-stone-400">
                {ui.locked} · {ui.reqLevel} {d.requiredLevel}
              </span>
            {/if}
          </div>
          <p class="mt-2 text-sm text-amber-100/70">{d.description}</p>
        </li>
      {/each}
    </ul>
  {/if}
</main>
