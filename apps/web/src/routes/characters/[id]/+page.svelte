<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { ApiError, getCharacter, type CharacterView } from '$lib/api';
  import { RACES, CLASSES } from '@game/shared';

  let character = $state<CharacterView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    const id = $page.params.id;
    if (!id) {
      error = 'Chybí ID postavy';
      loading = false;
      return;
    }
    try {
      character = await getCharacter(id);
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

  const stats: { key: keyof CharacterView['sheet']['primary']; label: string }[] = [
    { key: 'strength', label: 'Síla' },
    { key: 'agility', label: 'Obratnost' },
    { key: 'stamina', label: 'Výdrž' },
    { key: 'intellect', label: 'Inteligence' },
    { key: 'spirit', label: 'Duch' },
  ];
</script>

<main class="mx-auto max-w-lg px-6 py-12">
  <a href="/characters" class="text-sm text-amber-300 underline">← Zpět na postavy</a>

  {#if loading}
    <p class="mt-6 text-amber-100/50">Načítám…</p>
  {:else if error}
    <p class="mt-6 text-red-400">{error}</p>
  {:else if character}
    {@const c = character}
    <h1 class="mt-4 text-3xl font-bold text-amber-200">{c.name}</h1>
    <p class="mt-1 text-amber-100/70">
      {RACES[c.race as keyof typeof RACES]?.name} ·
      {CLASSES[c.class as keyof typeof CLASSES]?.name} ·
      {c.faction === 'horde' ? 'Horda' : 'Aliance'}
    </p>

    <section class="mt-6 rounded-lg border border-amber-900/40 bg-black/20 p-5">
      <div class="flex items-center justify-between">
        <span class="text-lg font-semibold text-amber-200">Level {c.sheet.level}</span>
        <span class="text-sm text-amber-100/60">
          XP {c.sheet.xpIntoLevel}{c.sheet.xpForNext > 0 ? ` / ${c.sheet.xpForNext}` : ' (max)'}
        </span>
      </div>

      <dl class="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div class="flex justify-between">
          <dt class="text-amber-100/70">Život</dt>
          <dd>{c.sheet.derived.health}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-amber-100/70 capitalize">{c.sheet.derived.resource.type}</dt>
          <dd>{c.sheet.derived.resource.max}</dd>
        </div>
        {#each stats as s (s.key)}
          <div class="flex justify-between">
            <dt class="text-amber-100/70">{s.label}</dt>
            <dd>{c.sheet.primary[s.key]}</dd>
          </div>
        {/each}
      </dl>
    </section>
  {/if}
</main>
