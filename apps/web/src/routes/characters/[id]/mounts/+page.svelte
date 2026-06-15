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
    <div class="panel panel-pad flex flex-wrap gap-6 text-sm">
      <span>💰 {ui.gold}: <strong class="text-[var(--gold-bright)]">{view.gold}</strong></span>
      <span>
        🐎 {ui.ridingSpeed}:
        <strong style="color:var(--success)">
          {view.speedBonus > 0 ? `+${pct(view.speedBonus)}` : ui.noBonus}
        </strong>
      </span>
    </div>

    <ul class="space-y-3">
      {#each view.mounts as m (m.id)}
        <li
          class="panel panel-pad"
          style={m.active ? 'border-color:var(--success)' : ''}
        >
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="font-semibold text-[var(--text)]">
                {m.name}
                <span class="chip ml-2 uppercase tracking-wide">
                  {tierLabel[m.tier]}
                </span>
                {#if m.active}
                  <span class="chip ml-1" style="color:var(--success);border-color:color-mix(in srgb, var(--success) 35%, transparent)">
                    {ui.active}
                  </span>
                {/if}
              </p>
              <p class="mt-0.5 text-sm text-[var(--text-dim)]">{m.description}</p>
              <p class="mt-1 text-xs" style="color:var(--success)">
                +{pct(m.speedBonus)} travel speed · {ui.reqLevel} {m.requiredLevel} · 💰 {m.cost}
              </p>
            </div>
            <div class="shrink-0">
              {#if m.owned}
                {#if m.active}
                  <span class="text-sm" style="color:var(--success)">✓ {ui.owned}</span>
                {:else}
                  <button
                    class="btn btn-sm"
                    disabled={pendingId === m.id}
                    onclick={() => activate(m.id)}
                  >
                    {pendingId === m.id ? ui.buying : ui.setActive}
                  </button>
                {/if}
              {:else}
                <button
                  class="btn btn-primary btn-sm"
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
</div>
