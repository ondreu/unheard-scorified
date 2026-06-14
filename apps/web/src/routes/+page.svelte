<script lang="ts">
  import { MAX_LEVEL } from '@game/shared';
  import { onMount } from 'svelte';

  type Health = {
    status: string;
    maxLevel: number;
    deps: { postgres: { status: string }; redis: { status: string } };
  };

  let health = $state<Health | null>(null);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      const res = await fetch('/api/health');
      health = (await res.json()) as Health;
    } catch (e) {
      error = (e as Error).message;
    }
  });
</script>

<main class="mx-auto max-w-2xl px-6 py-16">
  <h1 class="text-4xl font-bold tracking-tight text-amber-200">Idle RPG</h1>
  <p class="mt-2 text-amber-100/70">WoW-inspired idle RPG — skeleton (M0).</p>

  <section class="mt-10 rounded-lg border border-amber-900/40 bg-black/20 p-5">
    <h2 class="text-lg font-semibold text-amber-200">Stav serveru</h2>
    {#if error}
      <p class="mt-2 text-red-400">API nedostupné: {error}</p>
    {:else if health}
      <ul class="mt-2 space-y-1 text-sm">
        <li>Status: <strong>{health.status}</strong></li>
        <li>Postgres: {health.deps.postgres.status}</li>
        <li>Redis: {health.deps.redis.status}</li>
        <li>Max level (ze sdíleného balíčku): {health.maxLevel}</li>
      </ul>
    {:else}
      <p class="mt-2 text-amber-100/50">Načítám…</p>
    {/if}
    <p class="mt-4 text-xs text-amber-100/40">
      Klientská konstanta MAX_LEVEL = {MAX_LEVEL} (sdílená s API přes @game/shared)
    </p>
  </section>
</main>
