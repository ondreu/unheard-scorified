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
    type RaidComposition,
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
    size: 'Size',
    comp: 'Composition (T / H / DPS)',
    players: 'players',
    queuedAs: 'Waiting in queue as',
    recent: 'Recent runs',
    victory: 'Victory',
    wipe: 'Wipe',
    party:
      'Pick size (5/10/20) and compose your party (tanks / healers / dps). Empty slots are filled by mercenaries.',
  };

  const ROLES: RaidRole[] = ['tank', 'healer', 'dps'];

  let raids = $state<RaidListItem[]>([]);
  let recent = $state<RaidRunSummary[]>([]);
  let role = $state<Record<string, RaidRole>>({});
  let size = $state<Record<string, number>>({});
  let comp = $state<Record<string, RaidComposition>>({});
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busyId = $state<string | null>(null);

  const characterId = $derived($page.params.id ?? '');

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      [raids, recent] = await Promise.all([listRaids(characterId), recentRaidRuns(characterId)]);
      for (const r of raids) {
        if (!role[r.id]) role[r.id] = r.queuedRole ?? 'dps';
        if (!size[r.id]) size[r.id] = r.sizes[0] ?? 5;
        if (!comp[r.id]) comp[r.id] = { ...r.defaultComposition[size[r.id]!]! };
      }
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

  // Při změně velikosti přednastav default kompozici dané velikosti.
  function onSize(r: RaidListItem, s: number): void {
    size[r.id] = s;
    comp[r.id] = { ...r.defaultComposition[s]! };
  }

  function compSum(r: RaidListItem): number {
    const c = comp[r.id];
    return c ? c.tank + c.healer + c.dps : 0;
  }

  async function enter(r: RaidListItem): Promise<void> {
    busyId = r.id;
    error = null;
    try {
      const run = await enterRaid(characterId, r.id, role[r.id] ?? 'dps', size[r.id], comp[r.id]);
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
              <div class="mt-4 flex flex-wrap items-end gap-3">
                <label class="text-sm text-amber-100/70">
                  {ui.role}
                  <select
                    bind:value={role[r.id]}
                    class="mt-1 block rounded border border-amber-900/40 bg-black/40 px-2 py-1 text-sm text-amber-100"
                  >
                    {#each ROLES as ro (ro)}
                      <option value={ro}>{ro}</option>
                    {/each}
                  </select>
                </label>
                <label class="text-sm text-amber-100/70">
                  {ui.size}
                  <select
                    value={size[r.id]}
                    onchange={(e) => onSize(r, Number((e.target as HTMLSelectElement).value))}
                    class="mt-1 block rounded border border-amber-900/40 bg-black/40 px-2 py-1 text-sm text-amber-100"
                  >
                    {#each r.sizes as s (s)}
                      <option value={s}>{s} {ui.players}</option>
                    {/each}
                  </select>
                </label>
                {#if comp[r.id]}
                  <div class="text-sm text-amber-100/70">
                    {ui.comp}
                    <div class="mt-1 flex items-center gap-1">
                      {#each ROLES as ro (ro)}
                        <input
                          type="number"
                          min="0"
                          max={size[r.id]}
                          bind:value={comp[r.id]![ro]}
                          class="w-12 rounded border border-amber-900/40 bg-black/40 px-1 py-1 text-center text-sm text-amber-100"
                        />
                      {/each}
                      <span
                        class="ml-1 text-xs {compSum(r) === size[r.id]
                          ? 'text-emerald-300'
                          : 'text-red-400'}"
                      >
                        Σ{compSum(r)}/{size[r.id]}
                      </span>
                    </div>
                  </div>
                {/if}
                <div class="ml-auto flex gap-2">
                  <button
                    onclick={() => enter(r)}
                    disabled={busyId !== null || compSum(r) !== size[r.id]}
                    class="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-red-600 disabled:opacity-50"
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
