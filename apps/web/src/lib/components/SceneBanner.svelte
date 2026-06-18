<script lang="ts">
  /**
   * Prezentační banner pro stránky zón / dungeonů / raidů (M9 vizuální refresh).
   * Procedurální PixiJS scénka (`PixiScene`) + tmavnoucí overlay kvůli čitelnosti
   * textu + titulek/podtitulek. Čistě kosmetické, žádná herní logika.
   */
  import PixiScene from '$lib/components/PixiScene.svelte';

  let {
    sceneId,
    title,
    subtitle = '',
    height = 150,
    children,
  }: {
    sceneId: string;
    title: string;
    subtitle?: string;
    height?: number;
    children?: import('svelte').Snippet;
  } = $props();
</script>

<div class="scene-banner" style={`height:${height}px`}>
  <PixiScene {sceneId} {height} />
  <div class="scene-overlay"></div>
  <div class="scene-text">
    <h1 class="scene-title">{title}</h1>
    {#if subtitle}<p class="scene-subtitle">{subtitle}</p>{/if}
    {#if children}<div class="scene-extra">{@render children()}</div>{/if}
  </div>
</div>

<style>
  .scene-banner {
    position: relative;
    width: 100%;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .scene-banner :global(.pixi-scene) {
    position: absolute;
    inset: 0;
  }
  .scene-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      rgba(18, 13, 9, 0.05) 0%,
      rgba(18, 13, 9, 0.35) 55%,
      rgba(18, 13, 9, 0.85) 100%
    );
    pointer-events: none;
  }
  .scene-text {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 0.85rem 1rem;
    gap: 0.15rem;
  }
  .scene-title {
    font-family: var(--font-display);
    color: var(--gold-bright);
    font-size: 1.5rem;
    line-height: 1.1;
    margin: 0;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9);
  }
  .scene-subtitle {
    color: var(--text);
    font-size: 0.85rem;
    margin: 0;
    max-width: 60ch;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.95);
  }
  .scene-extra {
    margin-top: 0.35rem;
  }
</style>
