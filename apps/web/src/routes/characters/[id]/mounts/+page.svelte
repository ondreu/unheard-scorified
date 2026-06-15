<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    buyMount,
    listMounts,
    selectMount,
    type MountsView,
    type MountView,
  } from '$lib/api';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Mounts',
    back: '← Back to character',
    blurb:
      'Mounts speed up your travel — quests and gathering finish faster. The visual is cosmetic; the speed comes from the best mount you own.',
    ridingSpeed: 'Riding speed',
    gold: 'Gold',
    owned: 'Owned',
    active: 'Active',
    setActive: 'Set active',
    buy: 'Buy',
    buying: '…',
    reqLevel: 'Requires level',
    noBonus: 'On foot (no mount)',
  };

  let view = $state<MountsView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let pendingId = $state<string | null>(null);

  const characterId = $derived($page.params.id ?? '');

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      view = await listMounts(characterId);
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

  async function buy(mountId: string): Promise<void> {
    pendingId = mountId;
    error = null;
    try {
      view = await buyMount(characterId, mountId);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      pendingId = null;
    }
  }

  async function activate(mountId: string): Promise<void> {
    pendingId = mountId;
    error = null;
    try {
      view = await selectMount(characterId, mountId);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      pendingId = null;
    }
  }

  function pct(bonus: number): string {
    return `${Math.round(bonus * 100)}%`;
  }

  const tierLabel: Record<MountView['tier'], string> = {
    basic: 'Basic',
    epic: 'Epic',
  };
</script>

<svelte:head><title>{ui.title}</title></svelte:head>

<main class="mx-auto max-w-3xl p-6 text-amber-100">
  <a href={`/characters/${characterId}`} class="text-sm text-amber-300 underline">{ui.back}</a>
  <h1 class="mt-2 text-2xl font-bold text-amber-200">{ui.title}</h1>
  <p class="mt-1 text-sm text-amber-300/80">{ui.blurb}</p>

  {#if error}
    <p class="mt-4 rounded bg-red-900/40 px-4 py-2 text-sm text-red-200">{error}</p>
  {/if}

  {#if loading}
    <p class="mt-6 text-amber-300/70">Loading…</p>
  {:else if view}
    <div class="mt-4 flex flex-wrap gap-6 rounded border border-amber-800/40 bg-amber-950/30 px-4 py-3 text-sm">
      <span>💰 {ui.gold}: <strong class="text-amber-200">{view.gold}</strong></span>
      <span>
        🐎 {ui.ridingSpeed}:
        <strong class="text-emerald-300">
          {view.speedBonus > 0 ? `+${pct(view.speedBonus)}` : ui.noBonus}
        </strong>
      </span>
    </div>

    <ul class="mt-4 space-y-3">
      {#each view.mounts as m (m.id)}
        <li
          class="rounded border px-4 py-3"
          class:border-emerald-600={m.active}
          class:border-amber-800={!m.active}
          class:bg-emerald-950={m.active}
          class:bg-amber-950={!m.active}
        >
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="font-semibold text-amber-100">
                {m.name}
                <span class="ml-2 rounded bg-amber-800/50 px-2 py-0.5 text-xs uppercase tracking-wide text-amber-300">
                  {tierLabel[m.tier]}
                </span>
                {#if m.active}
                  <span class="ml-1 rounded bg-emerald-700/60 px-2 py-0.5 text-xs text-emerald-100">
                    {ui.active}
                  </span>
                {/if}
              </p>
              <p class="mt-0.5 text-sm text-amber-300/80">{m.description}</p>
              <p class="mt-1 text-xs text-emerald-300/90">
                +{pct(m.speedBonus)} travel speed · {ui.reqLevel} {m.requiredLevel} · 💰 {m.cost}
              </p>
            </div>
            <div class="shrink-0">
              {#if m.owned}
                {#if m.active}
                  <span class="text-sm text-emerald-300">✓ {ui.owned}</span>
                {:else}
                  <button
                    class="rounded bg-emerald-800/60 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-700/70 disabled:opacity-50"
                    disabled={pendingId === m.id}
                    onclick={() => activate(m.id)}
                  >
                    {pendingId === m.id ? ui.buying : ui.setActive}
                  </button>
                {/if}
              {:else}
                <button
                  class="rounded bg-amber-700/60 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-600/70 disabled:opacity-40"
                  disabled={!m.affordable || pendingId === m.id}
                  title={!m.meetsLevel
                    ? `${ui.reqLevel} ${m.requiredLevel}`
                    : !m.affordable
                      ? 'Not enough gold'
                      : ''}
                  onclick={() => buy(m.id)}
                >
                  {pendingId === m.id ? ui.buying : `${ui.buy} · ${m.cost}`}
                </button>
              {/if}
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</main>
