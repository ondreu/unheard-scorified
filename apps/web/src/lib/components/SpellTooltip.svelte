<script lang="ts">
  /**
   * Hover/tap obal pro combat ability tlačítka (Spell UI, Slice 3) — nad obsahem
   * (`children`, typicky cast tlačítko) ukáže plnou SpellCard. Desktop: na hover.
   * Mobil/touch: tap na malou ⓘ kotvu (cast tap na tlačítku zůstává nedotčený).
   *
   * Ability se dohledá podle `id` (combat view nese id) přes `findAbilityById` —
   * jednoznačné i tam, kde se jméno opakuje (sorc_fireball vs wiz_fireball).
   */
  import { findAbilityById } from '@game/shared';
  import SpellCard from './SpellCard.svelte';

  let {
    abilityId,
    level = 1,
    slotTier,
    spellSaveDc,
    children,
  }: {
    abilityId: string;
    level?: number;
    /** Zvolený upcast slot tier (Upcast — volba slotu) → karta ukáže upcastnuté kostky. */
    slotTier?: number;
    spellSaveDc?: number;
    children?: import('svelte').Snippet;
  } = $props();

  const ability = $derived(findAbilityById(abilityId));
  let pinned = $state(false);

  function toggle(e: MouseEvent): void {
    e.stopPropagation();
    pinned = !pinned;
  }
</script>

<div class="tip-wrap group">
  {@render children?.()}
  {#if ability}
    <button
      type="button"
      class="info"
      aria-label="Spell details"
      onclick={toggle}
      onmouseleave={() => (pinned = false)}
    >ⓘ</button>
    <div class="card-pop" class:pinned role="tooltip">
      <SpellCard {ability} {level} {slotTier} {spellSaveDc} compact />
    </div>
  {/if}
</div>

<style>
  .tip-wrap {
    position: relative;
  }
  .info {
    position: absolute;
    top: -0.4rem;
    right: -0.4rem;
    width: 1.05rem;
    height: 1.05rem;
    font-size: 0.7rem;
    line-height: 1;
    border-radius: 999px;
    border: 1px solid var(--border, #555);
    background: var(--surface, #222);
    color: var(--text-dim, #9aa);
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card-pop {
    position: absolute;
    bottom: calc(100% + 0.4rem);
    left: 0;
    z-index: 30;
    width: max-content;
    opacity: 0;
    pointer-events: none;
    transform: translateY(0.25rem);
    transition:
      opacity 0.12s ease,
      transform 0.12s ease;
  }
  /* Desktop hover (jemné pointer zařízení) */
  @media (hover: hover) and (pointer: fine) {
    .tip-wrap:hover .card-pop {
      opacity: 1;
      transform: translateY(0);
    }
  }
  /* Tap-pin (mobil i desktop) */
  .card-pop.pinned {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
</style>
