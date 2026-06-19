<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import {
    ApiError,
    enterDungeon,
    enterDungeonTurn,
    listDungeons,
    type DungeonListItem,
  } from '$lib/api';
  import SceneBanner from '$lib/components/SceneBanner.svelte';
  import CardAccent from '$lib/components/CardAccent.svelte';
  import { sceneCardStyle } from '$lib/pixelart/scene-bg';
  import { sceneAccentColor } from '$lib/scenes';

  // Pozadí karty dle scény instance (browser-only — vyžaduje canvas).
  function cardStyle(id: string): string {
    return browser ? sceneCardStyle(id) : '';
  }

  // Karta pod kurzorem → mountne animovaný PixiJS akcent (jen jeden naživu).
  let hoverId = $state<string | null>(null);

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Dungeons',
    empty: 'No dungeons known.',
    enter: 'Enter',
    entering: 'Entering…',
    turnBased: '⚔️ Turn-based',
    turnHint: 'Play it out turn by turn (solo).',
    boss: 'Boss',
    encounters: 'Encounters',
    locked: 'Locked',
    reqLevel: 'Requires level',
    attunement: 'Attunement required',
    attunementHint: 'Complete the unlock questline to gain entry.',
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

  // Tahový (solo) mód — interaktivní run (dungeon overhaul Slice 2).
  async function enterTurn(d: DungeonListItem): Promise<void> {
    enteringId = d.id;
    error = null;
    try {
      const run = await enterDungeonTurn(characterId, d.id);
      await goto(`/characters/${characterId}/dungeon-turn/${run.runId}`);
    } catch (err) {
      error = (err as Error).message;
      enteringId = null;
    }
  }

  function sizeLabel(n: number): string {
    return n === 1 ? ui.solo : `${n}-player`;
  }

  // Reprezentativní scéna pro hlavičku (první/nejnižší dungeon v seznamu).
  const bannerScene = $derived(dungeons[0]?.id ?? 'ragefire_chasm');
</script>

<div class="space-y-6">
  <SceneBanner
    sceneId={bannerScene}
    title={ui.title}
    subtitle="Delve into instanced dungeons for gear."
  />

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
        <li
          class="panel panel-pad scene-card {d.unlocked ? '' : 'opacity-60'}"
          style={cardStyle(d.id)}
          onmouseenter={() => (hoverId = d.id)}
          onmouseleave={() => hoverId === d.id && (hoverId = null)}
          role="presentation"
        >
          {#if hoverId === d.id}
            <CardAccent color={sceneAccentColor(d.id)} seed={d.id} />
          {/if}
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
                <button
                  onclick={() => enter(d)}
                  disabled={enteringId !== null}
                  class="btn btn-primary btn-sm"
                >
                  {enteringId === d.id ? ui.entering : ui.enter}
                </button>
                {#if (sizeById[d.id] ?? 1) === 1}
                  <button
                    onclick={() => enterTurn(d)}
                    disabled={enteringId !== null}
                    class="btn btn-sm"
                    title={ui.turnHint}
                  >
                    {ui.turnBased}
                  </button>
                {/if}
              </div>
            {:else}
              <span class="chip shrink-0">
                {#if d.requiresAttunement && !d.attuned}
                  🔒 {ui.attunement}
                {:else}
                  {ui.locked} · {ui.reqLevel} {d.requiredLevel}
                {/if}
              </span>
            {/if}
          </div>
          <p class="mt-2 text-sm text-[var(--text-dim)]">{d.description}</p>
          {#if d.requiresAttunement && !d.attuned}
            <p class="mt-1 text-xs text-[var(--text-faint)]">{ui.attunementHint}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
