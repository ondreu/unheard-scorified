<script lang="ts">
  /**
   * Per-tier zobrazení spell slotů v boji (Spell UI, Slice 2) — nahrazuje agregát
   * „✨ 12/18". Pro každý tier s max > 0 ukáže pipy (rozsvícené = zbývá). Data jsou
   * `Record<tier, count>` (zbývající + max), tak jak je vrací combat API
   * (`player.spellSlots` / `player.maxSpellSlots`). Kompaktní HUD varianta.
   */
  let {
    slots = {},
    max = {},
    title = 'Spell slots',
  }: {
    slots?: Record<number, number>;
    max?: Record<number, number>;
    title?: string;
  } = $props();

  const tiers = $derived(
    Object.keys(max)
      .map(Number)
      .filter((t) => (max[t] ?? 0) > 0)
      .sort((a, b) => a - b),
  );
</script>

{#if tiers.length > 0}
  <span class="slot-bar" {title} aria-label={title}>
    {#each tiers as t (t)}
      {@const m = max[t] ?? 0}
      {@const left = slots[t] ?? 0}
      <span class="tier">
        <span class="tier-label">{t === 0 ? 'C' : t}</span>
        <span class="pips">
          {#each { length: m } as _, i (i)}
            <span class="pip {i < left ? 'on' : 'off'}"></span>
          {/each}
        </span>
      </span>
    {/each}
  </span>
{/if}

<style>
  .slot-bar {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    align-items: center;
    vertical-align: middle;
  }
  .tier {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
  }
  .tier-label {
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--accent, #7db4e0);
    opacity: 0.85;
    min-width: 0.6rem;
    text-align: center;
  }
  .pips {
    display: inline-flex;
    gap: 0.15rem;
  }
  .pip {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 2px;
    border: 1px solid color-mix(in srgb, var(--accent, #7db4e0) 45%, transparent);
  }
  .pip.on {
    background: var(--accent, #7db4e0);
    box-shadow: 0 0 3px color-mix(in srgb, var(--accent, #7db4e0) 60%, transparent);
  }
  .pip.off {
    background: transparent;
    opacity: 0.55;
  }
</style>
