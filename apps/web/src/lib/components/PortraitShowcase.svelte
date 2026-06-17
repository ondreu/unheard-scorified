<script lang="ts">
  /**
   * Bohatší „showcase" portrét (M14 increment 7) — větší procedurální portrét
   * v ozdobném rámečku s **frakčním emblémem** (rohová pečeť) a **class crestem**.
   * Pro character sheet / inspect. Kosmetické; reálný art přes `src` override
   * řeší dál Avatar (tady jde o proceduralní showcase kompozici).
   */
  import type { Faction } from '@game/shared';
  import PixelPortrait from './PixelPortrait.svelte';
  import PixelEmblem from './PixelEmblem.svelte';

  let {
    name,
    race,
    klass,
    faction = 'alliance',
    size = 96,
  }: {
    name: string;
    race: string;
    klass: string;
    faction?: Faction;
    size?: number;
  } = $props();
</script>

<div
  class="frame {faction === 'horde' ? 'frame-horde' : 'frame-alliance'} relative shrink-0"
  style={`width:${size}px;height:${size}px`}
  title={`${name} (${race} ${klass})`}
>
  <PixelPortrait {name} {race} {klass} {faction} {size} dim={48} />
  <!-- Frakční pečeť (vlevo nahoře) -->
  <span
    class="absolute left-0.5 top-0.5 leading-none"
    style="filter:drop-shadow(0 1px 1px rgba(0,0,0,.85))"
    aria-hidden="true"
  >
    <PixelEmblem kind="faction" id={faction} size={Math.round(size * 0.26)} />
  </span>
  <!-- Class crest (vpravo dole) -->
  <span
    class="absolute bottom-0.5 right-0.5 leading-none"
    style="filter:drop-shadow(0 1px 1px rgba(0,0,0,.85))"
    aria-hidden="true"
  >
    <PixelEmblem kind="class" id={klass} size={Math.round(size * 0.3)} />
  </span>
</div>
