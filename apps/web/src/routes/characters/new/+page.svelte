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
  import { factionLabel } from '$lib/cosmetics';
  import Avatar from '$lib/components/Avatar.svelte';
  import PixelEmblem from '$lib/components/PixelEmblem.svelte';

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

<main class="mx-auto max-w-2xl px-6 py-12">
  <a href="/characters" class="text-sm text-[var(--gold)] hover:underline">← Back to characters</a>

  <div class="mt-4 mb-6 text-center">
    <div class="flex justify-center" aria-hidden="true">
      <PixelEmblem kind="faction" id={RACES[race].faction} size={48} dim={24} />
    </div>
    <h1 class="mt-2 font-display text-3xl font-bold text-[var(--gold-bright)]">Create your hero</h1>
    <p class="mt-1 text-sm text-[var(--text-dim)]">Choose a race, a class and a name to begin.</p>
  </div>

  <form class="panel panel-pad space-y-6" onsubmit={submit}>
    <!-- Preview -->
    <div class="flex items-center gap-4">
      <Avatar name={name || '?'} {race} klass={klass ?? 'warrior'} size={72} />
      <div class="min-w-0">
        <p class="truncate font-display text-lg font-semibold text-[var(--gold-bright)]">{name || 'Unnamed hero'}</p>
        <p class="text-sm text-[var(--text-dim)]">
          {RACES[race].name}{#if klass} · {CLASSES[klass].name}{/if}
        </p>
      </div>
    </div>

    <label class="block">
      <span class="field-label">Name (2–16 letters)</span>
      <input bind:value={name} required class="input mt-1" />
    </label>

    <div>
      <span class="field-label">Race</span>
      <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {#each RACE_IDS as r (r)}
          <button
            type="button"
            onclick={() => (race = r)}
            class="card flex-col !items-center !gap-1 !p-2 text-center"
            style={race === r ? 'border-color:var(--border-strong)' : ''}
          >
            <Avatar name={RACES[r].name} race={r} klass={klass ?? 'warrior'} size={40} showEmblem={false} />
            <span class="block text-sm">{RACES[r].name}</span>
            <span class="block text-xs text-[var(--text-faint)]">{factionLabel(RACES[r].faction)}</span>
          </button>
        {/each}
      </div>
    </div>

    <div>
      <span class="field-label">Class</span>
      <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {#each allowedClasses as c (c)}
          <button
            type="button"
            onclick={() => (klass = c)}
            class="card !p-2 !justify-center text-center text-sm"
            style={klass === c ? 'border-color:var(--border-strong)' : ''}
          >
            {CLASSES[c].name}
          </button>
        {/each}
      </div>
    </div>

    {#if error}<p class="text-sm text-[var(--danger)]">{error}</p>{/if}

    <button disabled={!canSubmit || busy} class="btn btn-primary w-full">
      {busy ? 'Creating…' : 'Create character'}
    </button>
  </form>
</main>
