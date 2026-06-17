<script lang="ts">
  import { session } from '$lib/auth';
</script>

<main class="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
  <div class="mb-6 text-6xl" aria-hidden="true">⚔️</div>
  <h1 class="font-display text-5xl font-bold tracking-tight text-[var(--gold-bright)]">AFK to 60</h1>
  <p class="mt-3 max-w-md text-[var(--text-dim)]">
    A WoW-inspired idle RPG. Send your hero questing, raiding and battling in the arena — and reach
    level 60 even while you're away.
  </p>

  <div class="mt-10 flex flex-wrap justify-center gap-3">
    {#if $session}
      <a href="/characters" class="btn btn-primary px-6 py-2.5">Enter the world →</a>
    {:else}
      <a href="/login" class="btn btn-primary px-6 py-2.5">Log in</a>
      <a href="/register" class="btn px-6 py-2.5">Create account</a>
    {/if}
  </div>

  <div class="mt-12 grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
    {#each [['📜', 'Quest'], ['🗝️', 'Dungeons'], ['🐉', 'Raids'], ['⚔️', 'Arena']] as [icon, label] (label)}
      <div class="panel panel-pad flex flex-col items-center gap-1 !py-3">
        <span class="text-2xl" aria-hidden="true">{icon}</span>
        <span class="text-sm text-[var(--text-dim)]">{label}</span>
      </div>
    {/each}
  </div>
</main>
