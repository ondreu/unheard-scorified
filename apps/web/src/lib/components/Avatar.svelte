<script lang="ts">
  import { avatarLook } from '$lib/cosmetics';

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
  style={`width:${size}px;height:${size}px;background:${look.gradient};font-size:${size * 0.42}px`}
  title={`${name} (${race} ${klass})`}
>
  {#if look.src}
    <img src={look.src} alt={name} class="h-full w-full object-cover" />
  {:else}
    <span>{look.initial}</span>
    {#if showEmblem && size >= 36}
      <span
        class="absolute bottom-0 right-0 leading-none"
        style={`font-size:${size * 0.3}px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.8))`}
        aria-hidden="true">{look.emblem}</span
      >
    {/if}
  {/if}
</div>
