<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { ApiError, getVendor, vendorBuy, vendorSell, type VendorView } from '$lib/api';
  import PixelItemIcon from '$lib/components/PixelItemIcon.svelte';
  import { itemIconMetaById } from '$lib/pixelart/items';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Vendor',
    blurb:
      'A travelling merchant. Buy basic supplies and gear, or sell off loot you no longer need. Soulbound items can be sold here, but not on the Auction House.',
    gold: 'Gold',
    forSale: 'For Sale',
    yourGoods: 'Your Goods',
    buy: 'Buy',
    sell: 'Sell',
    nothing: 'Nothing to sell here.',
    each: 'each',
    working: '…',
  };

  let view = $state<VendorView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let pendingId = $state<string | null>(null);

  const characterId = $derived($page.params.id ?? '');

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      view = await getVendor(characterId);
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

  async function buy(itemId: string): Promise<void> {
    pendingId = `buy:${itemId}`;
    error = null;
    try {
      view = await vendorBuy(characterId, itemId, 1);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      pendingId = null;
    }
  }

  async function sell(itemId: string): Promise<void> {
    pendingId = `sell:${itemId}`;
    error = null;
    try {
      view = await vendorSell(characterId, itemId, 1);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      pendingId = null;
    }
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
    <div class="panel panel-pad text-sm">
      💰 {ui.gold}: <strong class="text-[var(--gold-bright)]">{view.gold}</strong>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <!-- Buy -->
      <section class="panel panel-pad">
        <h2 class="panel-title">{ui.forSale}</h2>
        <ul class="mt-3 space-y-2">
          {#each view.stock as s (s.itemId)}
            {@const meta = itemIconMetaById(s.itemId)}
            <li
              class="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
            >
              <span class="flex min-w-0 items-center gap-2">
                {#if meta}
                  <PixelItemIcon
                    slot={meta.slot}
                    rarity={meta.rarity}
                    armorClass={meta.armorClass}
                    size={28}
                  />
                {/if}
                <span class="min-w-0 truncate text-sm text-[var(--text)]">{s.name}</span>
              </span>
              <button
                class="btn btn-primary btn-sm shrink-0"
                disabled={pendingId !== null || view.gold < s.price}
                title={view.gold < s.price ? 'Not enough gold' : ''}
                onclick={() => buy(s.itemId)}
              >
                {pendingId === `buy:${s.itemId}` ? ui.working : `${ui.buy} · ${s.price}💰`}
              </button>
            </li>
          {/each}
        </ul>
      </section>

      <!-- Sell -->
      <section class="panel panel-pad">
        <h2 class="panel-title">{ui.yourGoods}</h2>
        {#if view.sellable.length === 0}
          <p class="mt-2 text-[var(--text-dim)]">{ui.nothing}</p>
        {:else}
          <ul class="mt-3 space-y-2">
            {#each view.sellable as s (s.itemId)}
              {@const meta = itemIconMetaById(s.itemId)}
              <li
                class="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
              >
                <span class="flex min-w-0 items-center gap-2">
                  {#if meta}
                    <PixelItemIcon
                      slot={meta.slot}
                      rarity={meta.rarity}
                      armorClass={meta.armorClass}
                      size={28}
                    />
                  {/if}
                  <span class="min-w-0 truncate text-sm text-[var(--text)]">
                    {s.name} <span class="text-[var(--text-faint)]">×{s.quantity}</span>
                  </span>
                </span>
                <button
                  class="btn btn-sm shrink-0"
                  disabled={pendingId !== null}
                  onclick={() => sell(s.itemId)}
                >
                  {pendingId === `sell:${s.itemId}`
                    ? ui.working
                    : `${ui.sell} · ${s.unitPrice}💰 ${ui.each}`}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  {/if}
</div>
