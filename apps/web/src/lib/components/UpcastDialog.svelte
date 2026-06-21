<script lang="ts">
  /**
   * Kontextový cast dialog pro **vědomou volbu upcast slotu** (Upcast — volba slotu,
   * UI varianta A). Otevře se jen při tapnutí na upcastovatelné kouzlo, které má
   * reálnou volbu (≥ 2 dostupné tiery) — mřížka ability tak zůstává čistá (žádné
   * trvalé chipy). Ukáže plnou `SpellCard` se **živým náhledem poškození** pro
   * zvolený tier + segmentový volič slotů a tlačítka Cast/Cancel.
   *
   * Zdroj pravdy o castovatelných tierech = sdílený `castableTiers` (@game/shared);
   * plná ability pro kartu se dohledá přes `findAbilityById` (jako SpellTooltip).
   * Default volba = nejvyšší dostupný tier (= dosavadní auto-upcast nuke).
   */
  import { castableTiers, findAbilityById } from '@game/shared';
  import SpellCard from './SpellCard.svelte';

  let {
    ability,
    slots = {},
    level = 1,
    spellSaveDc,
    busy = false,
    oncast,
    oncancel,
  }: {
    ability: { id: string; name: string; spellTier: number; upcastPerSlot: number };
    slots?: Record<number, number>;
    level?: number;
    spellSaveDc?: number;
    busy?: boolean;
    oncast: (tier: number) => void;
    oncancel: () => void;
  } = $props();

  const tiers = $derived(castableTiers(slots, ability.spellTier));
  let selected = $state<number | undefined>(undefined);

  // Default = nejvyšší dostupný tier; drž volbu validní, kdyby se nabídka změnila.
  $effect(() => {
    if (selected == null || !tiers.includes(selected)) selected = tiers[tiers.length - 1];
  });

  const full = $derived(findAbilityById(ability.id));

  function confirm(): void {
    if (selected != null) oncast(selected);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') oncancel();
    else if (e.key === 'Enter') confirm();
  }
</script>

<svelte:window onkeydown={onKey} />

<div
  class="overlay"
  role="button"
  tabindex="0"
  onclick={oncancel}
  onkeydown={(e) => e.key === 'Escape' && oncancel()}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="sheet"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label={`Cast ${ability.name}`}
    onclick={(e) => e.stopPropagation()}
    onkeydown={() => {}}
  >
    {#if full}
      <SpellCard ability={full} {level} slotTier={selected} {spellSaveDc} />
    {:else}
      <p class="fallback-name">{ability.name}</p>
    {/if}

    <div class="picker">
      <span class="picker-label">Cast with slot</span>
      <div class="chips">
        {#each tiers as tier (tier)}
          <button
            type="button"
            class="chip"
            class:active={selected === tier}
            onclick={() => (selected = tier)}
          >
            T{tier}{#if tier > ability.spellTier}<span class="bonus">+{(tier - ability.spellTier) * ability.upcastPerSlot}d</span>{/if}
          </button>
        {/each}
      </div>
    </div>

    <div class="actions">
      <button type="button" class="btn flex-1" disabled={busy} onclick={oncancel}>Cancel</button>
      <button type="button" class="btn btn-primary flex-1" disabled={busy || selected == null} onclick={confirm}>
        ✨ Cast{#if selected != null && selected > ability.spellTier} (T{selected}){/if}
      </button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 1rem;
    background: color-mix(in srgb, #000 60%, transparent);
    backdrop-filter: blur(2px);
  }
  /* Desktop: vystředěný; mobil: bottom sheet (align-items výše + responsive). */
  @media (min-width: 640px) {
    .overlay {
      align-items: center;
    }
  }
  .sheet {
    width: 100%;
    max-width: 22rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.9rem;
    border-radius: 12px;
    border: 1px solid var(--border, #3a3a3a);
    background: var(--surface, #1a1a1a);
    box-shadow: 0 12px 40px color-mix(in srgb, #000 55%, transparent);
  }
  .fallback-name {
    font-weight: 700;
    font-size: 1rem;
  }
  .picker {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .picker-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-dim, #9aa);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.35rem 0.6rem;
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1.1;
    border-radius: 7px;
    border: 1px solid color-mix(in srgb, var(--accent, #7db4e0) 45%, transparent);
    color: var(--accent, #7db4e0);
    background: transparent;
    cursor: pointer;
  }
  .chip.active {
    background: var(--accent, #7db4e0);
    color: var(--bg, #0d1117);
    box-shadow: 0 0 5px color-mix(in srgb, var(--accent, #7db4e0) 55%, transparent);
  }
  .bonus {
    font-size: 0.7rem;
    opacity: 0.85;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
  }
</style>
