<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { ApiError, getBestiary, type BestiaryView, type BestiaryEntryView } from '$lib/api';

  const ui = {
    title: 'Bestiary',
    loading: 'Loading…',
    discovered: 'discovered',
    kills: 'defeated',
    notYet: 'Not yet discovered',
    cr: 'CR',
    attack: 'Attack',
    resist: 'Resists',
    vuln: 'Vulnerable',
    immune: 'Immune',
    abilities: 'Abilities',
  };

  let view = $state<BestiaryView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const characterId = $derived($page.params.id ?? '');

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      view = await getBestiary(characterId);
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

  // Seskupení dle creature typu (zachová pořadí z view = vzestupně dle CR).
  const groups = $derived.by<{ label: string; icon: string; entries: BestiaryEntryView[] }[]>(() => {
    if (!view) return [];
    const byType = new Map<string, { label: string; icon: string; entries: BestiaryEntryView[] }>();
    for (const e of view.entries) {
      const g = byType.get(e.creatureType) ?? {
        label: e.creatureTypeLabel,
        icon: e.creatureTypeIcon,
        entries: [],
      };
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
      </span>
    {/if}
  </div>

  {#if error}<p class="text-sm text-[var(--danger)]">{error}</p>{/if}

  {#if loading}
    <p class="text-[var(--text-dim)]">{ui.loading}</p>
  {:else if view}
    {#each groups as group (group.label)}
      <section class="panel panel-pad">
        <h2 class="panel-title">{group.icon} {group.label}</h2>
        <ul class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {#each group.entries as e (e.templateId)}
            <li
              class="rounded-lg border border-[var(--border)] p-3 transition-opacity"
              class:bestiary-locked={!e.discovered}
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <span class="font-semibold text-[var(--text)]">
                    {e.creatureTypeIcon}
                    {e.name}
                    {#if e.isBoss}<span class="text-[var(--gold-bright)]" title="Boss">★</span>{/if}
                  </span>
                  <p class="text-xs text-[var(--text-dim)]">
                    {ui.cr}
                    {e.crLabel} · {e.creatureTypeLabel} · {e.xp} XP
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

              {#if e.discovered}
                <p class="mt-1.5 text-xs text-[var(--text-dim)]">{e.description}</p>
                <div class="mt-2 flex flex-wrap gap-1 text-[11px]">
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
                  <ul class="mt-2 space-y-1">
                    {#each e.abilities as a (a.id)}
                      <li class="text-[11px] text-[var(--text-faint)]">
                        <span class="text-[var(--text-dim)]">{a.name}</span> — {a.description}
                        {#if a.condition}<span style="color:var(--danger)"> ({a.condition})</span>{/if}
                      </li>
                    {/each}
                  </ul>
                {/if}
              {:else}
                <p class="mt-1.5 text-xs italic text-[var(--text-faint)]">{ui.notYet}</p>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</div>

<style>
  /* Neobjevený nepřítel = grayscale + ztlumený, ale stále viditelný (PM rozhodnutí). */
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
</style>
