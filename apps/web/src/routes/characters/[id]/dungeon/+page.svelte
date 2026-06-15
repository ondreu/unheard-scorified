<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  // Dungeony jsou nově group PVE runy (M8.5-B): běžící run se sleduje na
  // /dungeon/[runId]. Tahle bez-parametrová route už nemá obsah → přesměruj
  // na seznam dungeonů.
  const characterId = $derived($page.params.id ?? '');
  onMount(() => {
    void goto(`/characters/${characterId}/dungeons`, { replaceState: true });
  });
</script>

<main class="mx-auto max-w-lg px-6 py-12">
  <p class="text-amber-100/50">Redirecting…</p>
</main>
