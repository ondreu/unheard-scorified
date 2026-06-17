<script lang="ts">
  /**
   * Procedurální pixel-art ikona mountu (M14 increment 7). Vizuální varianta
   * (skin) oddělená od power — viz `$lib/pixelart/mounts`. Renderuje cachovaný
   * data-URL jako `<img>`. Kosmetické.
   */
  import { browser } from '$app/environment';
  import { mountIconDataUrl } from '$lib/pixelart/mounts';

  let {
    id,
    tier,
    size = 48,
    dim = 28,
  }: {
    id: string;
    tier: string;
    size?: number;
    dim?: number;
  } = $props();

  const src = $derived(browser ? mountIconDataUrl(id, tier, dim) : '');
</script>

{#if src}
  <img
    {src}
    alt=""
    width={size}
    height={size}
    style={`width:${size}px;height:${size}px;image-rendering:pixelated;display:block;border-radius:6px`}
    aria-hidden="true"
  />
{/if}
