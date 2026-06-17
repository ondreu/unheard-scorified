<script lang="ts">
  import { avatarLook } from '$lib/cosmetics';
  import PixelPortrait from './PixelPortrait.svelte';
  import PixelEmblem from './PixelEmblem.svelte';

  let {
    name,
    race,
    klass,
    size = 44,
    showEmblem = true,
  }: {
    name: string;
    race: string;
    klass: string;
    size?: number;
    showEmblem?: boolean;
  } = $props();

  const look = $derived(avatarLook(name, race, klass));
</script>

<div
  class="frame {look.faction === 'horde' ? 'frame-horde' : 'frame-alliance'}"
  style={`width:${size}px;height:${size}px;background:${look.gradient}`}
  title={`${name} (${race} ${klass})`}
>
  {#if look.src}
    <img src={look.src} alt={name} class="h-full w-full object-cover" />
  {:else}
    <!-- Procedurální pixel-art portrét (deterministický dle jména/rasy/classy). -->
    <PixelPortrait {name} {race} {klass} faction={look.faction} {size} />
    {#if showEmblem && size >= 36}
      <span
        class="absolute bottom-0 right-0 leading-none"
        style="filter:drop-shadow(0 1px 1px rgba(0,0,0,.85))"
        aria-hidden="true"
      >
        <PixelEmblem kind="class" id={klass} size={Math.round(size * 0.32)} />
      </span>
    {/if}
  {/if}
</div>
