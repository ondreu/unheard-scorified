<script lang="ts">
  /**
   * Procedurální pixel-art emblém (M14): class crest / role ikona.
   * Deterministický geometrický glyf na 2D canvas (viz `$lib/pixelart/emblems`).
   * Nahrazuje emoji v UI. Čistě kosmetické. (Frakční znak odstraněn v MR deWoWčení.)
   */
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { Painter } from '$lib/pixelart/core';
  import { drawClassEmblem, drawRoleEmblem } from '$lib/pixelart/emblems';

  let {
    kind,
    id,
    size = 16,
    dim = 16,
  }: {
    /** Druh emblému. */
    kind: 'class' | 'role';
    /** classId / role (dle `kind`). */
    id: string;
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
    if (kind === 'class') drawClassEmblem(p, id);
    else drawRoleEmblem(p, id);
  }

  onMount(render);

  $effect(() => {
    void [kind, id, dim];
    render();
  });
</script>

<canvas
  bind:this={canvas}
  width={dim}
  height={dim}
  style={`width:${size}px;height:${size}px;image-rendering:pixelated;display:inline-block;vertical-align:middle`}
  aria-hidden="true"
></canvas>
