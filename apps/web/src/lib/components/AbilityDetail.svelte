<script lang="ts">
  /**
   * Detail combat ability (klik na jméno ability v logu). Data z
   * `findAbilityByName` (katalog `data/abilities.ts`); vykreslí sdílenou spell
   * kartu (SpellCard). UI strings anglicky.
   */
  import { findAbilityByName } from '@game/shared';
  import { inspectAbility, activeCharacterLevel, activeCharacterSpellSaveDc } from '$lib/ui-stores';
  import SpellCard from './SpellCard.svelte';

  const name = $derived($inspectAbility);
  const ability = $derived(name ? findAbilityByName(name) : undefined);

  function close(): void {
    inspectAbility.set(null);
  }
</script>

{#if name}
  <div
    class="overlay"
    role="button"
    tabindex="0"
    onclick={close}
    onkeydown={(e) => e.key === 'Escape' && close()}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="w-full max-w-sm"
      role="dialog"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
    >
      {#if ability}
        <SpellCard
          {ability}
          level={$activeCharacterLevel ?? 1}
          spellSaveDc={$activeCharacterSpellSaveDc ?? undefined}
        />
      {:else}
        <div class="panel panel-pad">
          <h2 class="text-xl font-bold text-[var(--gold-bright)]">{name}</h2>
          <p class="mt-3 text-sm text-[var(--text-faint)]">No details available.</p>
        </div>
      {/if}
      <button class="btn btn-sm mt-3 w-full" onclick={close}>Close</button>
    </div>
  </div>
{/if}
