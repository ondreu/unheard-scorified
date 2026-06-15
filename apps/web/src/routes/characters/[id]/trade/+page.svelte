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
  import { openProfile } from '$lib/ui-stores';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
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

<div class="space-y-6">
  <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{ui.title}</h1>

  {#if notice}
    <p class="text-sm text-[var(--success)]">{notice}</p>
  {/if}
  {#if error}
    <p class="text-sm text-[var(--danger)]">{error}</p>
  {/if}

  {#if loading}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {:else if ts?.trade}
    {@const t = ts.trade}
    <!-- Their offer -->
    <section class="panel panel-pad">
      <div class="flex items-center justify-between">
        <h2 class="panel-title">
          <button class="hover:underline" onclick={() => openProfile(t.them.characterId, t.them.name)}>{t.them.name}</button>
        </h2>
        <span class="text-xs" style={t.them.confirmed ? 'color:var(--success)' : 'color:var(--text-faint)'}>
          {t.them.confirmed ? ui.confirmed : ui.waiting}
        </span>
      </div>
      <ul class="mt-2 text-sm text-[var(--text)]">
        {#each t.them.items as it (it.itemId)}
          <li>{it.name} ×{it.quantity}</li>
        {/each}
        {#if t.them.gold > 0}<li class="text-[var(--gold-bright)]">{t.them.gold} {ui.gold}</li>{/if}
        {#if t.them.items.length === 0 && t.them.gold === 0}
          <li class="text-[var(--text-faint)]">{ui.empty}</li>
        {/if}
      </ul>
    </section>

    <!-- My offer editor -->
    <section class="panel panel-pad">
      <div class="flex items-center justify-between">
        <h2 class="panel-title">{ui.yourOffer}</h2>
        <span class="text-xs" style={t.me.confirmed ? 'color:var(--success)' : 'color:var(--text-faint)'}>
          {t.me.confirmed ? ui.confirmed : ui.waiting}
        </span>
      </div>

      {#if tradeable.length === 0}
        <p class="mt-2 text-sm text-[var(--text-dim)]">{ui.noItems}</p>
      {:else}
        <ul class="mt-2 space-y-1">
          {#each tradeable as it (it.itemId)}
            <li class="flex items-center justify-between text-sm">
              <span class="text-[var(--text)]">{itemDisplayName(it.itemId)} <span class="text-[var(--text-faint)]">({it.quantity})</span></span>
              <input
                type="number"
                min="0"
                max={it.quantity}
                value={qtyFor(it.itemId)}
                oninput={(e) => setQty(it.itemId, it.quantity, e.currentTarget.value)}
                class="input w-16 text-right"
              />
            </li>
          {/each}
        </ul>
      {/if}

      <label class="mt-3 flex items-center justify-between text-sm text-[var(--text-dim)]">
        {ui.gold}
        <input
          type="number"
          min="0"
          bind:value={goldDraft}
          class="input w-24 text-right"
        />
      </label>

      <button
        onclick={updateOffer}
        disabled={busy}
        class="btn mt-3"
      >
        {ui.update}
      </button>
    </section>

    <div class="flex gap-3">
      {#if t.me.confirmed}
        <button
          onclick={() => act(() => unconfirmTrade(characterId))}
          disabled={busy}
          class="btn"
        >
          {ui.unconfirm}
        </button>
      {:else}
        <button
          onclick={confirm}
          disabled={busy}
          class="btn btn-primary"
        >
          {ui.confirm}
        </button>
      {/if}
      <button
        onclick={cancel}
        disabled={busy}
        class="btn btn-danger"
      >
        {ui.cancel}
      </button>
    </div>
  {:else}
    <!-- Start a trade -->
    <form
      class="flex gap-2"
      onsubmit={(e) => {
        e.preventDefault();
        start();
      }}
    >
      <input
        bind:value={partnerName}
        maxlength="16"
        placeholder={ui.startPlaceholder}
        class="input flex-1"
      />
      <button
        type="submit"
        disabled={busy || partnerName.trim().length === 0}
        class="btn btn-primary"
      >
        {ui.start}
      </button>
    </form>
  {/if}
</div>
