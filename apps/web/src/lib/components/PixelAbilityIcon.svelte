<script lang="ts">
  /**
   * Procedurální pixel-art ikona combat ability (M14 increment 2).
   * Renderuje cachovaný data-URL (viz `$lib/pixelart/abilities`) jako `<img>` —
   * lehké i v combat logu s mnoha řádky (jedna ikona = jeden render). Druh
   * (`kind`) lze dodat přímo, nebo se dohledá podle jména z katalogu. Kosmetické.
   */
  import { browser } from '$app/environment';
  import { findAbilityByName, type AbilityKind } from '@game/shared';
  import { abilityIconDataUrl } from '$lib/pixelart/abilities';

  let {
    name,
    kind,
    size = 16,
    dim = 16,
  }: {
    name: string;
    /** Druh ability; když chybí, dohledá se podle jména. */
    kind?: AbilityKind;
    size?: number;
    dim?: number;
  } = $props();

  const resolvedKind = $derived<AbilityKind>(kind ?? findAbilityByName(name)?.kind ?? 'strike');
  const src = $derived(browser ? abilityIconDataUrl(name, resolvedKind, dim) : '');
</script>

{#if src}
  <img
    {src}
    alt=""
    width={size}
    height={size}
    style={`width:${size}px;height:${size}px;image-rendering:pixelated;display:inline-block;vertical-align:middle`}
    aria-hidden="true"
  />
{/if}
