<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import { arenaBracketForSize } from '@game/shared';
  import {
    ApiError,
    createGroup,
    disbandGroup,
    getGroup,
    inviteToGroup,
    kickGroupMember,
    launchGroup,
    leaveGroup,
    listDungeons,
    listRaids,
    promoteGroupMember,
    respondGroupInvite,
    setGroupRole,
    type DungeonListItem,
    type GroupState,
    type RaidListItem,
    type RaidRole,
  } from '$lib/api';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Group',
    back: '← Back to character',
    none: 'You are not in a group.',
    create: 'Create group',
    invites: 'Invites',
    accept: 'Accept',
    decline: 'Decline',
    members: 'Members',
    leader: 'Leader',
    invite: 'Invite',
    inviteName: 'Character name',
    leave: 'Leave',
    disband: 'Disband',
    kick: 'Kick',
    promote: 'Make leader',
    myRole: 'My role',
    launch: 'Go',
    dungeon: 'Dungeon',
    raid: 'Raid',
    arena: 'Arena',
    arenaHint: 'Arena bracket follows your group size (1 → 1v1, 2 → 2v2, 3 → 3v3, 5 → 5v5).',
  };

  const ROLES: RaidRole[] = ['tank', 'healer', 'dps'];

  let gs = $state<GroupState | null>(null);
  let dungeons = $state<DungeonListItem[]>([]);
  let raids = $state<RaidListItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);

  // Form state
  let createRole = $state<RaidRole>('dps');
  let inviteName = $state('');
  let inviteRole = $state<RaidRole>('dps');
  let dungeonId = $state('');
  let raidId = $state('');

  const characterId = $derived($page.params.id ?? '');

  // My own joined membership → keep the "My role" select in sync with reality.
  const myMember = $derived(gs?.group?.members.find((m) => m.characterId === characterId) ?? null);
  let roleSel = $state<RaidRole>('dps');
  $effect(() => {
    if (myMember) roleSel = myMember.role;
  });

  // Aréna: bracket plyne z velikosti (1/2/3/5); jinak nelze (null → tlačítko off).
  const arenaBracket = $derived(arenaBracketForSize(gs?.group?.joinedCount ?? 0));
  let poller: ReturnType<typeof setInterval> | undefined;

  onMount(async () => {
    await load();
    const [d, r] = await Promise.all([
      listDungeons(characterId).catch(() => []),
      listRaids(characterId).catch(() => []),
    ]);
    dungeons = d.filter((x) => x.unlocked);
    raids = r.filter((x) => x.unlocked);
    dungeonId = dungeons[0]?.id ?? '';
    raidId = raids[0]?.id ?? '';
    // Light polling for invites / members joining (no WS for groups).
    poller = setInterval(() => void load(true), 4000);
  });

  onDestroy(() => {
    if (poller) clearInterval(poller);
  });

  async function load(silent = false): Promise<void> {
    if (!silent) loading = true;
    try {
      gs = await getGroup(characterId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await goto('/login');
        return;
      }
      if (!silent) error = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  async function act(fn: () => Promise<GroupState>): Promise<void> {
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

  async function launch(activity: 'dungeon' | 'raid' | 'arena'): Promise<void> {
    busy = true;
    error = null;
    try {
      const content = activity === 'dungeon' ? dungeonId : activity === 'raid' ? raidId : undefined;
      const res = await launchGroup(characterId, activity, content);
      if (res.activityType === 'dungeon') await goto(`/characters/${characterId}/dungeon/${res.runId}`);
      else if (res.activityType === 'raid') await goto(`/characters/${characterId}/raid/${res.runId}`);
      else if (res.matchId) {
        const path = res.bracket === '1v1' ? 'arena/match' : 'team-match';
        await goto(`/characters/${characterId}/${path}/${res.matchId}`);
      } else {
        // queued for an opponent — refresh and inform.
        error = `Queued for a ${res.bracket} arena match — you'll be notified when matched.`;
        await load(true);
      }
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<main class="mx-auto max-w-lg px-6 py-12">
  <a href={`/characters/${characterId}`} class="text-sm text-amber-300 underline">{ui.back}</a>
  <h1 class="mt-4 text-3xl font-bold text-amber-200">{ui.title}</h1>

  {#if error}<p class="mt-3 text-red-400">{error}</p>{/if}

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if gs}
    <!-- Incoming invites -->
    {#if gs.invites.length > 0}
      <section class="mt-6">
        <h2 class="text-xs uppercase tracking-wide text-amber-100/40">{ui.invites}</h2>
        {#each gs.invites as inv (inv.groupId)}
          <div class="mt-2 flex items-center justify-between rounded border border-sky-900/50 bg-black/20 px-3 py-2">
            <span class="text-amber-100/80">{inv.leaderName}'s group · <span class="uppercase text-amber-300/70">{inv.role}</span></span>
            <span class="flex gap-2">
              <button
                disabled={busy}
                onclick={() => act(() => respondGroupInvite(characterId, inv.groupId, true))}
                class="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-black hover:bg-emerald-500 disabled:opacity-50"
              >{ui.accept}</button>
              <button
                disabled={busy}
                onclick={() => act(() => respondGroupInvite(characterId, inv.groupId, false))}
                class="rounded border border-stone-600 px-3 py-1 text-sm text-stone-300 hover:bg-stone-800 disabled:opacity-50"
              >{ui.decline}</button>
            </span>
          </div>
        {/each}
      </section>
    {/if}

    {#if !gs.group}
      <!-- No group → create -->
      <section class="mt-6 rounded-lg border border-amber-900/40 bg-black/20 p-5">
        <p class="text-amber-100/70">{ui.none}</p>
        <div class="mt-3 flex items-end gap-2">
          <label class="text-sm text-amber-100/70">
            {ui.myRole}
            <select bind:value={createRole} class="mt-1 block rounded border border-amber-900/40 bg-black/40 px-2 py-1 text-sm text-amber-100">
              {#each ROLES as r (r)}<option value={r}>{r}</option>{/each}
            </select>
          </label>
          <button
            disabled={busy}
            onclick={() => act(() => createGroup(characterId, createRole))}
            class="rounded bg-red-700 px-4 py-2 text-sm font-medium text-amber-50 hover:bg-red-600 disabled:opacity-50"
          >{ui.create}</button>
        </div>
      </section>
    {:else}
      {@const g = gs.group}
      <!-- Members -->
      <section class="mt-6">
        <h2 class="text-xs uppercase tracking-wide text-amber-100/40">{ui.members} ({g.joinedCount})</h2>
        <ul class="mt-2 space-y-1">
          {#each g.members as m (m.characterId)}
            <li class="flex items-center justify-between rounded bg-black/20 px-3 py-1.5 text-sm">
              <span class="text-amber-100/80">
                {m.name}
                <span class="ml-1 uppercase text-amber-300/70">{m.role}</span>
                {#if m.isLeader}<span class="ml-1 text-xs text-amber-400">★ {ui.leader}</span>{/if}
                {#if m.status === 'invited'}<span class="ml-1 text-xs text-stone-500">(invited)</span>{/if}
              </span>
              {#if g.iAmLeader && !m.isLeader && m.status === 'joined'}
                <span class="flex gap-2">
                  <button disabled={busy} onclick={() => act(() => promoteGroupMember(characterId, m.characterId))} class="text-xs text-amber-300 underline disabled:opacity-50">{ui.promote}</button>
                  <button disabled={busy} onclick={() => act(() => kickGroupMember(characterId, m.characterId))} class="text-xs text-red-400 underline disabled:opacity-50">{ui.kick}</button>
                </span>
              {/if}
            </li>
          {/each}
        </ul>

        <!-- My role + leave/disband -->
        <div class="mt-3 flex flex-wrap items-end gap-2">
          <label class="text-sm text-amber-100/70">
            {ui.myRole}
            <select
              bind:value={roleSel}
              onchange={() => act(() => setGroupRole(characterId, roleSel))}
              class="mt-1 block rounded border border-amber-900/40 bg-black/40 px-2 py-1 text-sm text-amber-100"
            >
              {#each ROLES as r (r)}<option value={r}>{r}</option>{/each}
            </select>
          </label>
          <button disabled={busy} onclick={() => act(() => leaveGroup(characterId))} class="rounded border border-stone-600 px-3 py-1.5 text-sm text-stone-300 hover:bg-stone-800 disabled:opacity-50">{ui.leave}</button>
          {#if g.iAmLeader}
            <button disabled={busy} onclick={() => act(() => disbandGroup(characterId))} class="rounded border border-red-800 px-3 py-1.5 text-sm text-red-300 hover:bg-red-950 disabled:opacity-50">{ui.disband}</button>
          {/if}
        </div>
      </section>

      {#if g.iAmLeader}
        <!-- Invite -->
        <section class="mt-6 rounded-lg border border-amber-900/40 bg-black/20 p-4">
          <h2 class="text-xs uppercase tracking-wide text-amber-100/40">{ui.invite}</h2>
          <div class="mt-2 flex flex-wrap items-end gap-2">
            <input bind:value={inviteName} placeholder={ui.inviteName} class="rounded border border-amber-900/40 bg-black/40 px-2 py-1.5 text-sm text-amber-100" />
            <select bind:value={inviteRole} class="rounded border border-amber-900/40 bg-black/40 px-2 py-1.5 text-sm text-amber-100">
              {#each ROLES as r (r)}<option value={r}>{r}</option>{/each}
            </select>
            <button
              disabled={busy || !inviteName.trim()}
              onclick={() => act(async () => { const s = await inviteToGroup(characterId, inviteName.trim(), inviteRole); inviteName = ''; return s; })}
              class="rounded bg-sky-700 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-sky-600 disabled:opacity-50"
            >{ui.invite}</button>
          </div>
          <p class="mt-1 text-xs text-amber-100/40">Invite friends or guild members.</p>
        </section>

        <!-- Launch -->
        <section class="mt-6 rounded-lg border border-amber-900/40 bg-black/20 p-4">
          <h2 class="text-xs uppercase tracking-wide text-amber-100/40">{ui.launch}</h2>
          <div class="mt-3 space-y-3">
            <div class="flex items-end gap-2">
              <select bind:value={dungeonId} class="flex-1 rounded border border-amber-900/40 bg-black/40 px-2 py-1.5 text-sm text-amber-100">
                {#each dungeons as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
              </select>
              <button disabled={busy || !dungeonId} onclick={() => launch('dungeon')} class="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-red-600 disabled:opacity-50">{ui.dungeon} {ui.launch}</button>
            </div>
            <div class="flex items-end gap-2">
              <select bind:value={raidId} class="flex-1 rounded border border-amber-900/40 bg-black/40 px-2 py-1.5 text-sm text-amber-100">
                {#each raids as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
              </select>
              <button disabled={busy || !raidId} onclick={() => launch('raid')} class="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-red-600 disabled:opacity-50">{ui.raid} {ui.launch}</button>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-amber-100/40">
                {arenaBracket ? `Arena: ${arenaBracket}` : ui.arenaHint}
              </span>
              <button disabled={busy || !arenaBracket} onclick={() => launch('arena')} class="rounded bg-purple-700 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-purple-600 disabled:opacity-50">{ui.arena} {ui.launch}</button>
            </div>
          </div>
        </section>
      {/if}
    {/if}
  {/if}
</main>
