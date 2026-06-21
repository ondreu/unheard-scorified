<script lang="ts">
  /**
   * Spell compendium — in-game encyklopedie všech kouzel ve hře. Plně statická
   * (čte sdílený `allCompendiumSpells` z @game/shared — žádné API/DB), zobrazení
   * jede přes sdílený `SpellCard` (jediný zdroj pravdy). Filtr: třída / tier /
   * element (damage type) / save / condition; detail = plná spell karta.
   */
  import {
    allCompendiumSpells,
    spellTierLabel,
    CONDITION_META,
    type CompendiumSpell,
    type ClassId,
    type DamageType,
  } from '@game/shared';
  import SpellCard from '$lib/components/SpellCard.svelte';

  const ui = {
    title: 'Spell Compendium',
    sub: 'Every spell in the game',
    all: 'All',
    search: 'Search…',
    hasSave: 'Saving throw',
    hasCondition: 'Condition',
    classes: 'Class',
    tier: 'Tier',
    element: 'Element',
    none: 'No spells match your filters.',
    close: 'Close',
    available: 'Available to',
    cantrip: 'Cantrip',
  };

  const spells = allCompendiumSpells();

  let classFilter = $state<string>('all');
  let tierFilter = $state<number | 'all'>('all');
  let elementFilter = $state<string>('all');
  let onlySave = $state(false);
  let onlyCondition = $state(false);
  let query = $state('');
  let selected = $state<CompendiumSpell | null>(null);

  function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Filtr-hodnoty odvozené z dat (UI nehardcoduje seznamy).
  const classes = $derived.by<{ value: ClassId; label: string }[]>(() => {
    const seen = new Map<ClassId, string>();
    for (const s of spells) s.classes.forEach((c, i) => seen.set(c, s.classNames[i]!));
    return [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  const tiers = $derived.by<number[]>(() => {
    return [...new Set(spells.map((s) => s.spellTier))].sort((a, b) => a - b);
  });

  const elements = $derived.by<DamageType[]>(() => {
    return [...new Set(spells.map((s) => s.damageType).filter((d): d is DamageType => !!d))].sort();
  });

  const filtered = $derived.by<CompendiumSpell[]>(() => {
    const q = query.trim().toLowerCase();
    return spells.filter((s) => {
      if (classFilter !== 'all' && !s.classes.includes(classFilter as ClassId)) return false;
      if (tierFilter !== 'all' && s.spellTier !== tierFilter) return false;
      if (elementFilter !== 'all' && s.damageType !== elementFilter) return false;
      if (onlySave && !s.saveAbility) return false;
      if (onlyCondition && !s.condition) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  // Grupování dle tieru (zachová pořadí dle tieru pak jména).
  const groups = $derived.by<{ tier: number; label: string; entries: CompendiumSpell[] }[]>(() => {
    const byTier = new Map<number, CompendiumSpell[]>();
    for (const s of filtered) {
      const arr = byTier.get(s.spellTier) ?? [];
      arr.push(s);
      byTier.set(s.spellTier, arr);
    }
    return [...byTier.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([tier, entries]) => ({ tier, label: spellTierLabel(tier), entries }));
  });
</script>

<div class="space-y-6">
  <div class="flex flex-wrap items-baseline justify-between gap-2">
    <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{ui.title}</h1>
    <span class="text-sm text-[var(--text-dim)]">{filtered.length} / {spells.length} {ui.sub.toLowerCase()}</span>
  </div>

  <!-- Filtr bar -->
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-3">
      <input class="input input-sm flex-1 min-w-[8rem]" placeholder={ui.search} bind:value={query} />
      <label class="flex items-center gap-1.5 text-xs text-[var(--text-dim)]">
        <input type="checkbox" bind:checked={onlySave} />
        {ui.hasSave}
      </label>
      <label class="flex items-center gap-1.5 text-xs text-[var(--text-dim)]">
        <input type="checkbox" bind:checked={onlyCondition} />
        {ui.hasCondition}
      </label>
    </div>

    <!-- Třída -->
    <div class="flex flex-wrap gap-1.5">
      <button class="chip-btn" class:chip-active={classFilter === 'all'} onclick={() => (classFilter = 'all')}>
        {ui.classes}: {ui.all}
      </button>
      {#each classes as c (c.value)}
        <button class="chip-btn" class:chip-active={classFilter === c.value} onclick={() => (classFilter = c.value)}>
          {c.label}
        </button>
      {/each}
    </div>

    <!-- Tier -->
    <div class="flex flex-wrap gap-1.5">
      <button class="chip-btn" class:chip-active={tierFilter === 'all'} onclick={() => (tierFilter = 'all')}>
        {ui.tier}: {ui.all}
      </button>
      {#each tiers as t (t)}
        <button class="chip-btn" class:chip-active={tierFilter === t} onclick={() => (tierFilter = t)}>
          {spellTierLabel(t)}
        </button>
      {/each}
    </div>

    <!-- Element -->
    {#if elements.length > 0}
      <div class="flex flex-wrap gap-1.5">
        <button class="chip-btn" class:chip-active={elementFilter === 'all'} onclick={() => (elementFilter = 'all')}>
          {ui.element}: {ui.all}
        </button>
        {#each elements as el (el)}
          <button class="chip-btn" class:chip-active={elementFilter === el} onclick={() => (elementFilter = el)}>
            {cap(el)}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if filtered.length === 0}
    <p class="text-[var(--text-dim)]">{ui.none}</p>
  {/if}

  {#each groups as group (group.tier)}
    <section class="panel panel-pad">
      <h2 class="panel-title">{group.label}</h2>
      <ul class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {#each group.entries as s (s.id)}
          <li>
            <button
              type="button"
              class="w-full rounded-lg border border-[var(--border)] p-3 text-left transition-opacity hover:border-[var(--gold-bright)]"
              onclick={() => (selected = s)}
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <span class="font-semibold text-[var(--text)]">{s.name}</span>
                  <p class="truncate text-xs text-[var(--text-dim)]">{s.classNames.join(', ')}</p>
                </div>
                <div class="flex shrink-0 flex-col items-end gap-1 text-xs">
                  {#if s.damageType}<span class="spell-chip" style="color:var(--gold-bright)">{cap(s.damageType)}</span>{/if}
                  {#if s.condition}<span class="spell-chip" style="color:var(--danger)">{CONDITION_META[s.condition]?.label ?? s.condition}</span>{/if}
                </div>
              </div>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>

<!-- Detail = plná spell karta -->
<svelte:window onkeydown={(ev) => ev.key === 'Escape' && (selected = null)} />
{#if selected}
  {@const s = selected}
  <div class="spell-overlay">
    <button class="spell-backdrop" aria-label={ui.close} onclick={() => (selected = null)}></button>
    <div class="spell-modal" role="dialog" aria-modal="true" aria-label={s.name}>
      <div class="mb-3 flex items-start justify-between gap-2">
        <p class="text-xs text-[var(--text-dim)]">{ui.available}: {s.classNames.join(', ')}</p>
        <button class="btn btn-sm" onclick={() => (selected = null)}>{ui.close}</button>
      </div>
      <SpellCard ability={s.ability} />
    </div>
  </div>
{/if}

<style>
  .spell-chip {
    border: 1px solid var(--border);
    border-radius: 9999px;
    padding: 0.05rem 0.4rem;
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
  .spell-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .spell-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    border: 0;
    cursor: pointer;
  }
  .spell-modal {
    position: relative;
    width: 100%;
    max-width: 28rem;
    max-height: 85vh;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    background: var(--bg-panel, #1a1410);
    padding: 1.25rem;
  }
</style>
