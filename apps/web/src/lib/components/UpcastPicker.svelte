<script lang="ts">
  /**
   * Vědomá volba **upcast tieru** (Upcast — volba slotu hráčem). Pro upcastovatelné
   * kouzlo (`upcastPerSlot > 0`) s aspoň dvěma dostupnými sloty tieru ≥ `spellTier`
   * ukáže řádek tlačítek „T{tier}" → hráč zvolí, jakým slotem sešle (Fireball z 3.
   * vs 5. tieru). `selected` je bindable (per-ability). Default = nejvyšší dostupný
   * tier (shoduje se s dosavadním auto-upcastem nuke). Když žádná volba nedává smysl
   * (cantrip/martial, jediný tier, neupcastovatelné), nevykreslí nic a vynuluje volbu.
   *
   * Zdroj pravdy o castovatelných tierech = sdílený `castableTiers` (@game/shared) →
   * UI se nerozejde s validací/spotřebou v enginu.
   */
  import { castableTiers } from '@game/shared';

  let {
    spellTier,
    upcastPerSlot,
    slots = {},
    selected = $bindable(),
    disabled = false,
  }: {
    spellTier: number;
    upcastPerSlot: number;
    slots?: Record<number, number>;
    selected: number | undefined;
    disabled?: boolean;
  } = $props();

  const tiers = $derived(castableTiers(slots, spellTier));
  const show = $derived(upcastPerSlot > 0 && tiers.length >= 2);

  // Default = nejvyšší dostupný tier (= dosavadní auto upcast); drž volbu validní,
  // když se sloty změní (spotřebovaný tier zmizí z nabídky).
  $effect(() => {
    if (!show) {
      if (selected !== undefined) selected = undefined;
      return;
    }
    if (selected == null || !tiers.includes(selected)) selected = tiers[tiers.length - 1];
  });
</script>

{#if show}
  <div class="upcast" role="group" aria-label="Upcast slot tier">
    {#each tiers as tier (tier)}
      <button
        type="button"
        class="chip"
        class:active={selected === tier}
        {disabled}
        onclick={(e) => {
          e.stopPropagation();
          selected = tier;
        }}
        title={tier > spellTier
          ? `Cast with a tier ${tier} slot (+${(tier - spellTier) * upcastPerSlot}d)`
          : `Cast with a tier ${tier} slot`}
      >
        T{tier}{#if tier > spellTier}<span class="bonus">+{(tier - spellTier) * upcastPerSlot}d</span>{/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .upcast {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    padding: 0.1rem 0.35rem;
    font-size: 0.65rem;
    font-weight: 700;
    line-height: 1.1;
    border-radius: 4px;
    border: 1px solid color-mix(in srgb, var(--accent, #7db4e0) 45%, transparent);
    color: var(--accent, #7db4e0);
    background: transparent;
    cursor: pointer;
  }
  .chip:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .chip.active {
    background: var(--accent, #7db4e0);
    color: var(--bg, #0d1117);
    box-shadow: 0 0 4px color-mix(in srgb, var(--accent, #7db4e0) 60%, transparent);
  }
  .bonus {
    font-size: 0.6rem;
    opacity: 0.85;
  }
</style>
