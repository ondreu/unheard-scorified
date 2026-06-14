<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { ApiError, listCharacters, type CharacterView } from '$lib/api';
  import { RACES, CLASSES } from '@game/shared';

  let characters = $state<CharacterView[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      characters = await listCharacters();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await goto('/login');
        return;
      }
      error = (err as Error).message;
    } finally {
      loading = false;
    }
  });
</script>

<main class="mx-auto max-w-2xl px-6 py-12">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold text-amber-200">Your characters</h1>
    <a
      href="/characters/new"
      class="rounded bg-amber-700 px-3 py-1.5 text-sm font-semibold hover:bg-amber-600"
    >
      + New character
    </a>
  </div>

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if error}
    <p class="mt-6 text-red-400">{error}</p>
  {:else if characters.length === 0}
    <p class="mt-6 text-amber-100/60">You don't have any characters yet. Create your first one!</p>
  {:else}
    <ul class="mt-6 space-y-2">
      {#each characters as c (c.id)}
        <li>
          <a
            href={`/characters/${c.id}`}
            class="flex items-center justify-between rounded border border-amber-900/40 bg-black/20 px-4 py-3 hover:border-amber-600"
          >
            <span class="font-semibold text-amber-100">{c.name}</span>
            <span class="text-sm text-amber-100/60">
              {RACES[c.race as keyof typeof RACES]?.name} · {CLASSES[
                c.class as keyof typeof CLASSES
              ]?.name} · lvl {c.sheet.level}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</main>
