<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    bidAuction,
    browseAuctions,
    buyoutAuction,
    cancelAuction,
    createAuction,
    listInventory,
    myAuctions,
    type AuctionView,
    type InventoryItemView,
  } from '$lib/api';
  import { isAuctionable, itemDisplayName } from '@game/shared';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Auction House',
    back: '← Back to character',
    browse: 'Browse',
    mine: 'My auctions',
    sell: 'Sell an item',
    empty: 'No auctions found.',
    none: 'You have nothing to auction.',
    item: 'Item',
    qty: 'Qty',
    seller: 'Seller',
    bid: 'Bid',
    buyout: 'Buyout',
    current: 'Current',
    start: 'Start',
    timeLeft: 'Time left',
    place: 'Place bid',
    buyNow: 'Buy now',
    cancel: 'Cancel',
    list: 'List for auction',
    startBid: 'Start bid',
    duration: 'Duration',
    none2: '—',
    deposit: 'Deposit',
  };

  type Tab = 'browse' | 'mine' | 'sell';
  let tab = $state<Tab>('browse');

  let auctions = $state<AuctionView[]>([]);
  let mine = $state<AuctionView[]>([]);
  let inventory = $state<InventoryItemView[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);

  // Sell form
  let sellItemId = $state('');
  let sellQty = $state(1);
  let sellStart = $state(10);
  let sellBuyout = $state<number | null>(null);
  let sellDuration = $state<'short' | 'medium' | 'long'>('short');

  // Per-auction bid amounts
  let bidAmount = $state<Record<string, number>>({});

  const characterId = $derived($page.params.id ?? '');

  // Soulbound (BoP) items can't be auctioned (M8.6) → hide them from the sell list.
  const sellable = $derived(inventory.filter((inv) => isAuctionable(inv.itemId)));

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    error = null;
    try {
      [auctions, mine, inventory] = await Promise.all([
        browseAuctions(characterId),
        myAuctions(characterId),
        listInventory(characterId),
      ]);
      if (!sellItemId && sellable.length > 0) sellItemId = sellable[0]!.itemId;
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

  function itemName(id: string): string {
    return itemDisplayName(id);
  }

  function fmtTime(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  async function place(a: AuctionView): Promise<void> {
    busy = true;
    error = null;
    try {
      await bidAuction(characterId, a.id, bidAmount[a.id] ?? a.minBid);
      await load();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  async function buy(a: AuctionView): Promise<void> {
    busy = true;
    error = null;
    try {
      await buyoutAuction(characterId, a.id);
      await load();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  async function cancelListing(a: AuctionView): Promise<void> {
    busy = true;
    error = null;
    try {
      await cancelAuction(characterId, a.id);
      await load();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  async function listItem(): Promise<void> {
    busy = true;
    error = null;
    try {
      await createAuction(characterId, {
        itemId: sellItemId,
        quantity: sellQty,
        startBid: sellStart,
        buyout: sellBuyout && sellBuyout > 0 ? sellBuyout : null,
        duration: sellDuration,
      });
      tab = 'mine';
      await load();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<main class="mx-auto max-w-2xl px-6 py-12">
  <a href={`/characters/${characterId}`} class="text-sm text-amber-300 underline">{ui.back}</a>
  <h1 class="mt-4 text-3xl font-bold text-amber-200">{ui.title}</h1>

  <div class="mt-4 flex gap-2">
    {#each [['browse', ui.browse], ['mine', ui.mine], ['sell', ui.sell]] as [t, label] (t)}
      <button
        onclick={() => (tab = t as Tab)}
        class="rounded px-3 py-1.5 text-sm font-medium {tab === t
          ? 'bg-amber-700 text-amber-50'
          : 'bg-black/30 text-amber-200 hover:bg-black/50'}"
      >
        {label}
      </button>
    {/each}
  </div>

  {#if error}
    <p class="mt-4 text-red-400">{error}</p>
  {/if}

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if tab === 'sell'}
    {#if sellable.length === 0}
      <p class="mt-6 text-amber-100/60">{ui.none}</p>
    {:else}
      <section class="mt-6 space-y-3 rounded-lg border border-amber-900/40 bg-black/20 p-5">
        <label class="block text-sm text-amber-100/70">
          {ui.item}
          <select bind:value={sellItemId} class="mt-1 w-full rounded border border-amber-900/40 bg-black/40 px-2 py-1.5 text-amber-100">
            {#each sellable as inv (inv.itemId)}
              <option value={inv.itemId}>{itemName(inv.itemId)} (x{inv.quantity})</option>
            {/each}
          </select>
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-sm text-amber-100/70">
            {ui.qty}
            <input type="number" min="1" bind:value={sellQty} class="mt-1 w-full rounded border border-amber-900/40 bg-black/40 px-2 py-1.5 text-amber-100" />
          </label>
          <label class="block text-sm text-amber-100/70">
            {ui.duration}
            <select bind:value={sellDuration} class="mt-1 w-full rounded border border-amber-900/40 bg-black/40 px-2 py-1.5 text-amber-100">
              <option value="short">12h</option>
              <option value="medium">24h</option>
              <option value="long">48h</option>
            </select>
          </label>
          <label class="block text-sm text-amber-100/70">
            {ui.startBid}
            <input type="number" min="1" bind:value={sellStart} class="mt-1 w-full rounded border border-amber-900/40 bg-black/40 px-2 py-1.5 text-amber-100" />
          </label>
          <label class="block text-sm text-amber-100/70">
            {ui.buyout}
            <input type="number" min="0" bind:value={sellBuyout} placeholder="optional" class="mt-1 w-full rounded border border-amber-900/40 bg-black/40 px-2 py-1.5 text-amber-100" />
          </label>
        </div>
        <button
          onclick={listItem}
          disabled={busy}
          class="rounded bg-red-700 px-4 py-2 text-sm font-medium text-amber-50 hover:bg-red-600 disabled:opacity-50"
        >
          {ui.list}
        </button>
      </section>
    {/if}
  {:else}
    {@const rows = tab === 'browse' ? auctions : mine}
    {#if rows.length === 0}
      <p class="mt-6 text-amber-100/60">{ui.empty}</p>
    {:else}
      <ul class="mt-6 space-y-3">
        {#each rows as a (a.id)}
          <li class="rounded-lg border border-amber-900/40 bg-black/20 p-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h2 class="font-semibold text-amber-200">{a.itemName} <span class="text-amber-100/50">x{a.quantity}</span></h2>
                <p class="text-xs text-amber-100/40">
                  {ui.seller}: {a.sellerName}
                  {#if a.status === 'active'}· {ui.timeLeft}: {fmtTime(a.timeLeftSec)}{:else}· {a.status}{/if}
                </p>
                <p class="mt-1 text-sm text-amber-100/70">
                  {a.currentBid !== null ? `${ui.current}: ${a.currentBid}` : `${ui.start}: ${a.startBid}`} g
                  {#if a.buyout !== null}· {ui.buyout}: {a.buyout} g{/if}
                </p>
              </div>
            </div>

            {#if a.status === 'active'}
              {#if a.isMine}
                {#if a.currentBid === null}
                  <button
                    onclick={() => cancelListing(a)}
                    disabled={busy}
                    class="mt-3 rounded border border-stone-600 px-3 py-1.5 text-sm text-stone-300 hover:bg-stone-800 disabled:opacity-50"
                  >
                    {ui.cancel}
                  </button>
                {:else}
                  <p class="mt-2 text-xs text-sky-300">Bid in progress — cannot cancel.</p>
                {/if}
              {:else}
                <div class="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={a.minBid}
                    value={a.minBid}
                    oninput={(e) => (bidAmount[a.id] = Number((e.target as HTMLInputElement).value))}
                    class="w-24 rounded border border-amber-900/40 bg-black/40 px-2 py-1 text-sm text-amber-100"
                  />
                  <button
                    onclick={() => place(a)}
                    disabled={busy}
                    class="rounded bg-amber-700 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-amber-600 disabled:opacity-50"
                  >
                    {ui.place} (min {a.minBid})
                  </button>
                  {#if a.buyout !== null}
                    <button
                      onclick={() => buy(a)}
                      disabled={busy}
                      class="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-red-600 disabled:opacity-50"
                    >
                      {ui.buyNow} ({a.buyout} g)
                    </button>
                  {/if}
                </div>
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</main>
