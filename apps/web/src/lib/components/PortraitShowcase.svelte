<script lang="ts">
  /**
   * Bohatší „showcase" portrét (M14 increment 7) — větší procedurální portrét
   * v ozdobném rámečku s **class crestem**. Pro character sheet / inspect.
   * Kosmetické; reálný art přes `src` override řeší dál Avatar (tady jde o
   * procedurální showcase kompozici). (Frakční pečeť odstraněna v MR deWoWčení.)
   */
  import PixelPortrait from './PixelPortrait.svelte';
  import PixelEmblem from './PixelEmblem.svelte';

  let {
    name,
    race,
    klass,
    size = 96,
  }: {
    name: string;
    race: string;
    klass: string;
    size?: number;
  } = $props();
</script>

<div
  class="frame relative shrink-0"
  style={`width:${size}px;height:${size}px`}
  title={`${name} (${race} ${klass})`}
>
  <PixelPortrait {name} {race} {klass} {size} dim={48} />
  <!-- Class crest (vpravo dole) -->
  <span
    class="absolute bottom-0.5 right-0.5 leading-none"
    style="filter:drop-shadow(0 1px 1px rgba(0,0,0,.85))"
    aria-hidden="true"
  >
    <PixelEmblem kind="class" id={klass} size={Math.round(size * 0.3)} />
  </span>
</div>
