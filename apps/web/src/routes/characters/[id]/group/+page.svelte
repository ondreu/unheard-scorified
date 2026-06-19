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
    launchDungeonParty,
    leaveGroup,
    listDungeons,
    getTeamArena,
    promoteGroupMember,
    respondGroupInvite,
    respondGroupJoinRequest,
    setGroupRole,
    type DungeonListItem,
    type GroupState,
    type RaidRole,
    type TeamArenaView,
  } from '$lib/api';
  import { CLASSES } from '@game/shared';
  import { ROLE_META } from '$lib/cosmetics';
  import { openProfile } from '$lib/ui-stores';
  import Avatar from '$lib/components/Avatar.svelte';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Group',
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
    approve: 'Approve',
    promote: 'Make leader',
    myRole: 'My role',
    launch: 'Go',
    dungeon: 'Dungeon',
    arena: 'Arena',
    arenaHint: 'Arena bracket follows your group size (1 → 1v1, 2 → 2v2, 3 → 3v3, 5 → 5v5).',
  };

  const ROLES: RaidRole[] = ['tank', 'healer', 'dps'];

  let gs = $state<GroupState | null>(null);
  let dungeons = $state<DungeonListItem[]>([]);
  let teamArena = $state<TeamArenaView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);

  // Form state
  let createRole = $state<RaidRole>('dps');
  let inviteName = $state('');
  let inviteRole = $state<RaidRole>('dps');
  let dungeonId = $state('');

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
    const d = await listDungeons(characterId).catch(() => []);
    dungeons = d.filter((x) => x.unlocked);
    dungeonId = dungeons[0]?.id ?? '';
    teamArena = await getTeamArena(characterId).catch(() => null);
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

  // Živé MP tahové sezení (ADR 0038) — leader spustí z party, navigace na live run.
  async function launchLive(): Promise<void> {
    if (busy || !dungeonId) return;
    busy = true;
    error = null;
    try {
      const res = await launchDungeonParty(characterId, dungeonId);
      await goto(`/characters/${characterId}/dungeon-party/${res.runId}`);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  async function launch(activity: 'dungeon' | 'arena'): Promise<void> {
    busy = true;
    error = null;
    try {
      const content = activity === 'dungeon' ? dungeonId : undefined;
      const res = await launchGroup(characterId, activity, content);
      if (res.activityType === 'dungeon') await goto(`/characters/${characterId}/dungeon/${res.runId}`);
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

<div class="space-y-6">
  <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{ui.title}</h1>

  {#if error}<p class="text-[var(--danger)]">{error}</p>{/if}

  {#if loading}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {:else if gs}
    <!-- Incoming invites -->
    {#if gs.invites.length > 0}
      <section class="panel panel-pad">
        <h2 class="panel-title">{ui.invites}</h2>
        {#each gs.invites as inv (inv.groupId)}
          <div class="mt-2 flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
            <span class="text-[var(--text-dim)]">{inv.leaderName}'s group · <span class="uppercase text-[var(--gold-bright)]">{inv.role}</span></span>
            <span class="flex gap-2">
              <button
                disabled={busy}
                onclick={() => act(() => respondGroupInvite(characterId, inv.groupId, true))}
                class="btn btn-primary btn-sm"
              >{ui.accept}</button>
              <button
                disabled={busy}
                onclick={() => act(() => respondGroupInvite(characterId, inv.groupId, false))}
                class="btn btn-sm"
              >{ui.decline}</button>
            </span>
          </div>
        {/each}
      </section>
    {/if}

    {#if !gs.group}
      <!-- No group → create -->
      <section class="panel panel-pad">
        <p class="text-[var(--text-dim)]">{ui.none}</p>
        <div class="mt-3 flex items-end gap-2">
          <label class="field-label">
            {ui.myRole}
            <select bind:value={createRole} class="input mt-1">
              {#each ROLES as r (r)}<option value={r}>{r}</option>{/each}
            </select>
          </label>
          <button
            disabled={busy}
            onclick={() => act(() => createGroup(characterId, createRole))}
            class="btn btn-primary"
          >{ui.create}</button>
        </div>
      </section>
    {:else}
      {@const g = gs.group}
      <!-- Members -->
      <section class="panel panel-pad">
        <h2 class="panel-title">{ui.members} ({g.joinedCount})</h2>
        <ul class="mt-3 space-y-2">
          {#each g.members as m (m.characterId)}
            <li class="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
              <span class="flex min-w-0 items-center gap-2">
                <Avatar name={m.name} race={m.race} klass={m.class} size={32} />
                <span class="min-w-0">
                  <span class="flex items-center gap-1.5">
                    <button class="hover:underline" onclick={() => openProfile(m.characterId, m.name)}>{m.name}</button>
                    {#if m.isLeader}<span class="text-xs text-[var(--gold-bright)]" title={ui.leader}>★</span>{/if}
                    {#if m.status === 'invited'}<span class="text-xs text-[var(--text-faint)]">(invited)</span>{/if}
                    {#if m.status === 'requested'}<span class="text-xs text-[var(--info)]">(wants to join)</span>{/if}
                  </span>
                  <span class="block text-xs" style={`color:${ROLE_META[m.role].color}`}>
                    {ROLE_META[m.role].icon} {m.role} · Lv {m.level} {CLASSES[m.class as keyof typeof CLASSES]?.name}
                  </span>
                </span>
              </span>
              {#if g.iAmLeader && m.status === 'requested'}
                <span class="flex shrink-0 gap-2">
                  <button disabled={busy} onclick={() => act(() => respondGroupJoinRequest(characterId, m.characterId, true))} class="btn btn-primary btn-sm">{ui.approve}</button>
                  <button disabled={busy} onclick={() => act(() => respondGroupJoinRequest(characterId, m.characterId, false))} class="btn btn-danger btn-sm">{ui.decline}</button>
                </span>
              {:else if g.iAmLeader && !m.isLeader && m.status === 'joined'}
                <span class="flex shrink-0 gap-2">
                  <button disabled={busy} onclick={() => act(() => promoteGroupMember(characterId, m.characterId))} class="btn btn-sm">{ui.promote}</button>
                  <button disabled={busy} onclick={() => act(() => kickGroupMember(characterId, m.characterId))} class="btn btn-danger btn-sm">{ui.kick}</button>
                </span>
              {/if}
            </li>
          {/each}
        </ul>

        <!-- My role + leave/disband -->
        <div class="mt-4 flex flex-wrap items-end gap-2">
          <label class="field-label">
            {ui.myRole}
            <select
              bind:value={roleSel}
              onchange={() => act(() => setGroupRole(characterId, roleSel))}
              class="input mt-1"
            >
              {#each ROLES as r (r)}<option value={r}>{r}</option>{/each}
            </select>
          </label>
          <button disabled={busy} onclick={() => act(() => leaveGroup(characterId))} class="btn">{ui.leave}</button>
          {#if g.iAmLeader}
            <button disabled={busy} onclick={() => act(() => disbandGroup(characterId))} class="btn btn-danger">{ui.disband}</button>
          {/if}
        </div>
      </section>

      {#if g.iAmLeader}
        <!-- Invite -->
        <section class="panel panel-pad">
          <h2 class="panel-title">{ui.invite}</h2>
          <div class="mt-2 flex flex-wrap items-end gap-2">
            <input bind:value={inviteName} placeholder={ui.inviteName} class="input flex-1" />
            <select bind:value={inviteRole} class="input w-auto">
              {#each ROLES as r (r)}<option value={r}>{r}</option>{/each}
            </select>
            <button
              disabled={busy || !inviteName.trim()}
              onclick={() => act(async () => { const s = await inviteToGroup(characterId, inviteName.trim(), inviteRole); inviteName = ''; return s; })}
              class="btn btn-primary"
            >{ui.invite}</button>
          </div>
          <p class="mt-1 text-xs text-[var(--text-faint)]">Invite friends or guild members.</p>
        </section>

        <!-- Launch -->
        <section class="panel panel-pad">
          <h2 class="panel-title">{ui.launch}</h2>
          <div class="mt-3 space-y-3">
            <div class="flex items-end gap-2">
              <select bind:value={dungeonId} class="input flex-1">
                {#each dungeons as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
              </select>
              <button disabled={busy || !dungeonId} onclick={() => launch('dungeon')} class="btn btn-primary btn-sm">{ui.dungeon} {ui.launch}</button>
              <button disabled={busy || !dungeonId} onclick={launchLive} class="btn btn-sm" title="Live turn-based session (idle players covered by AI)">⚔️ Live</button>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-[var(--text-faint)]">
                {arenaBracket ? `Arena: ${arenaBracket}` : ui.arenaHint}
              </span>
              <button disabled={busy || !arenaBracket} onclick={() => launch('arena')} class="btn btn-primary btn-sm">{ui.arena} {ui.launch}</button>
            </div>
            {#if teamArena}
              <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-dim)]">
                {#each teamArena.brackets as br (br.bracket)}
                  <span>{br.bracket}: <span class="text-[var(--gold-bright)]">{br.rating}</span> ({br.tier}) · {br.wins}W/{br.losses}L</span>
                {/each}
              </div>
            {/if}
          </div>
        </section>
      {/if}
    {/if}
  {/if}
</div>
