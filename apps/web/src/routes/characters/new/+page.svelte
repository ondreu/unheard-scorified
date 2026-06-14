<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    RACE_IDS,
    RACES,
    CLASSES,
    isValidRaceClass,
    isValidCharacterName,
    type RaceId,
    type ClassId,
  } from '@game/shared';
  import { createCharacter } from '$lib/api';

  let name = $state('');
  let race = $state<RaceId>('human');
  let klass = $state<ClassId | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);

  // Classy dostupné pro vybranou rasu (vanilla omezení ze sdílených dat).
  const allowedClasses = $derived(RACES[race].allowedClasses);

  // Pokud po změně rasy zvolená classa nesedí, zrušíme výběr.
  $effect(() => {
    if (klass && !isValidRaceClass(race, klass)) klass = null;
  });

  const canSubmit = $derived(isValidCharacterName(name) && klass !== null);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!klass) return;
    error = null;
    busy = true;
    try {
      const char = await createCharacter({ name, race, class: klass });
      await goto(`/characters/${char.id}`);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<main class="mx-auto max-w-lg px-6 py-12">
  <h1 class="text-2xl font-bold text-amber-200">Nová postava</h1>

  <form class="mt-6 space-y-6" onsubmit={submit}>
    <label class="block">
      <span class="text-sm text-amber-100/70">Jméno (2–16 písmen)</span>
      <input
        bind:value={name}
        required
        class="mt-1 w-full rounded border border-amber-900/40 bg-black/30 px-3 py-2"
      />
    </label>

    <div>
      <span class="text-sm text-amber-100/70">Rasa</span>
      <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {#each RACE_IDS as r (r)}
          <button
            type="button"
            onclick={() => (race = r)}
            class={`rounded border px-2 py-2 text-sm ${
              race === r
                ? 'border-amber-500 bg-amber-700/40'
                : 'border-amber-900/40 bg-black/20 hover:border-amber-700'
            }`}
          >
            <span class="block">{RACES[r].name}</span>
            <span class="block text-xs text-amber-100/50">{RACES[r].faction}</span>
          </button>
        {/each}
      </div>
    </div>

    <div>
      <span class="text-sm text-amber-100/70">Classa</span>
      <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {#each allowedClasses as c (c)}
          <button
            type="button"
            onclick={() => (klass = c)}
            class={`rounded border px-2 py-2 text-sm ${
              klass === c
                ? 'border-amber-500 bg-amber-700/40'
                : 'border-amber-900/40 bg-black/20 hover:border-amber-700'
            }`}
          >
            {CLASSES[c].name}
          </button>
        {/each}
      </div>
    </div>

    {#if error}<p class="text-sm text-red-400">{error}</p>{/if}

    <button
      disabled={!canSubmit || busy}
      class="w-full rounded bg-amber-700 px-4 py-2 font-semibold hover:bg-amber-600 disabled:opacity-40"
    >
      {busy ? 'Vytvářím…' : 'Vytvořit postavu'}
    </button>
  </form>
</main>
