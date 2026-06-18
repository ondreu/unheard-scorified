<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { ApiError, getConsumables, useConsumable, type ConsumablesView } from '$lib/api';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Consumables',
    blurb:
      'Drink a potion or elixir to gain a temporary buff. Active buffs add their stats to your character in combat (dungeons, arena) until they expire.',
    yourConsumables: 'Your Consumables',
    activeBuffs: 'Active Buffs',
    none: "You have no consumables. Craft them with Alchemy or buy them from a vendor.",
    noBuffs: 'No active buffs.',
    use: 'Use',
    using: '…',
    expires: 'expires',
  };

  let view = $state<ConsumablesView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let pendingId = $state<string | null>(null);

  const characterId = $derived($page.params.id ?? '');

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      view = await getConsumables(characterId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await goto('/login');
        return;
      }
      error = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  async function use(itemId: string): Promise<void> {
    pendingId = itemId;
    error = null;
    try {
      view = await useConsumable(characterId, itemId);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      pendingId = null;
    }
  }

  function statLine(stats: Record<string, number>): string {
    return Object.entries(stats)
      .map(([k, v]) => `+${v} ${k.replace('_', ' ')}`)
      .join(', ');
  }

  function remaining(expiresAt: string): string {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return 'expired';
    const min = Math.round(ms / 60000);
    return min >= 1 ? `${min}m left` : '<1m left';
  }
</script>

<svelte:head><title>{ui.title}</title></svelte:head>

<div class="space-y-6">
  <div>
    <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{ui.title}</h1>
    <p class="mt-1 text-sm text-[var(--text-dim)]">{ui.blurb}</p>
  </div>

  {#if error}
    <p class="text-sm text-[var(--danger)]">{error}</p>
  {/if}

  {#if loading}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {:else if view}
    <!-- Active buffs -->
    <section class="panel panel-pad">
      <h2 class="panel-title">{ui.activeBuffs}</h2>
      {#if view.activeBuffs.length === 0}
        <p class="mt-2 text-[var(--text-dim)]">{ui.noBuffs}</p>
      {:else}
        <ul class="mt-3 space-y-2">
          {#each view.activeBuffs as b (b.consumableId)}
            <li class="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
              <span class="text-sm">
                <strong style="color:var(--success)">{b.name}</strong>
                <span class="ml-2 text-[var(--text-dim)]">{statLine(b.stats)}</span>
              </span>
              <span class="shrink-0 text-xs text-[var(--text-faint)]">{remaining(b.expiresAt)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <!-- Inventory consumables -->
    <section class="panel panel-pad">
      <h2 class="panel-title">{ui.yourConsumables}</h2>
      {#if view.consumables.length === 0}
        <p class="mt-2 text-[var(--text-dim)]">{ui.none}</p>
      {:else}
        <ul class="mt-3 space-y-2">
          {#each view.consumables as c (c.itemId)}
            <li class="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-[var(--text)]">
                  {c.name} <span class="text-[var(--text-faint)]">×{c.quantity}</span>
                </p>
                <p class="text-xs text-[var(--text-dim)]">{c.effect}</p>
              </div>
              <button
                class="btn btn-primary btn-sm shrink-0"
                disabled={pendingId !== null}
                onclick={() => use(c.itemId)}
              >
                {pendingId === c.itemId ? ui.using : ui.use}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>
