<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    createGuild,
    disbandGuild,
    getGuild,
    inviteToGuild,
    kickGuildMember,
    leaveGuild,
    respondGuildInvite,
    setGuildRank,
    type GuildState,
  } from '$lib/api';
  import { canInvite, canManageMember, CLASSES, type GuildRank } from '@game/shared';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    back: '← Back to character',
    title: 'Guild',
    create: 'Found a guild',
    createPlaceholder: 'Guild name…',
    found: 'Found',
    noGuild: 'You are not in a guild yet.',
    invites: 'Guild invitations',
    accept: 'Accept',
    decline: 'Decline',
    members: 'Members',
    invitePlaceholder: 'Character name…',
    invite: 'Invite',
    leave: 'Leave guild',
    disband: 'Disband',
    kick: 'Kick',
    promote: 'Promote',
    demote: 'Demote',
    level: 'Lv',
  };

  let gs = $state<GuildState | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let nameInput = $state('');
  let inviteInput = $state('');

  const characterId = $derived($page.params.id ?? '');
  const myRank = $derived<GuildRank | null>(gs?.guild?.myRank ?? null);

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      gs = await getGuild(characterId);
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

  function className(id: string): string {
    return CLASSES[id as keyof typeof CLASSES]?.name ?? id;
  }

  async function run(fn: () => Promise<GuildState>): Promise<void> {
    if (busy) return;
    busy = true;
    error = null;
    try {
      gs = await fn();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  function found(): void {
    const name = nameInput.trim();
    if (!name) return;
    void run(async () => {
      const s = await createGuild(characterId, name);
      nameInput = '';
      return s;
    });
  }

  function invite(): void {
    const name = inviteInput.trim();
    if (!name) return;
    void run(async () => {
      const s = await inviteToGuild(characterId, name);
      inviteInput = '';
      return s;
    });
  }
</script>

<main class="mx-auto max-w-lg px-6 py-12">
  <a href={`/characters/${characterId}`} class="text-sm text-amber-300 underline">{ui.back}</a>
  <h1 class="mt-4 text-3xl font-bold text-amber-200">{ui.title}</h1>

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if gs}
    {@const s = gs}
    {#if error}
      <p class="mt-3 text-sm text-red-400">{error}</p>
    {/if}

    {#if s.guild}
      {@const g = s.guild}
      <section class="mt-6 rounded-lg border border-amber-900/40 bg-black/20 p-5">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold text-amber-200">{g.name}</h2>
          <span class="text-sm text-amber-100/60">{g.memberCount} members · {g.myRank}</span>
        </div>
      </section>

      <!-- Invite (officer+) -->
      {#if canInvite(myRank ?? 'member')}
        <form
          class="mt-4 flex gap-2"
          onsubmit={(e) => {
            e.preventDefault();
            invite();
          }}
        >
          <input
            bind:value={inviteInput}
            maxlength="16"
            placeholder={ui.invitePlaceholder}
            class="flex-1 rounded border border-amber-900/50 bg-black/30 px-3 py-2 text-sm text-amber-100 placeholder:text-amber-100/30"
          />
          <button
            type="submit"
            disabled={busy || inviteInput.trim().length === 0}
            class="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-black hover:bg-amber-500 disabled:opacity-40"
          >
            {ui.invite}
          </button>
        </form>
      {/if}

      <!-- Roster -->
      <section class="mt-6">
        <h3 class="text-lg font-semibold text-amber-200">{ui.members}</h3>
        <ul class="mt-2 space-y-2">
          {#each g.members as m (m.characterId)}
            <li
              class="flex items-center justify-between rounded border border-amber-900/40 bg-black/20 px-4 py-2"
            >
              <span class="text-amber-100">
                <span class={m.rank === 'leader' ? 'text-amber-300' : 'text-sky-300'}
                  >{m.rank === 'leader' ? '★ ' : m.rank === 'officer' ? '✦ ' : ''}{m.name}</span
                >
                <span class="text-xs text-amber-100/50">· {ui.level} {m.level} {className(m.class)}</span>
              </span>
              {#if m.characterId !== characterId}
                <span class="flex gap-2">
                  {#if myRank === 'leader' && m.rank !== 'leader'}
                    {#if m.rank === 'member'}
                      <button
                        onclick={() => run(() => setGuildRank(characterId, m.characterId, 'officer'))}
                        disabled={busy}
                        class="rounded border border-amber-900/50 px-2 py-1 text-xs text-amber-200/80 hover:border-amber-600 disabled:opacity-40"
                      >
                        {ui.promote}
                      </button>
                    {:else}
                      <button
                        onclick={() => run(() => setGuildRank(characterId, m.characterId, 'member'))}
                        disabled={busy}
                        class="rounded border border-amber-900/50 px-2 py-1 text-xs text-amber-200/80 hover:border-amber-600 disabled:opacity-40"
                      >
                        {ui.demote}
                      </button>
                    {/if}
                  {/if}
                  {#if myRank && canManageMember(myRank, m.rank)}
                    <button
                      onclick={() => run(() => kickGuildMember(characterId, m.characterId))}
                      disabled={busy}
                      class="rounded border border-amber-900/50 px-2 py-1 text-xs text-amber-100/60 hover:border-red-700/60 hover:text-red-400 disabled:opacity-40"
                    >
                      {ui.kick}
                    </button>
                  {/if}
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      </section>

      <!-- Leave / disband -->
      <div class="mt-6 flex gap-3">
        <button
          onclick={() => run(() => leaveGuild(characterId))}
          disabled={busy}
          class="rounded border border-amber-900/50 px-4 py-2 text-sm text-amber-100/70 hover:border-red-700/60 hover:text-red-400 disabled:opacity-40"
        >
          {ui.leave}
        </button>
        {#if myRank === 'leader'}
          <button
            onclick={() => run(() => disbandGuild(characterId))}
            disabled={busy}
            class="rounded border border-red-900/50 px-4 py-2 text-sm text-red-300/80 hover:bg-red-900/30 disabled:opacity-40"
          >
            {ui.disband}
          </button>
        {/if}
      </div>
    {:else}
      <!-- Incoming invites -->
      {#if s.invites.length > 0}
        <section class="mt-6">
          <h2 class="text-lg font-semibold text-amber-200">{ui.invites}</h2>
          <ul class="mt-2 space-y-2">
            {#each s.invites as inv (inv.inviteId)}
              <li
                class="flex items-center justify-between rounded border border-amber-900/40 bg-black/20 px-4 py-2"
              >
                <span class="text-amber-100">
                  {inv.guildName}
                  {#if inv.invitedBy}<span class="text-xs text-amber-100/50">· by {inv.invitedBy}</span>{/if}
                </span>
                <span class="flex gap-2">
                  <button
                    onclick={() => run(() => respondGuildInvite(characterId, inv.inviteId, true))}
                    disabled={busy}
                    class="rounded bg-emerald-700/60 px-3 py-1 text-xs font-medium text-emerald-100 hover:bg-emerald-600/60 disabled:opacity-40"
                  >
                    {ui.accept}
                  </button>
                  <button
                    onclick={() => run(() => respondGuildInvite(characterId, inv.inviteId, false))}
                    disabled={busy}
                    class="rounded border border-amber-900/50 px-3 py-1 text-xs text-amber-100/70 hover:border-red-700/60 hover:text-red-400 disabled:opacity-40"
                  >
                    {ui.decline}
                  </button>
                </span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <!-- Create guild -->
      <section class="mt-6">
        <p class="text-sm text-amber-100/60">{ui.noGuild}</p>
        <form
          class="mt-3 flex gap-2"
          onsubmit={(e) => {
            e.preventDefault();
            found();
          }}
        >
          <input
            bind:value={nameInput}
            maxlength="24"
            placeholder={ui.createPlaceholder}
            class="flex-1 rounded border border-amber-900/50 bg-black/30 px-3 py-2 text-sm text-amber-100 placeholder:text-amber-100/30"
          />
          <button
            type="submit"
            disabled={busy || nameInput.trim().length < 3}
            class="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-black hover:bg-amber-500 disabled:opacity-40"
          >
            {ui.found}
          </button>
        </form>
      </section>
    {/if}
  {:else if error}
    <p class="mt-6 text-red-400">{error}</p>
  {/if}
</main>
