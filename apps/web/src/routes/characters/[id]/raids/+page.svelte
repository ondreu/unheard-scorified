<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    enterRaid,
    leaveRaidQueue,
    listRaids,
    queueRaid,
    recentRaidRuns,
    type RaidListItem,
    type RaidRole,
    type RaidRunSummary,
  } from '$lib/api';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Raids',
    back: '← Back to character',
    empty: 'No raids available.',
    enter: 'Enter raid',
    entering: 'Forming party…',
    queue: 'Queue',
    queuing: 'Queuing…',
    leave: 'Leave queue',
    locked: 'Locked',
    reqLevel: 'Requires level',
    attune: 'Attunement',
    bosses: 'Bosses',
    role: 'Role',
    queuedAs: 'Waiting in queue as',
    recent: 'Recent runs',
    victory: 'Victory',
    wipe: 'Wipe',
    party: '5-player party · 1 tank / 1 healer / 3 dps · empty slots filled by mercenaries',
  };

  const ROLES: RaidRole[] = ['tank', 'healer', 'dps'];

  let raids = $state<RaidListItem[]>([]);
  let recent = $state<RaidRunSummary[]>([]);
  let role = $state<Record<string, RaidRole>>({});
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busyId = $state<string | null>(null);

  const characterId = $derived($page.params.id ?? '');

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      [raids, recent] = await Promise.all([listRaids(characterId), recentRaidRuns(characterId)]);
      for (const r of raids) if (!role[r.id]) role[r.id] = r.queuedRole ?? 'dps';
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

  async function enter(r: RaidListItem): Promise<void> {
    busyId = r.id;
    error = null;
    try {
      const run = await enterRaid(characterId, r.id, role[r.id] ?? 'dps');
      await goto(`/characters/${characterId}/raid/${run.runId}`);
    } catch (err) {
      error = (err as Error).message;
      busyId = null;
    }
  }

  async function queue(r: RaidListItem): Promise<void> {
    busyId = r.id;
    error = null;
    try {
      await queueRaid(characterId, r.id, role[r.id] ?? 'dps');
      await load();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busyId = null;
    }
  }

  async function leave(r: RaidListItem): Promise<void> {
    busyId = r.id;
    error = null;
    try {
      await leaveRaidQueue(characterId, r.id);
      await load();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busyId = null;
    }
  }
</script>

<main class="mx-auto max-w-lg px-6 py-12">
  <a href={`/characters/${characterId}`} class="text-sm text-amber-300 underline">{ui.back}</a>
  <h1 class="mt-4 text-3xl font-bold text-amber-200">{ui.title}</h1>
  <p class="mt-1 text-xs text-amber-100/40">{ui.party}</p>

  {#if error}
    <p class="mt-4 text-red-400">{error}</p>
  {/if}

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if raids.length === 0}
    <p class="mt-6 text-amber-100/60">{ui.empty}</p>
  {:else}
    <ul class="mt-6 space-y-4">
      {#each raids as r (r.id)}
        <li
          class="rounded-lg border p-5 {r.unlocked
            ? 'border-amber-900/40 bg-black/20'
            : 'border-stone-800/60 bg-black/10 opacity-60'}"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="font-semibold text-amber-200">{r.name}</h2>
              <p class="text-xs uppercase tracking-wide text-amber-100/40">
                {ui.reqLevel} {r.requiredLevel} · {ui.bosses}: {r.bossNames.join(', ')}
              </p>
            </div>
            {#if !r.unlocked}
              <span
                class="shrink-0 rounded border border-stone-700 px-3 py-1.5 text-xs text-stone-400"
              >
                {ui.locked}
              </span>
            {/if}
          </div>
          <p class="mt-2 text-sm text-amber-100/70">{r.description}</p>

          {#if r.unlocked}
            {#if r.queuedRole}
              <div class="mt-4 flex items-center justify-between">
                <span class="text-sm text-sky-300">{ui.queuedAs} {r.queuedRole}</span>
                <button
                  onclick={() => leave(r)}
                  disabled={busyId !== null}
                  class="rounded border border-stone-600 px-3 py-1.5 text-sm text-stone-300 hover:bg-stone-800 disabled:opacity-50"
                >
                  {ui.leave}
                </button>
              </div>
            {:else}
              <div class="mt-4 flex items-center gap-2">
                <label for={`role-${r.id}`} class="text-sm text-amber-100/70">{ui.role}</label>
                <select
                  id={`role-${r.id}`}
                  bind:value={role[r.id]}
                  class="rounded border border-amber-900/40 bg-black/40 px-2 py-1 text-sm text-amber-100"
                >
                  {#each ROLES as ro (ro)}
                    <option value={ro}>{ro}</option>
                  {/each}
                </select>
                <button
                  onclick={() => enter(r)}
                  disabled={busyId !== null}
                  class="ml-auto rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-red-600 disabled:opacity-50"
                >
                  {busyId === r.id ? ui.entering : ui.enter}
                </button>
                <button
                  onclick={() => queue(r)}
                  disabled={busyId !== null}
                  class="rounded border border-amber-700/60 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-900/30 disabled:opacity-50"
                >
                  {ui.queue}
                </button>
              </div>
            {/if}
          {/if}
        </li>
      {/each}
    </ul>

    {#if recent.length > 0}
      <h2 class="mt-8 text-lg font-semibold text-amber-200">{ui.recent}</h2>
      <ul class="mt-3 space-y-2">
        {#each recent as run (run.runId)}
          <li class="rounded border border-amber-900/30 bg-black/20 px-4 py-2 text-sm">
            <a
              href={`/characters/${characterId}/raid/${run.runId}`}
              class="flex items-center justify-between gap-3"
            >
              <span class="text-amber-100/80">{run.raidName} · {run.role}</span>
              <span class={run.victory ? 'text-emerald-300' : 'text-red-400'}>
                {run.victory ? ui.victory : ui.wipe} · +{run.reward.xp} XP
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</main>
