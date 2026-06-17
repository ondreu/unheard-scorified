<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    getBank,
    depositToBank,
    withdrawFromBank,
    listInventory,
    type BankView,
    type InventoryItemView,
  } from '$lib/api';
  import { itemDisplayName } from '@game/shared';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Bank',
    blurb:
      'Store items outside your bags. Deposited items free up bag slots and stay safe until you withdraw them.',
    bank: 'In the Bank',
    bags: 'In Your Bags',
    emptyBank: 'Your bank is empty. Deposit items from your bags.',
    emptyBags: 'Your bags are empty.',
    deposit: 'Deposit',
    withdraw: 'Withdraw',
    slots: 'slots',
  };

  let bank = $state<BankView | null>(null);
  let inventory = $state<InventoryItemView[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let amount = $state<Record<string, number>>({});

  const characterId = $derived($page.params.id ?? '');

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    error = null;
    try {
      [bank, inventory] = await Promise.all([getBank(characterId), listInventory(characterId)]);
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

  function qtyFor(itemId: string, max: number): number {
    const v = amount[itemId];
    if (!v || v < 1) return Math.min(1, max);
    return Math.min(Math.floor(v), max);
  }

  async function deposit(itemId: string, max: number): Promise<void> {
    busy = true;
    error = null;
    try {
      bank = await depositToBank(characterId, itemId, qtyFor(itemId, max));
      inventory = await listInventory(characterId);
      delete amount[itemId];
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  async function withdraw(itemId: string, max: number): Promise<void> {
    busy = true;
    error = null;
    try {
      bank = await withdrawFromBank(characterId, itemId, qtyFor(itemId, max));
      inventory = await listInventory(characterId);
      delete amount[itemId];
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
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
  {:else if bank}
    <!-- Bank contents -->
    <section class="panel panel-pad">
      <div class="flex items-baseline justify-between">
        <h2 class="panel-title">{ui.bank}</h2>
        <span class="text-xs text-[var(--text-faint)]">{bank.usedSlots}/{bank.capacity} {ui.slots}</span>
      </div>
      {#if bank.items.length === 0}
        <p class="mt-2 text-[var(--text-dim)]">{ui.emptyBank}</p>
      {:else}
        <ul class="mt-3 space-y-2">
          {#each bank.items as b (b.itemId)}
            <li class="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
              <p class="min-w-0 truncate text-sm font-medium text-[var(--text)]">
                {b.name} <span class="text-[var(--text-faint)]">×{b.quantity}</span>
              </p>
              <div class="flex shrink-0 items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max={b.quantity}
                  value={qtyFor(b.itemId, b.quantity)}
                  oninput={(e) => (amount[b.itemId] = Number((e.target as HTMLInputElement).value))}
                  class="w-16 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
                />
                <button class="btn btn-sm" disabled={busy} onclick={() => withdraw(b.itemId, b.quantity)}>
                  {ui.withdraw}
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <!-- Bag contents (depositable) -->
    <section class="panel panel-pad">
      <h2 class="panel-title">{ui.bags}</h2>
      {#if inventory.length === 0}
        <p class="mt-2 text-[var(--text-dim)]">{ui.emptyBags}</p>
      {:else}
        <ul class="mt-3 space-y-2">
          {#each inventory as inv (inv.itemId)}
            <li class="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
              <p class="min-w-0 truncate text-sm font-medium text-[var(--text)]">
                {itemDisplayName(inv.itemId)} <span class="text-[var(--text-faint)]">×{inv.quantity}</span>
              </p>
              <div class="flex shrink-0 items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max={inv.quantity}
                  value={qtyFor(inv.itemId, inv.quantity)}
                  oninput={(e) => (amount[inv.itemId] = Number((e.target as HTMLInputElement).value))}
                  class="w-16 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
                />
                <button class="btn btn-primary btn-sm" disabled={busy} onclick={() => deposit(inv.itemId, inv.quantity)}>
                  {ui.deposit}
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>
