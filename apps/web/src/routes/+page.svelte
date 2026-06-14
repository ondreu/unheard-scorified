<script lang="ts">
  import { tokens } from '$lib/auth';
</script>

<main class="mx-auto max-w-2xl px-6 py-16">
  <h1 class="text-4xl font-bold tracking-tight text-amber-200">AFK to 60</h1>
  <p class="mt-2 text-amber-100/70">WoW-inspired idle RPG. Reach level 60 — even while AFK.</p>

  <div class="mt-10 flex gap-3">
    {#if $tokens}
      <a href="/characters" class="rounded bg-amber-700 px-4 py-2 font-semibold hover:bg-amber-600">
        My characters
      </a>
    {:else}
      <a href="/login" class="rounded bg-amber-700 px-4 py-2 font-semibold hover:bg-amber-600">
        Log in
      </a>
      <a
        href="/register"
        class="rounded border border-amber-700 px-4 py-2 font-semibold hover:bg-amber-900/40"
      >
        Register
      </a>
    {/if}
  </div>
</main>
