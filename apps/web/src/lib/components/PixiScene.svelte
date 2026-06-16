<script lang="ts">
  /**
   * PixiJS procedurální pixel-art scénka (M9 vizuální refresh).
   *
   * Izolovaná, čistě kosmetická komponenta (viz CLAUDE.md: „PixiJS v izolovaných
   * komponentách"). Renderuje deterministickou pixel-art scenérii pro zónu /
   * dungeon / raid podle datového tématu (`scenes.ts`). Determinismus zajišťuje
   * `SeededRng` seedovaný z id scény → stejná scéna = vždy stejný obraz.
   *
   * SSR-safe: Pixi se načítá dynamicky až v onMount (client). Pod canvasem je
   * vždy CSS-gradient fallback, takže se něco zobrazí i bez/při selhání Pixi.
   * Respektuje prefers-reduced-motion (vypne animaci částic).
   */
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { SeededRng, seedFromString, type Faction } from '@game/shared';
  import type * as Pixi from 'pixi.js';
  import {
    themeForScene,
    sceneCssGradient,
    type SceneTheme,
    type PropKind,
  } from '$lib/scenes';

  let {
    sceneId,
    faction = 'alliance',
    height = 160,
    class: klass = '',
  }: {
    sceneId: string;
    faction?: Faction;
    height?: number;
    class?: string;
  } = $props();

  const theme = $derived(themeForScene(sceneId, faction));
  const cssBg = $derived(sceneCssGradient(theme));

  // Interní (nízké) rozlišení → CSS upscale = pixel-art look.
  const SCALE = 3;

  let host: HTMLDivElement;
  let app: Pixi.Application | null = null;
  let scene: Pixi.Graphics | null = null;
  let parts: Pixi.Graphics | null = null;
  let particles: { x: number; y: number; vx: number; vy: number; s: number }[] = [];
  // Seedovaný RNG i pro respawn částic (žádný Math.random — viz CLAUDE.md konvence).
  let fxRng: SeededRng | null = null;
  let iw = 0;
  let ih = 0;
  let lastW = 0;
  let reduceMotion = false;

  function lerpColor(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 0xff,
      ag = (a >> 8) & 0xff,
      ab = a & 0xff;
    const br = (b >> 16) & 0xff,
      bg = (b >> 8) & 0xff,
      bb = b & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return (r << 16) | (g << 8) | bl;
  }

  /** Blokový „kruh" (disc) — pixelově čitelné nebeské těleso. */
  function disc(g: Pixi.Graphics, cx: number, cy: number, r: number, color: number): void {
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
      if (w <= 0) continue;
      g.rect(cx - w, cy + y, w * 2, 1).fill(color);
    }
  }

  function drawProp(
    g: Pixi.Graphics,
    kind: PropKind,
    x: number,
    baseY: number,
    sz: number,
    t: SceneTheme,
    rng: SeededRng,
  ): void {
    const wood = 0x4a3422;
    switch (kind) {
      case 'tree': {
        g.rect(x - 1, baseY - sz, 3, sz).fill(wood);
        disc(g, x, baseY - sz - sz * 0.4, sz * 0.7, t.foliage);
        break;
      }
      case 'pine': {
        g.rect(x - 1, baseY - sz * 0.4, 2, sz * 0.4).fill(wood);
        for (let i = 0; i < 3; i++) {
          const ww = sz * (0.7 - i * 0.18);
          const yy = baseY - sz * 0.4 - i * sz * 0.28;
          g.poly([x, yy - sz * 0.34, x - ww, yy, x + ww, yy]).fill(t.foliage);
        }
        break;
      }
      case 'deadtree': {
        g.rect(x - 1, baseY - sz, 2, sz).fill(wood);
        g.rect(x, baseY - sz * 0.8, sz * 0.4, 2).fill(wood);
        g.rect(x - sz * 0.35, baseY - sz * 0.6, sz * 0.35, 2).fill(wood);
        break;
      }
      case 'cactus': {
        const c = 0x4f6b34;
        g.rect(x - 1, baseY - sz, 3, sz).fill(c);
        g.rect(x + 1, baseY - sz * 0.7, sz * 0.3, 2).fill(c);
        g.rect(x + sz * 0.3, baseY - sz * 0.7, 2, sz * 0.3).fill(c);
        g.rect(x - sz * 0.3, baseY - sz * 0.55, sz * 0.3, 2).fill(c);
        g.rect(x - sz * 0.3, baseY - sz * 0.55, 2, sz * 0.25).fill(c);
        break;
      }
      case 'ruin': {
        const cols = 2 + rng.int(0, 1);
        for (let i = 0; i < cols; i++) {
          const ch = sz * (0.4 + rng.next() * 0.6);
          g.rect(x + i * 5 - cols * 2, baseY - ch, 4, ch).fill(t.stone);
        }
        break;
      }
      case 'tower': {
        const tw = Math.max(6, sz * 0.5);
        g.rect(x - tw / 2, baseY - sz * 1.6, tw, sz * 1.6).fill(t.stone);
        // cimbuří
        for (let i = 0; i < 3; i++)
          g.rect(x - tw / 2 + i * (tw / 2.5), baseY - sz * 1.6 - 2, tw / 4, 2).fill(t.stone);
        if (t.glow !== undefined)
          g.rect(x - 1, baseY - sz * 1.0, 2, 3).fill({ color: t.glow, alpha: 0.9 });
        break;
      }
      case 'crystal': {
        const c = t.glow ?? 0x8ad0e0;
        g.poly([x, baseY - sz * 1.2, x - sz * 0.3, baseY, x + sz * 0.3, baseY]).fill({
          color: c,
          alpha: 0.85,
        });
        g.poly([x + 3, baseY - sz * 0.7, x + 1, baseY, x + 6, baseY]).fill({ color: c, alpha: 0.6 });
        break;
      }
      case 'gravestone': {
        g.rect(x - sz * 0.25, baseY - sz * 0.6, sz * 0.5, sz * 0.6).fill(t.stone);
        g.rect(x - 1, baseY - sz * 0.75, 2, sz * 0.3).fill(t.stone);
        g.rect(x - sz * 0.2, baseY - sz * 0.62, sz * 0.4, 2).fill(t.stone);
        break;
      }
      case 'mushroom': {
        g.rect(x - 1, baseY - sz * 0.4, 2, sz * 0.4).fill(0xd8c8b0);
        disc(g, x, baseY - sz * 0.4, sz * 0.3, t.glow ?? 0xb05a4a);
        break;
      }
      case 'lavapool': {
        const c = t.glow ?? 0xff6a20;
        const w = sz * 1.6;
        g.rect(x - w / 2, baseY - 2, w, 3).fill({ color: c, alpha: 0.9 });
        g.rect(x - w / 2 - 2, baseY, w + 4, 2).fill({ color: c, alpha: 0.4 });
        break;
      }
      case 'stalactite': {
        // visí ze stropu (baseY = 0)
        g.poly([x, baseY + sz * 1.2, x - sz * 0.22, baseY, x + sz * 0.22, baseY]).fill(t.stone);
        break;
      }
    }
  }

  function buildScene(): void {
    if (!app || !scene || !parts) return;
    const g = scene;
    g.clear();
    const rng = new SeededRng(seedFromString(sceneId || 'default'));
    fxRng = new SeededRng(seedFromString((sceneId || 'default') + ':fx'));
    const w = iw;
    const h = ih;
    const horizon = Math.round(h * 0.7);

    // 1) Pásové nebe (gradient → blokově).
    for (let y = 0; y < horizon; y++) {
      g.rect(0, y, w, 1).fill(lerpColor(theme.skyTop, theme.skyBottom, y / horizon));
    }

    // 2) Nebeské těleso + hvězdy (u měsíce).
    if (theme.celestial !== 'none') {
      const cx = Math.round(w * (0.15 + rng.next() * 0.7));
      const cy = Math.round(h * (0.12 + rng.next() * 0.16));
      const r = Math.max(4, Math.round(h * 0.1));
      disc(g, cx, cy, r, theme.celestialColor);
      if (theme.celestial === 'moon') {
        for (let i = 0; i < 30; i++) {
          const sx = Math.round(rng.next() * w);
          const sy = Math.round(rng.next() * horizon * 0.8);
          g.rect(sx, sy, 1, 1).fill({ color: 0xffffff, alpha: 0.5 + rng.next() * 0.5 });
        }
      }
    }

    // 3) Hřebeny siluet (daleko → blízko).
    for (const ridge of theme.ridges) {
      const crest = ridge.rel * h;
      const pts: number[] = [0, h];
      const step = Math.max(4, Math.round(w / 24));
      let prev = crest;
      for (let x = 0; x <= w; x += step) {
        prev += (rng.next() - 0.5) * h * 0.1;
        const y = Math.max(crest - h * 0.12, Math.min(horizon, prev));
        pts.push(x, Math.round(y));
      }
      pts.push(w, h);
      g.poly(pts).fill(ridge.color);
    }

    // 4) Země + struktura.
    g.rect(0, horizon, w, h - horizon).fill(theme.ground);
    for (let i = 0; i < Math.round(w * 0.4); i++) {
      const sx = Math.round(rng.next() * w);
      const sy = horizon + Math.round(rng.next() * (h - horizon));
      g.rect(sx, sy, 1, 1).fill({ color: theme.groundAccent, alpha: 0.6 });
    }

    // 5) Stalaktity ze stropu (jen jeskynní témata, kde je v props).
    if (theme.props.includes('stalactite')) {
      const n = 3 + rng.int(0, 3);
      for (let i = 0; i < n; i++) {
        const x = Math.round((i + 0.5) * (w / n) + (rng.next() - 0.5) * 12);
        drawProp(g, 'stalactite', x, 0, h * (0.12 + rng.next() * 0.12), theme, rng);
      }
    }

    // 6) Midground propy podél horizontu.
    const groundProps = theme.props.filter((p) => p !== 'stalactite');
    if (groundProps.length > 0) {
      const slots = Math.min(7, Math.max(2, Math.round(w / 44)));
      for (let i = 0; i < slots; i++) {
        const kind = groundProps[rng.int(0, groundProps.length - 1)] as PropKind;
        const x = Math.round((i + 0.5) * (w / slots) + (rng.next() - 0.5) * (w / slots) * 0.5);
        const sz = h * (0.16 + rng.next() * 0.14);
        drawProp(g, kind, x, horizon + 1, sz, theme, rng);
      }
    }

    // 7) Inicializace částic.
    particles = [];
    if (theme.particle !== 'none') {
      const count = theme.particle === 'dust' ? 24 : 40;
      for (let i = 0; i < count; i++) {
        particles.push(spawnParticle(rng.next() * w, rng.next() * h, rng));
      }
    }
    drawParticles();
  }

  function spawnParticle(x: number, y: number, rng: SeededRng) {
    switch (theme.particle) {
      case 'ember':
        return { x, y, vx: (rng.next() - 0.5) * 0.2, vy: -(0.2 + rng.next() * 0.4), s: 1 };
      case 'snow':
        return { x, y, vx: (rng.next() - 0.5) * 0.2, vy: 0.2 + rng.next() * 0.3, s: 1 };
      case 'spore':
        return { x, y, vx: (rng.next() - 0.5) * 0.15, vy: -(0.05 + rng.next() * 0.15), s: 1 };
      case 'dust':
        return { x, y, vx: 0.15 + rng.next() * 0.25, vy: (rng.next() - 0.5) * 0.1, s: 1 };
      default:
        return { x, y, vx: 0, vy: 0, s: 1 };
    }
  }

  function drawParticles(): void {
    if (!parts) return;
    parts.clear();
    const color =
      theme.particle === 'ember'
        ? (theme.glow ?? 0xff7a30)
        : theme.particle === 'spore'
          ? (theme.glow ?? 0x9bd24a)
          : 0xffffff;
    const alpha = theme.particle === 'dust' ? 0.25 : 0.7;
    for (const p of particles) {
      parts.rect(Math.round(p.x), Math.round(p.y), p.s, p.s).fill({ color, alpha });
    }
  }

  function tick(): void {
    if (particles.length === 0) return;
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      const rand = () => fxRng?.next() ?? 0.5;
      if (p.y < -2) {
        p.y = ih + 2;
        p.x = rand() * iw;
      } else if (p.y > ih + 2) {
        p.y = -2;
        p.x = rand() * iw;
      }
      if (p.x < -2) p.x = iw + 2;
      else if (p.x > iw + 2) p.x = -2;
    }
    drawParticles();
  }

  function resize(): void {
    if (!app || !host) return;
    const w = Math.max(120, Math.round(host.clientWidth));
    if (w === lastW) return;
    lastW = w;
    iw = Math.round(w / SCALE);
    ih = Math.round(height / SCALE);
    app.renderer.resize(iw, ih);
    app.canvas.style.width = `${w}px`;
    app.canvas.style.height = `${height}px`;
    buildScene();
  }

  onMount(() => {
    if (!browser) return;
    reduceMotion =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let ro: ResizeObserver | null = null;
    let disposed = false;

    (async () => {
      try {
        const PIXI = await import('pixi.js');
        if (disposed) return;
        const application = new PIXI.Application();
        await application.init({
          width: 1,
          height: 1,
          backgroundAlpha: 0,
          antialias: false,
          autoDensity: false,
          resolution: 1,
        });
        if (disposed) {
          application.destroy(true);
          return;
        }
        app = application;
        scene = new PIXI.Graphics();
        parts = new PIXI.Graphics();
        app.stage.addChild(scene, parts);
        app.canvas.style.imageRendering = 'pixelated';
        app.canvas.style.display = 'block';
        host.appendChild(app.canvas);
        resize();
        if (!reduceMotion) app.ticker.add(tick);
        ro = new ResizeObserver(() => resize());
        ro.observe(host);
      } catch {
        // CSS gradient fallback zůstává — žádný hard fail UI.
      }
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      app?.destroy(true, { children: true });
      app = null;
      scene = null;
      parts = null;
      particles = [];
    };
  });

  // Přerenderování při změně scény (id/téma) bez re-initu Pixi appky.
  $effect(() => {
    void sceneId;
    void theme;
    if (app && scene) buildScene();
  });
</script>

<div
  bind:this={host}
  class="pixi-scene {klass}"
  style={`height:${height}px;background:${cssBg}`}
  role="img"
  aria-label="Scenery illustration"
></div>

<style>
  .pixi-scene {
    position: relative;
    width: 100%;
    overflow: hidden;
    line-height: 0;
  }
</style>
