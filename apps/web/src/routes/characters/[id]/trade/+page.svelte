<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import {
    ApiError,
    cancelTrade,
    confirmTrade,
    getTrade,
    listInventory,
    setTradeOffer,
    startTrade,
    unconfirmTrade,
    type InventoryItemView,
    type TradeState,
  } from '$lib/api';
  import { canTradeItem, itemDisplayName } from '@game/shared';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    back: '← Back to character',
    title: 'Trade',
    startPlaceholder: 'Character name…',
    start: 'Open trade',
    yourOffer: 'Your offer',
    theirOffer: 'Their offer',
    gold: 'Gold',
    update: 'Update offer',
    confirm: 'Confirm',
    unconfirm: 'Unconfirm',
    cancel: 'Cancel trade',
    confirmed: '✓ confirmed',
    waiting: 'waiting…',
    empty: 'nothing',
    completed: 'Trade completed!',
    closed: 'Trade closed.',
    noItems: 'No tradeable items.',
  };

  let ts = $state<TradeState | null>(null);
  let inventory = $state<InventoryItemView[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let busy = $state(false);
  let partnerName = $state('');

  // Local draft of my offer: itemId -> quantity, plus gold.
  let draft = $state<Record<string, number>>({});
  let goldDraft = $state(0);

  const characterId = $derived($page.params.id ?? '');
  const tradeable = $derived(inventory.filter((i) => canTradeItem(i.itemId)));

  let poll: ReturnType<typeof setInterval> | undefined;

  onMount(async () => {
    await load();
    const prefill = $page.url.searchParams.get('with');
    if (prefill && !ts?.trade) partnerName = prefill;
    poll = setInterval(() => {
      if (ts?.trade && !busy) void refresh();
    }, 2500);
  });

  onDestroy(() => clearInterval(poll));

  async function load(): Promise<void> {
    loading = true;
    try {
      [ts, inventory] = await Promise.all([getTrade(characterId), listInventory(characterId)]);
      syncDraft();
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

  async function refresh(): Promise<void> {
    try {
      const next = await getTrade(characterId);
      // Trade zmizel během pollingu → druhá strana zrušila/dokončila.
      if (ts?.trade && !next.trade && !notice) notice = ui.closed;
      ts = next;
    } catch {
      /* best-effort poll */
    }
  }

  /** Předvyplní draft podle aktuální serverové nabídky. */
  function syncDraft(): void {
    const mine = ts?.trade?.me;
    const next: Record<string, number> = {};
    for (const it of mine?.items ?? []) next[it.itemId] = it.quantity;
    draft = next;
    goldDraft = mine?.gold ?? 0;
  }

  async function act(fn: () => Promise<TradeState>, onDone?: () => void): Promise<void> {
    if (busy) return;
    busy = true;
    error = null;
    try {
      ts = await fn();
      onDone?.();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  function start(): void {
    const name = partnerName.trim();
    if (!name) return;
    notice = null;
    void act(() => startTrade(characterId, name), syncDraft);
  }

  function updateOffer(): void {
    const items = Object.entries(draft)
      .filter(([, q]) => q > 0)
      .map(([itemId, quantity]) => ({ itemId, quantity }));
    void act(() => setTradeOffer(characterId, items, goldDraft || 0));
  }

  function confirm(): void {
    void act(
      () => confirmTrade(characterId),
      () => {
        if (!ts?.trade) notice = ui.completed;
      },
    );
  }

  function cancel(): void {
    void act(
      () => cancelTrade(characterId),
      () => (notice = ui.closed),
    );
  }

  function qtyFor(itemId: string): number {
    return draft[itemId] ?? 0;
  }
  function setQty(itemId: string, max: number, value: string): void {
    const n = Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
    draft = { ...draft, [itemId]: n };
  }
</script>

<main class="mx-auto max-w-lg px-6 py-12">
  <a href={`/characters/${characterId}`} class="text-sm text-amber-300 underline">{ui.back}</a>
  <h1 class="mt-4 text-3xl font-bold text-amber-200">{ui.title}</h1>

  {#if notice}
    <p class="mt-3 text-sm text-emerald-300">{notice}</p>
  {/if}
  {#if error}
    <p class="mt-3 text-sm text-red-400">{error}</p>
  {/if}

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if ts?.trade}
    {@const t = ts.trade}
    <!-- Their offer -->
    <section class="mt-6 rounded-lg border border-amber-900/40 bg-black/20 p-4">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-sky-300">{t.them.name}</h2>
        <span class="text-xs {t.them.confirmed ? 'text-emerald-400' : 'text-amber-100/40'}">
          {t.them.confirmed ? ui.confirmed : ui.waiting}
        </span>
      </div>
      <ul class="mt-2 text-sm text-amber-100/90">
        {#each t.them.items as it (it.itemId)}
          <li>{it.name} ×{it.quantity}</li>
        {/each}
        {#if t.them.gold > 0}<li class="text-amber-300">{t.them.gold} {ui.gold}</li>{/if}
        {#if t.them.items.length === 0 && t.them.gold === 0}
          <li class="text-amber-100/30">{ui.empty}</li>
        {/if}
      </ul>
    </section>

    <!-- My offer editor -->
    <section class="mt-4 rounded-lg border border-amber-900/40 bg-black/20 p-4">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-amber-200">{ui.yourOffer}</h2>
        <span class="text-xs {t.me.confirmed ? 'text-emerald-400' : 'text-amber-100/40'}">
          {t.me.confirmed ? ui.confirmed : ui.waiting}
        </span>
      </div>

      {#if tradeable.length === 0}
        <p class="mt-2 text-sm text-amber-100/50">{ui.noItems}</p>
      {:else}
        <ul class="mt-2 space-y-1">
          {#each tradeable as it (it.itemId)}
            <li class="flex items-center justify-between text-sm">
              <span class="text-amber-100/90">{itemDisplayName(it.itemId)} <span class="text-amber-100/40">({it.quantity})</span></span>
              <input
                type="number"
                min="0"
                max={it.quantity}
                value={qtyFor(it.itemId)}
                oninput={(e) => setQty(it.itemId, it.quantity, e.currentTarget.value)}
                class="w-16 rounded border border-amber-900/50 bg-black/30 px-2 py-1 text-right text-amber-100"
              />
            </li>
          {/each}
        </ul>
      {/if}

      <label class="mt-3 flex items-center justify-between text-sm text-amber-100/80">
        {ui.gold}
        <input
          type="number"
          min="0"
          bind:value={goldDraft}
          class="w-24 rounded border border-amber-900/50 bg-black/30 px-2 py-1 text-right text-amber-300"
        />
      </label>

      <button
        onclick={updateOffer}
        disabled={busy}
        class="mt-3 rounded bg-amber-700/60 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-600/60 disabled:opacity-40"
      >
        {ui.update}
      </button>
    </section>

    <div class="mt-4 flex gap-3">
      {#if t.me.confirmed}
        <button
          onclick={() => act(() => unconfirmTrade(characterId))}
          disabled={busy}
          class="rounded border border-amber-900/50 px-4 py-2 text-sm text-amber-100/70 hover:border-amber-600 disabled:opacity-40"
        >
          {ui.unconfirm}
        </button>
      {:else}
        <button
          onclick={confirm}
          disabled={busy}
          class="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-500 disabled:opacity-40"
        >
          {ui.confirm}
        </button>
      {/if}
      <button
        onclick={cancel}
        disabled={busy}
        class="rounded border border-amber-900/50 px-4 py-2 text-sm text-amber-100/70 hover:border-red-700/60 hover:text-red-400 disabled:opacity-40"
      >
        {ui.cancel}
      </button>
    </div>
  {:else}
    <!-- Start a trade -->
    <form
      class="mt-6 flex gap-2"
      onsubmit={(e) => {
        e.preventDefault();
        start();
      }}
    >
      <input
        bind:value={partnerName}
        maxlength="16"
        placeholder={ui.startPlaceholder}
        class="flex-1 rounded border border-amber-900/50 bg-black/30 px-3 py-2 text-sm text-amber-100 placeholder:text-amber-100/30"
      />
      <button
        type="submit"
        disabled={busy || partnerName.trim().length === 0}
        class="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-black hover:bg-amber-500 disabled:opacity-40"
      >
        {ui.start}
      </button>
    </form>
  {/if}
</main>
