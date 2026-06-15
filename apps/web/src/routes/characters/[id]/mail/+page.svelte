<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    claimMail,
    deleteMail,
    getMailbox,
    listInventory,
    readMail,
    sendMail,
    type InventoryItemView,
    type Mailbox,
    type MailView,
  } from '$lib/api';
  import { canTradeItem, itemDisplayName } from '@game/shared';
  import { openProfile } from '$lib/ui-stores';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Mailbox',
    compose: 'Compose',
    to: 'To',
    subject: 'Subject',
    body: 'Message',
    send: 'Send',
    sending: 'Sending…',
    inbox: 'Inbox',
    empty: 'Your mailbox is empty.',
    from: 'From',
    open: 'Open',
    claim: 'Take attachments',
    del: 'Delete',
    gold: 'g',
    attach: 'Attach items',
    attachGold: 'Attach gold',
    add: 'Add',
    sent: 'Mail sent.',
    unread: 'unread',
    noTradeable: 'No mailable items in your inventory.',
  };

  let mailbox = $state<Mailbox | null>(null);
  let inventory = $state<InventoryItemView[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let busy = $state(false);
  let openId = $state<string | null>(null);

  // Compose form
  let toName = $state('');
  let subject = $state('');
  let body = $state('');
  let attachGold = $state(0);
  let attachItemId = $state('');
  let attachQty = $state(1);
  let attachments = $state<{ itemId: string; name: string; quantity: number }[]>([]);

  const characterId = $derived($page.params.id ?? '');
  const tradeable = $derived(inventory.filter((i) => canTradeItem(i.itemId)));

  onMount(async () => {
    // Prefill recipient from ?to= (e.g. from a player's card / offline whisper).
    const to = $page.url.searchParams.get('to');
    if (to) toName = to;
    await load();
    inventory = await listInventory(characterId).catch(() => []);
    attachItemId = tradeable[0]?.itemId ?? '';
  });

  async function load(): Promise<void> {
    loading = true;
    try {
      mailbox = await getMailbox(characterId);
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

  function addAttachment(): void {
    if (!attachItemId || attachQty < 1) return;
    const have = tradeable.find((i) => i.itemId === attachItemId);
    if (!have) return;
    const existing = attachments.find((a) => a.itemId === attachItemId);
    const already = existing?.quantity ?? 0;
    if (already + attachQty > have.quantity) return;
    if (existing) existing.quantity += attachQty;
    else attachments = [...attachments, { itemId: attachItemId, name: itemDisplayName(attachItemId), quantity: attachQty }];
    attachments = [...attachments];
  }

  function removeAttachment(itemId: string): void {
    attachments = attachments.filter((a) => a.itemId !== itemId);
  }

  async function submit(): Promise<void> {
    if (busy || !toName.trim() || !subject.trim()) return;
    busy = true;
    error = null;
    notice = null;
    try {
      await sendMail(characterId, {
        toName: toName.trim(),
        subject: subject.trim(),
        body: body.trim() || undefined,
        items: attachments.map((a) => ({ itemId: a.itemId, quantity: a.quantity })),
        gold: attachGold > 0 ? attachGold : undefined,
      });
      notice = ui.sent;
      subject = '';
      body = '';
      attachGold = 0;
      attachments = [];
      inventory = await listInventory(characterId).catch(() => inventory);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  async function act(fn: () => Promise<Mailbox>): Promise<void> {
    if (busy) return;
    busy = true;
    error = null;
    try {
      mailbox = await fn();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  function toggleOpen(m: MailView): void {
    openId = openId === m.id ? null : m.id;
    if (openId === m.id && !m.read) void act(() => readMail(characterId, m.id));
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{ui.title}</h1>
    {#if mailbox && mailbox.unread > 0}
      <span class="chip" style="color:var(--gold-bright)">{mailbox.unread} {ui.unread}</span>
    {/if}
  </div>

  {#if error}<p class="text-sm text-[var(--danger)]">{error}</p>{/if}
  {#if notice}<p class="text-sm text-[var(--success)]">{notice}</p>{/if}

  <!-- Compose -->
  <section class="panel panel-pad">
    <h2 class="panel-title">{ui.compose}</h2>
    <form
      class="mt-3 space-y-3"
      onsubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="field-label">{ui.to}</span>
          <input bind:value={toName} maxlength="16" class="input mt-1" />
        </label>
        <label class="block">
          <span class="field-label">{ui.subject}</span>
          <input bind:value={subject} maxlength="64" class="input mt-1" />
        </label>
      </div>
      <label class="block">
        <span class="field-label">{ui.body}</span>
        <textarea bind:value={body} maxlength="512" rows="2" class="input mt-1"></textarea>
      </label>

      <!-- Attachments -->
      <div class="rounded-lg border border-[var(--border)] p-3">
        <div class="flex flex-wrap items-end gap-2">
          <label class="block flex-1">
            <span class="field-label">{ui.attach}</span>
            {#if tradeable.length > 0}
              <select bind:value={attachItemId} class="input mt-1">
                {#each tradeable as i (i.itemId)}
                  <option value={i.itemId}>{itemDisplayName(i.itemId)} (x{i.quantity})</option>
                {/each}
              </select>
            {:else}
              <p class="mt-1 text-xs text-[var(--text-faint)]">{ui.noTradeable}</p>
            {/if}
          </label>
          <input type="number" min="1" bind:value={attachQty} class="input w-20" />
          <button type="button" class="btn btn-sm" onclick={addAttachment} disabled={tradeable.length === 0}>{ui.add}</button>
          <label class="block">
            <span class="field-label">{ui.attachGold}</span>
            <input type="number" min="0" bind:value={attachGold} class="input mt-1 w-28" />
          </label>
        </div>
        {#if attachments.length > 0}
          <ul class="mt-2 flex flex-wrap gap-1.5">
            {#each attachments as a (a.itemId)}
              <button type="button" class="chip" onclick={() => removeAttachment(a.itemId)} title="Remove">
                {a.name} x{a.quantity} ✕
              </button>
            {/each}
          </ul>
        {/if}
      </div>

      <button type="submit" disabled={busy || !toName.trim() || !subject.trim()} class="btn btn-primary">
        {busy ? ui.sending : ui.send}
      </button>
    </form>
  </section>

  <!-- Inbox -->
  <section class="panel panel-pad">
    <h2 class="panel-title">{ui.inbox}</h2>
    {#if loading}
      <p class="mt-2 text-[var(--text-dim)]">Loading…</p>
    {:else if !mailbox || mailbox.mail.length === 0}
      <p class="mt-2 text-[var(--text-faint)]">{ui.empty}</p>
    {:else}
      <ul class="mt-3 space-y-2">
        {#each mailbox.mail as m (m.id)}
          <li class="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
            <button class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left" onclick={() => toggleOpen(m)}>
              <span class="min-w-0">
                <span class="flex items-center gap-1.5">
                  {#if !m.read}<span class="text-[var(--gold-bright)]">●</span>{/if}
                  <span class="truncate font-medium {m.read ? 'text-[var(--text-dim)]' : 'text-[var(--text)]'}">{m.subject}</span>
                  {#if m.hasAttachments}<span title="Has attachments">📎</span>{/if}
                </span>
                <span class="block text-xs text-[var(--text-faint)]">{ui.from} {m.fromName}</span>
              </span>
              <span class="shrink-0 text-xs text-[var(--text-faint)]">{new Date(m.sentAt).toLocaleDateString()}</span>
            </button>

            {#if openId === m.id}
              <div class="border-t border-[var(--border)] px-3 py-2 text-sm">
                {#if m.body}<p class="whitespace-pre-wrap text-[var(--text-dim)]">{m.body}</p>{/if}
                {#if m.gold > 0 || m.items.length > 0}
                  <div class="mt-2 rounded bg-black/20 p-2 text-xs">
                    <span class="text-[var(--text-faint)]">Attachments:</span>
                    {#if m.gold > 0}<span class="ml-1 text-[var(--gold-bright)]">{m.gold}{ui.gold}</span>{/if}
                    {#each m.items as it (it.itemId)}<span class="ml-1">· {it.name} x{it.quantity}</span>{/each}
                    {#if m.claimed}<span class="ml-1 text-[var(--success)]">(claimed)</span>{/if}
                  </div>
                {/if}
                <div class="mt-2 flex gap-2">
                  {#if m.fromCharacterId}
                    <button class="btn btn-sm" onclick={() => openProfile(m.fromCharacterId!, m.fromName)}>👤 {m.fromName}</button>
                  {/if}
                  {#if m.hasAttachments}
                    <button class="btn btn-primary btn-sm" disabled={busy} onclick={() => act(() => claimMail(characterId, m.id))}>{ui.claim}</button>
                  {/if}
                  <button class="btn btn-danger btn-sm" disabled={busy || m.hasAttachments} onclick={() => act(() => deleteMail(characterId, m.id))}>{ui.del}</button>
                </div>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
