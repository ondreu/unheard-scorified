<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    getBestiary,
    markBestiarySeen,
    type BestiaryView,
    type BestiaryEntryView,
  } from '$lib/api';

  const ui = {
    title: 'Bestiary',
    loading: 'Loading…',
    discovered: 'discovered',
    kills: 'defeated',
    notYet: 'Not yet discovered',
    cr: 'CR',
    xp: 'XP',
    attack: 'Attack',
    resist: 'Resists',
    vuln: 'Vulnerable',
    immune: 'Immune',
    abilities: 'Abilities',
    all: 'All',
    discoveredOnly: 'Discovered only',
    search: 'Search…',
    none: 'No enemies match your filters.',
    new: 'NEW',
    boss: 'Boss',
    close: 'Close',
  };

  let view = $state<BestiaryView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Filtry
  let typeFilter = $state<string>('all');
  let discoveredOnly = $state(false);
  let query = $state('');
  let selected = $state<BestiaryEntryView | null>(null);

  const characterId = $derived($page.params.id ?? '');

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      view = await getBestiary(characterId);
      // Reset „nově objeveno" pro příští návštěvu (badge zůstává viditelný tuto session).
      void markBestiarySeen(characterId).catch(() => {});
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

  // Dostupné creature typy (z dat) pro filtr-chipy.
  const types = $derived.by<{ value: string; label: string; icon: string }[]>(() => {
    if (!view) return [];
    const seen = new Map<string, { value: string; label: string; icon: string }>();
    for (const e of view.entries) {
      if (!seen.has(e.creatureType)) {
        seen.set(e.creatureType, { value: e.creatureType, label: e.creatureTypeLabel, icon: e.creatureTypeIcon });
      }
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  });

  const filtered = $derived.by<BestiaryEntryView[]>(() => {
    if (!view) return [];
    const q = query.trim().toLowerCase();
    return view.entries.filter((e) => {
      if (typeFilter !== 'all' && e.creatureType !== typeFilter) return false;
      if (discoveredOnly && !e.discovered) return false;
      if (q && !e.name.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  // Seskupení (filtrované) dle creature typu; zachová pořadí dle CR.
  const groups = $derived.by<{ label: string; icon: string; entries: BestiaryEntryView[] }[]>(() => {
    const byType = new Map<string, { label: string; icon: string; entries: BestiaryEntryView[] }>();
    for (const e of filtered) {
      const g = byType.get(e.creatureType) ?? { label: e.creatureTypeLabel, icon: e.creatureTypeIcon, entries: [] };
      g.entries.push(e);
      byType.set(e.creatureType, g);
    }
    return [...byType.values()].sort((a, b) => a.label.localeCompare(b.label));
  });

  function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
</script>

<div class="space-y-6">
  <div class="flex flex-wrap items-baseline justify-between gap-2">
    <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{ui.title}</h1>
    {#if view}
      <span class="text-sm text-[var(--text-dim)]">
        {view.discoveredCount} / {view.totalCount}
        {ui.discovered} · {view.totalKills}
        {ui.kills}
        {#if view.newCount > 0}
          <span class="bestiary-new ml-1">+{view.newCount} {ui.new}</span>
        {/if}
      </span>
    {/if}
  </div>

  {#if error}<p class="text-sm text-[var(--danger)]">{error}</p>{/if}

  {#if loading}
    <p class="text-[var(--text-dim)]">{ui.loading}</p>
  {:else if view}
    <!-- Filtr bar -->
    <div class="space-y-2">
      <div class="flex flex-wrap gap-1.5">
        <button class="chip-btn" class:chip-active={typeFilter === 'all'} onclick={() => (typeFilter = 'all')}>
          {ui.all}
        </button>
        {#each types as t (t.value)}
          <button class="chip-btn" class:chip-active={typeFilter === t.value} onclick={() => (typeFilter = t.value)}>
            {t.icon} {t.label}
          </button>
        {/each}
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <input class="input input-sm flex-1 min-w-[8rem]" placeholder={ui.search} bind:value={query} />
        <label class="flex items-center gap-1.5 text-xs text-[var(--text-dim)]">
          <input type="checkbox" bind:checked={discoveredOnly} />
          {ui.discoveredOnly}
        </label>
      </div>
    </div>

    {#if filtered.length === 0}
      <p class="text-[var(--text-dim)]">{ui.none}</p>
    {/if}

    {#each groups as group (group.label)}
      <section class="panel panel-pad">
        <h2 class="panel-title">{group.icon} {group.label}</h2>
        <ul class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {#each group.entries as e (e.templateId)}
            <li>
              <button
                type="button"
                class="w-full rounded-lg border border-[var(--border)] p-3 text-left transition-opacity hover:border-[var(--gold-bright)]"
                class:bestiary-locked={!e.discovered}
                onclick={() => (selected = e)}
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <span class="font-semibold text-[var(--text)]">
                      {e.creatureTypeIcon}
                      {e.name}
                      {#if e.isBoss}<span class="text-[var(--gold-bright)]" title={ui.boss}>★</span>{/if}
                      {#if e.isNew}<span class="bestiary-new">{ui.new}</span>{/if}
                    </span>
                    <p class="text-xs text-[var(--text-dim)]">
                      {ui.cr}
                      {e.crLabel} · {e.creatureTypeLabel} · {e.xp}
                      {ui.xp}
                    </p>
                  </div>
                  <span
                    class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
                    style="background:var(--bg-raised, rgba(255,255,255,0.06));color:var(--text-dim)"
                    title="Times defeated"
                  >
                    ⚔ {e.kills}
                  </span>
                </div>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</div>

<!-- Detail stat-block -->
<svelte:window onkeydown={(ev) => ev.key === 'Escape' && (selected = null)} />
{#if selected}
  {@const e = selected}
  <div class="bestiary-overlay">
    <button class="bestiary-backdrop" aria-label={ui.close} onclick={() => (selected = null)}></button>
    <div class="bestiary-modal" class:bestiary-locked={!e.discovered} role="dialog" aria-modal="true" aria-label={e.name}>
      <div class="flex items-start justify-between gap-2">
        <div>
          <h3 class="font-display text-xl font-bold text-[var(--text)]">
            {e.creatureTypeIcon}
            {e.name}
            {#if e.isBoss}<span class="text-[var(--gold-bright)]" title={ui.boss}>★</span>{/if}
          </h3>
          <p class="text-xs text-[var(--text-dim)]">
            {ui.cr}
            {e.crLabel} · {e.creatureTypeLabel} · {e.xp}
            {ui.xp} · ⚔ {e.kills}
            {ui.kills}
          </p>
        </div>
        <button class="btn btn-sm" onclick={() => (selected = null)}>{ui.close}</button>
      </div>

      {#if e.discovered}
        <p class="mt-2 text-sm text-[var(--text-dim)]">{e.description}</p>
      {:else}
        <p class="mt-2 text-sm italic text-[var(--text-faint)]">{ui.notYet}</p>
      {/if}

      <div class="mt-3 flex flex-wrap gap-1 text-xs">
        <span class="bestiary-chip">{ui.attack}: {cap(e.attackType)}</span>
        {#each e.resistances as r (r)}
          <span class="bestiary-chip" style="color:var(--info)">{ui.resist}: {cap(r)}</span>
        {/each}
        {#each e.vulnerabilities as v (v)}
          <span class="bestiary-chip" style="color:var(--danger)">{ui.vuln}: {cap(v)}</span>
        {/each}
        {#each e.immunities as im (im)}
          <span class="bestiary-chip" style="color:var(--gold-bright)">{ui.immune}: {cap(im)}</span>
        {/each}
      </div>

      {#if e.abilities.length > 0}
        <h4 class="panel-title mt-4">{ui.abilities}</h4>
        <ul class="mt-2 space-y-2">
          {#each e.abilities as a (a.id)}
            <li class="rounded-lg border border-[var(--border)] p-2">
              <div class="text-sm font-semibold text-[var(--text)]">
                {a.name}
                {#if a.condition}<span class="text-xs" style="color:var(--danger)"> · {a.condition}</span>{/if}
              </div>
              <p class="text-xs text-[var(--text-dim)]">{a.description}</p>
              <p class="text-[11px] text-[var(--text-faint)]">
                {cap(a.damageType)} · cd {a.cooldownSec}s{#if a.saveAbility} · {a.saveAbility.toUpperCase()} save{/if}
              </p>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}

<style>
  .bestiary-locked {
    filter: grayscale(1);
    opacity: 0.5;
  }
  .bestiary-chip {
    border: 1px solid var(--border);
    border-radius: 9999px;
    padding: 0.05rem 0.4rem;
    color: var(--text-dim);
  }
  .bestiary-new {
    display: inline-block;
    border-radius: 9999px;
    background: var(--gold-bright, #f8b700);
    color: #1a1206;
    font-size: 0.6rem;
    font-weight: 700;
    line-height: 1;
    padding: 0.15rem 0.35rem;
    vertical-align: middle;
  }
  .chip-btn {
    border: 1px solid var(--border);
    border-radius: 9999px;
    padding: 0.15rem 0.6rem;
    font-size: 0.75rem;
    color: var(--text-dim);
    transition: all 0.12s;
  }
  .chip-btn:hover {
    color: var(--text);
  }
  .chip-active {
    background: var(--gold-bright, #f8b700);
    color: #1a1206;
    border-color: var(--gold-bright, #f8b700);
  }
  .bestiary-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .bestiary-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    border: 0;
    cursor: pointer;
  }
  .bestiary-modal {
    position: relative;
    width: 100%;
    max-width: 32rem;
    max-height: 85vh;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    background: var(--bg-panel, #1a1410);
    padding: 1.25rem;
  }
</style>
