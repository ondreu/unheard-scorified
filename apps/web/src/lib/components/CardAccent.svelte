<script lang="ts">
  /**
   * Drobný animovaný PixiJS akcent přes kartu (M14 increment 5) — pár stoupajících
   * jisker/embery v barvě scény. Mountuje se **jen** dokud je nad kartou kurzor
   * (rodič renderuje přes `{#if}`), takže je naživu nanejvýš jeden WebGL kontext.
   * SSR-safe (dynamický import Pixi), respektuje `prefers-reduced-motion` (pak
   * nevykreslí nic). Čistě kosmetické, izolované.
   */
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { SeededRng, seedFromString } from '@game/shared';
  import type * as Pixi from 'pixi.js';

  let { color = 0xf0c870, seed = 'accent' }: { color?: number; seed?: string } = $props();

  let host: HTMLDivElement;

  onMount(() => {
    if (!browser) return;
    const reduce =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    let disposed = false;
    let app: Pixi.Application | null = null;
    let g: Pixi.Graphics | null = null;
    let ro: ResizeObserver | null = null;
    const rng = new SeededRng(seedFromString(seed));

    interface P {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      max: number;
      s: number;
    }
    let parts: P[] = [];
    let W = 0;
    let H = 0;

    function spawn(): P {
      const max = 50 + rng.next() * 60;
      return {
        x: rng.next() * W,
        y: H * (0.55 + rng.next() * 0.45),
        vx: (rng.next() - 0.5) * 0.25,
        vy: -(0.2 + rng.next() * 0.45),
        life: 0,
        max,
        s: rng.next() < 0.3 ? 2 : 1,
      };
    }

    function draw(): void {
      if (!g) return;
      g.clear();
      for (const p of parts) {
        const a = Math.max(0, 1 - Math.abs(p.life / p.max - 0.5) * 2);
        g.rect(Math.round(p.x), Math.round(p.y), p.s, p.s).fill({ color, alpha: a * 0.85 });
      }
    }

    function tick(): void {
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.life += 1;
        if (p.life >= p.max || p.y < -2) Object.assign(p, spawn());
      }
      draw();
    }

    function resize(): void {
      if (!app || !host) return;
      W = Math.max(40, host.clientWidth);
      H = Math.max(20, host.clientHeight);
      app.renderer.resize(W, H);
      app.canvas.style.width = `${W}px`;
      app.canvas.style.height = `${H}px`;
    }

    (async () => {
      try {
        const PIXI = await import('pixi.js');
        if (disposed) return;
        const a = new PIXI.Application();
        await a.init({ width: 1, height: 1, backgroundAlpha: 0, antialias: false, resolution: 1 });
        if (disposed) {
          a.destroy(true);
          return;
        }
        app = a;
        g = new PIXI.Graphics();
        app.stage.addChild(g);
        app.canvas.style.display = 'block';
        app.canvas.style.position = 'absolute';
        app.canvas.style.inset = '0';
        app.canvas.style.imageRendering = 'pixelated';
        host.appendChild(app.canvas);
        resize();
        parts = Array.from({ length: 10 }, () => {
          const p = spawn();
          p.life = rng.next() * p.max;
          return p;
        });
        app.ticker.add(tick);
        ro = new ResizeObserver(() => resize());
        ro.observe(host);
      } catch {
        // bez Pixi se nic neděje — karta zůstává statická
      }
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      app?.destroy(true, { children: true });
      app = null;
      g = null;
      parts = [];
    };
  });
</script>

<div bind:this={host} class="card-accent" aria-hidden="true"></div>

<style>
  .card-accent {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
    line-height: 0;
  }
</style>
