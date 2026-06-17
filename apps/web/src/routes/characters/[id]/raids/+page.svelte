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
  import { browser } from '$app/environment';
  import SceneBanner from '$lib/components/SceneBanner.svelte';
  import CardAccent from '$lib/components/CardAccent.svelte';
  import { sceneCardStyle } from '$lib/pixelart/scene-bg';
  import { sceneAccentColor } from '$lib/scenes';

  // Pozadí karty dle scény raidu (browser-only — vyžaduje canvas).
  function cardStyle(id: string): string {
    return browser ? sceneCardStyle(id) : '';
  }

  // Karta pod kurzorem → mountne animovaný PixiJS akcent (jen jeden naživu).
  let hoverId = $state<string | null>(null);

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Raids',
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
    savedThisWeek: '🔒 Saved this week',
    savedHint: 'Already cleared this week — no further reward until reset.',
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
  // Reprezentativní scéna pro hlavičku (první raid v seznamu).
  const bannerScene = $derived(raids[0]?.id ?? 'molten_core');

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

<div class="space-y-6">
  <SceneBanner sceneId={bannerScene} title={ui.title} subtitle={ui.party}>
    <a href={`/characters/${characterId}/group`} class="btn btn-sm"> Form a group → </a>
  </SceneBanner>

  {#if error}
    <p class="text-[var(--danger)]">{error}</p>
  {/if}

  {#if loading}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {:else if raids.length === 0}
    <p class="text-[var(--text-dim)]">{ui.empty}</p>
  {:else}
    <ul class="space-y-3">
      {#each raids as r (r.id)}
        <li
          class="panel panel-pad scene-card {r.unlocked ? '' : 'opacity-60'}"
          style={cardStyle(r.id)}
          onmouseenter={() => (hoverId = r.id)}
          onmouseleave={() => hoverId === r.id && (hoverId = null)}
          role="presentation"
        >
          {#if hoverId === r.id}
            <CardAccent color={sceneAccentColor(r.id)} seed={r.id} />
          {/if}
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="panel-title flex items-center gap-2">
                {r.name}
                {#if r.lockedOut}
                  <span title={ui.savedHint} class="chip">
                    {ui.savedThisWeek}
                  </span>
                {/if}
              </h2>
              <p class="text-xs uppercase tracking-wide text-[var(--text-faint)]">
                {ui.reqLevel}
                {r.requiredLevel} · {ui.bosses}: {r.bossNames.join(', ')}
              </p>
            </div>
            {#if !r.unlocked}
              <span class="chip shrink-0">
                {ui.locked}
              </span>
            {/if}
          </div>
          <p class="mt-2 text-sm text-[var(--text-dim)]">{r.description}</p>

          {#if r.unlocked}
            {#if r.queuedRole}
              <div class="mt-4 flex items-center justify-between">
                <span class="text-sm text-[var(--info)]">{ui.queuedAs} {r.queuedRole}</span>
                <button onclick={() => leave(r)} disabled={busyId !== null} class="btn btn-sm">
                  {ui.leave}
                </button>
              </div>
            {:else}
              <div class="mt-4 flex flex-wrap items-end gap-3">
                <label class="field-label">
                  {ui.role}
                  <select bind:value={role[r.id]} class="input mt-1 block w-auto">
                    {#each ROLES as ro (ro)}
                      <option value={ro}>{ro}</option>
                    {/each}
                  </select>
                </label>
                <label class="field-label">
                  {ui.size}
                  <select
                    value={size[r.id]}
                    onchange={(e) => onSize(r, Number((e.target as HTMLSelectElement).value))}
                    class="input mt-1 block w-auto"
                  >
                    {#each r.sizes as s (s)}
                      <option value={s}>{s} {ui.players}</option>
                    {/each}
                  </select>
                </label>
                {#if comp[r.id]}
                  <div class="field-label">
                    {ui.comp}
                    <div class="mt-1 flex items-center gap-1">
                      {#each ROLES as ro (ro)}
                        <input
                          type="number"
                          min="0"
                          max={size[r.id]}
                          bind:value={comp[r.id]![ro]}
                          class="input w-12 px-1 text-center"
                        />
                      {/each}
                      <span
                        class="ml-1 text-xs"
                        style={`color:${compSum(r) === size[r.id] ? 'var(--success)' : 'var(--danger)'}`}
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
                    class="btn btn-primary btn-sm"
                  >
                    {busyId === r.id ? ui.entering : ui.enter}
                  </button>
                  <button onclick={() => queue(r)} disabled={busyId !== null} class="btn btn-sm">
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
      <div>
        <h2 class="panel-title mb-2">{ui.recent}</h2>
        <ul class="space-y-2">
          {#each recent as run (run.runId)}
            <li class="panel px-4 py-2 text-sm">
              <a
                href={`/characters/${characterId}/raid/${run.runId}`}
                class="flex items-center justify-between gap-3"
              >
                <span class="text-[var(--text-dim)]">{run.raidName} · {run.role}</span>
                <span style={`color:${run.victory ? 'var(--success)' : 'var(--danger)'}`}>
                  {run.victory ? ui.victory : ui.wipe} · +{run.reward.xp} XP
                </span>
              </a>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}
</div>
