<script lang="ts">
  /**
   * Procedurální pixel-art portrét hrdiny (M14). Vykresluje deterministickou
   * bystu na 2D canvas podle rasy/classy/frakce (viz `$lib/pixelart/portrait`).
   * Čistě kosmetické. Canvas má interní rozlišení `dim` a CSS ho upscaluje
   * (`image-rendering: pixelated`) → ostrý pixel-art v jakékoli velikosti.
   */
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import type { Faction } from '@game/shared';
  import { Painter } from '$lib/pixelart/core';
  import { drawPortrait } from '$lib/pixelart/portrait';

  let {
    name,
    race,
    klass,
    faction = 'alliance',
    size = 44,
    dim = 40,
  }: {
    name: string;
    race: string;
    klass: string;
    faction?: Faction;
    size?: number;
    dim?: number;
  } = $props();

  let canvas: HTMLCanvasElement;

  function render(): void {
    if (!browser || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const p = new Painter(ctx, dim);
    p.clear();
    drawPortrait(p, { race, klass, faction, seedKey: name });
  }

  onMount(render);

  $effect(() => {
    void [name, race, klass, faction, dim];
    render();
  });
</script>

<canvas
  bind:this={canvas}
  width={dim}
  height={dim}
  style={`width:${size}px;height:${size}px;image-rendering:pixelated;display:block`}
  aria-label={`${name} portrait`}
></canvas>
