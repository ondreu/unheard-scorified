<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';
  import { bootstrapSession } from '$lib/api';
  let { children } = $props();

  // Po reloadu/reopenu tabu obnovíme in-memory session z httpOnly refresh cookie.
  onMount(() => {
    void bootstrapSession();
  });
</script>

{@render children()}
