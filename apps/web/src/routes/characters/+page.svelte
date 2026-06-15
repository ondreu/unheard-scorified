<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { ApiError, listCharacters, type CharacterView } from '$lib/api';
  import { RACES, CLASSES } from '@game/shared';
  import { CLASS_COLOR, FACTION_COLOR, factionLabel } from '$lib/cosmetics';
  import Avatar from '$lib/components/Avatar.svelte';
  import Badge from '$lib/components/Badge.svelte';

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
    <h1 class="font-display text-3xl font-bold text-[var(--gold-bright)]">Choose your hero</h1>
    <a href="/characters/new" class="btn btn-primary">+ New character</a>
  </div>

  {#if loading}
    <p class="mt-8 text-[var(--text-dim)]">Loading…</p>
  {:else if error}
    <p class="mt-8 text-[var(--danger)]">{error}</p>
  {:else if characters.length === 0}
    <div class="panel panel-pad mt-8 text-center">
      <div class="text-4xl" aria-hidden="true">🗺️</div>
      <p class="mt-2 text-[var(--text-dim)]">No heroes yet. Create your first one to begin!</p>
      <a href="/characters/new" class="btn btn-primary mt-4 inline-flex">Create a hero</a>
    </div>
  {:else}
    <ul class="mt-8 grid gap-3 sm:grid-cols-2">
      {#each characters as c (c.id)}
        <li>
          <a href={`/characters/${c.id}`} class="card !p-3">
            <Avatar name={c.name} race={c.race} klass={c.class} size={56} />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-display text-lg font-semibold text-[var(--gold-bright)]">
                {c.name}
              </span>
              <span class="block truncate text-sm text-[var(--text-dim)]">
                Lv {c.sheet.level} · {RACES[c.race as keyof typeof RACES]?.name}
                <span style={`color:${CLASS_COLOR[c.class] ?? 'inherit'}`}
                  >{CLASSES[c.class as keyof typeof CLASSES]?.name}</span
                >
              </span>
              <span class="mt-1.5 flex">
                <Badge color={FACTION_COLOR[c.faction as 'alliance' | 'horde'] ?? 'var(--gold)'}>
                  {factionLabel(c.faction)}
                </Badge>
              </span>
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</main>
