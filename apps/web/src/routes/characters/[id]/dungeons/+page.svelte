<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { ApiError, enterDungeon, listDungeons, type DungeonListItem } from '$lib/api';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Dungeons',
    empty: 'No dungeons known.',
    enter: 'Enter',
    entering: 'Entering…',
    boss: 'Boss',
    encounters: 'Encounters',
    locked: 'Locked',
    reqLevel: 'Requires level',
    party: 'Party',
    solo: 'Solo',
    savedThisWeek: '🔒 Saved this week',
    savedHint: 'Already cleared this week — no further reward until reset.',
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

<div class="space-y-6">
  <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{ui.title}</h1>

  {#if error}
    <p class="text-[var(--danger)]">{error}</p>
  {/if}

  {#if loading}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {:else if dungeons.length === 0}
    <p class="text-[var(--text-dim)]">{ui.empty}</p>
  {:else}
    <ul class="space-y-3">
      {#each dungeons as d (d.id)}
        <li class="panel panel-pad {d.unlocked ? '' : 'opacity-60'}">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="panel-title flex items-center gap-2">
                {d.name}
                {#if d.lockedOut}
                  <span title={ui.savedHint} class="chip">
                    {ui.savedThisWeek}
                  </span>
                {/if}
              </h2>
              <p class="text-xs uppercase tracking-wide text-[var(--text-faint)]">
                {ui.reqLevel}
                {d.requiredLevel} · {d.encounterCount}
                {ui.encounters} · {ui.boss}: {d.bossName}
              </p>
            </div>
            {#if d.unlocked}
              <div class="flex shrink-0 items-center gap-2">
                <label class="sr-only" for={`size-${d.id}`}>{ui.party}</label>
                <select id={`size-${d.id}`} bind:value={sizeById[d.id]} class="input w-auto">
                  {#each d.sizes as s (s)}
                    <option value={s}>{sizeLabel(s)}</option>
                  {/each}
                </select>
                <button onclick={() => enter(d)} disabled={enteringId !== null} class="btn btn-primary btn-sm">
                  {enteringId === d.id ? ui.entering : ui.enter}
                </button>
              </div>
            {:else}
              <span class="chip shrink-0">
                {ui.locked} · {ui.reqLevel} {d.requiredLevel}
              </span>
            {/if}
          </div>
          <p class="mt-2 text-sm text-[var(--text-dim)]">{d.description}</p>
        </li>
      {/each}
    </ul>
  {/if}
</div>
