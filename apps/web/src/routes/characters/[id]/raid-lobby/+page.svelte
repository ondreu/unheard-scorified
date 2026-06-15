<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    createRaidLobby,
    getRaidLobby,
    inviteToLobby,
    kickLobbyMember,
    leaveRaidLobby,
    listRaids,
    respondLobbyInvite,
    startRaidLobby,
    type LobbyState,
    type RaidListItem,
    type RaidRole,
  } from '$lib/api';
  import { CLASSES } from '@game/shared';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    back: '← Back to character',
    title: 'Raid Lobby',
    subtitle: 'Manually assemble a raid — invite friends/guild, fill the rest with mercenaries.',
    create: 'Create lobby',
    raid: 'Raid',
    role: 'Your role',
    size: 'Size',
    found: 'Create',
    invites: 'Invitations',
    accept: 'Accept',
    decline: 'Decline',
    members: 'Roster',
    invitePlaceholder: 'Character name…',
    invite: 'Invite',
    inviteRole: 'as',
    start: 'Start raid →',
    leave: 'Leave',
    kick: 'Kick',
    open: 'Open slots',
    noRaids: 'No raids unlocked yet.',
    level: 'Lv',
  };

  const ROLES: RaidRole[] = ['tank', 'healer', 'dps'];

  let ls = $state<LobbyState | null>(null);
  let raids = $state<RaidListItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);

  // Create form
  let raidId = $state('');
  let role = $state<RaidRole>('tank');
  let size = $state<number>(5);
  // Invite form
  let inviteName = $state('');
  let inviteRole = $state<RaidRole>('dps');

  const characterId = $derived($page.params.id ?? '');
  const unlockedRaids = $derived(raids.filter((r) => r.unlocked));
  const selectedRaid = $derived(unlockedRaids.find((r) => r.id === raidId) ?? null);

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      [ls, raids] = await Promise.all([getRaidLobby(characterId), listRaids(characterId)]);
      const first = raids.find((r) => r.unlocked);
      if (first && !raidId) {
        raidId = first.id;
        size = first.sizes[0] ?? 5;
      }
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

  async function run(fn: () => Promise<LobbyState>): Promise<void> {
    if (busy) return;
    busy = true;
    error = null;
    try {
      ls = await fn();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  function create(): void {
    if (!raidId) return;
    void run(() => createRaidLobby(characterId, raidId, role, size));
  }

  function invite(lobbyId: string): void {
    const name = inviteName.trim();
    if (!name) return;
    void run(async () => {
      const s = await inviteToLobby(characterId, lobbyId, name, inviteRole);
      inviteName = '';
      return s;
    });
  }

  async function start(lobbyId: string): Promise<void> {
    if (busy) return;
    busy = true;
    error = null;
    try {
      const { runId } = await startRaidLobby(characterId, lobbyId);
      await goto(`/raid/${runId}`);
    } catch (err) {
      error = (err as Error).message;
      busy = false;
    }
  }
</script>

<main class="mx-auto max-w-lg px-6 py-12">
  <a href={`/characters/${characterId}`} class="text-sm text-amber-300 underline">{ui.back}</a>
  <h1 class="mt-4 text-3xl font-bold text-amber-200">{ui.title}</h1>
  <p class="mt-1 text-sm text-amber-100/60">{ui.subtitle}</p>

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if ls}
    {@const s = ls}
    {#if error}
      <p class="mt-3 text-sm text-red-400">{error}</p>
    {/if}

    {#if s.lobby}
      {@const g = s.lobby}
      <section class="mt-6 rounded-lg border border-red-900/40 bg-black/20 p-5">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold text-amber-200">{g.raidName}</h2>
          <span class="text-sm text-amber-100/60">{g.size}-man · {g.members.length} signed</span>
        </div>
        <p class="mt-1 text-xs text-amber-100/50">
          {ui.open}: ⛨ {g.remaining.tank} · ✚ {g.remaining.healer} · ⚔ {g.remaining.dps}
        </p>
      </section>

      <!-- Invite (leader) -->
      {#if g.iAmLeader}
        <form
          class="mt-4 flex gap-2"
          onsubmit={(e) => {
            e.preventDefault();
            invite(g.id);
          }}
        >
          <input
            bind:value={inviteName}
            maxlength="16"
            placeholder={ui.invitePlaceholder}
            class="flex-1 rounded border border-amber-900/50 bg-black/30 px-3 py-2 text-sm text-amber-100 placeholder:text-amber-100/30"
          />
          <select
            bind:value={inviteRole}
            class="rounded border border-amber-900/50 bg-black/30 px-2 py-2 text-sm text-amber-100"
          >
            {#each ROLES as r (r)}
              <option value={r}>{r}</option>
            {/each}
          </select>
          <button
            type="submit"
            disabled={busy || inviteName.trim().length === 0}
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
                <span class={m.isLeader ? 'text-amber-300' : 'text-sky-300'}
                  >{m.isLeader ? '★ ' : ''}{m.name}</span
                >
                <span class="text-xs text-amber-100/50"
                  >· {m.role} · {ui.level} {m.level} {className(m.class)}
                  {#if m.status === 'invited'}· <em class="text-amber-100/40">invited</em>{/if}</span
                >
              </span>
              {#if g.iAmLeader && !m.isLeader}
                <button
                  onclick={() => run(() => kickLobbyMember(characterId, g.id, m.characterId))}
                  disabled={busy}
                  class="rounded border border-amber-900/50 px-2 py-1 text-xs text-amber-100/60 hover:border-red-700/60 hover:text-red-400 disabled:opacity-40"
                >
                  {ui.kick}
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      </section>

      <div class="mt-6 flex gap-3">
        {#if g.iAmLeader}
          <button
            onclick={() => start(g.id)}
            disabled={busy}
            class="rounded bg-red-700/70 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-red-600/70 disabled:opacity-40"
          >
            {ui.start}
          </button>
        {/if}
        <button
          onclick={() => run(() => leaveRaidLobby(characterId, g.id))}
          disabled={busy}
          class="rounded border border-amber-900/50 px-4 py-2 text-sm text-amber-100/70 hover:border-red-700/60 hover:text-red-400 disabled:opacity-40"
        >
          {ui.leave}
        </button>
      </div>
    {:else}
      <!-- Incoming invites -->
      {#if s.invites.length > 0}
        <section class="mt-6">
          <h2 class="text-lg font-semibold text-amber-200">{ui.invites}</h2>
          <ul class="mt-2 space-y-2">
            {#each s.invites as inv (inv.lobbyId)}
              <li
                class="flex items-center justify-between rounded border border-amber-900/40 bg-black/20 px-4 py-2"
              >
                <span class="text-amber-100"
                  >{inv.raidName} <span class="text-xs text-amber-100/50">· {inv.size}-man · as {inv.role}</span></span
                >
                <span class="flex gap-2">
                  <button
                    onclick={() => run(() => respondLobbyInvite(characterId, inv.lobbyId, true))}
                    disabled={busy}
                    class="rounded bg-emerald-700/60 px-3 py-1 text-xs font-medium text-emerald-100 hover:bg-emerald-600/60 disabled:opacity-40"
                  >
                    {ui.accept}
                  </button>
                  <button
                    onclick={() => run(() => respondLobbyInvite(characterId, inv.lobbyId, false))}
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

      <!-- Create lobby -->
      <section class="mt-6 rounded-lg border border-amber-900/40 bg-black/20 p-5">
        <h2 class="text-lg font-semibold text-amber-200">{ui.create}</h2>
        {#if unlockedRaids.length === 0}
          <p class="mt-2 text-sm text-amber-100/60">{ui.noRaids}</p>
        {:else}
          <div class="mt-3 space-y-3">
            <label class="block text-sm text-amber-100/70">
              {ui.raid}
              <select
                bind:value={raidId}
                onchange={() => (size = selectedRaid?.sizes[0] ?? 5)}
                class="mt-1 block w-full rounded border border-amber-900/50 bg-black/30 px-2 py-2 text-amber-100"
              >
                {#each unlockedRaids as r (r.id)}
                  <option value={r.id}>{r.name}</option>
                {/each}
              </select>
            </label>
            <div class="flex gap-3">
              <label class="flex-1 text-sm text-amber-100/70">
                {ui.role}
                <select
                  bind:value={role}
                  class="mt-1 block w-full rounded border border-amber-900/50 bg-black/30 px-2 py-2 text-amber-100"
                >
                  {#each ROLES as r (r)}
                    <option value={r}>{r}</option>
                  {/each}
                </select>
              </label>
              <label class="flex-1 text-sm text-amber-100/70">
                {ui.size}
                <select
                  bind:value={size}
                  class="mt-1 block w-full rounded border border-amber-900/50 bg-black/30 px-2 py-2 text-amber-100"
                >
                  {#each selectedRaid?.sizes ?? [5] as sz (sz)}
                    <option value={sz}>{sz}-man</option>
                  {/each}
                </select>
              </label>
            </div>
            <button
              onclick={create}
              disabled={busy || !raidId}
              class="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-black hover:bg-amber-500 disabled:opacity-40"
            >
              {ui.found}
            </button>
          </div>
        {/if}
      </section>
    {/if}
  {:else if error}
    <p class="mt-6 text-red-400">{error}</p>
  {/if}
</main>
