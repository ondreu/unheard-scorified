<script lang="ts">
  /**
   * Procedurální pixel-art ikona itemu (M14 increment 6). Renderuje cachovaný
   * data-URL (viz `$lib/pixelart/items`) jako `<img>` — lehké i v inventáři/AH
   * s mnoha položkami. Kosmetické.
   */
  import { browser } from '$app/environment';
  import type { ArmorClass, ItemRarity, ItemSlotType } from '@game/shared';
  import { itemIconDataUrl } from '$lib/pixelart/items';

  let {
    slot,
    rarity,
    armorClass,
    size = 32,
    dim = 16,
  }: {
    slot: ItemSlotType;
    rarity: ItemRarity;
    armorClass?: ArmorClass;
    size?: number;
    dim?: number;
  } = $props();

  const src = $derived(browser ? itemIconDataUrl(slot, rarity, armorClass, dim) : '');
</script>

{#if src}
  <img
    {src}
    alt=""
    width={size}
    height={size}
    style={`width:${size}px;height:${size}px;image-rendering:pixelated;display:inline-block;vertical-align:middle;border-radius:4px`}
    aria-hidden="true"
  />
{/if}
