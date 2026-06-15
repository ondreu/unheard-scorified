<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    cancelGuildCharter,
    disbandGuild,
    foundGuildFromCharter,
    getGuild,
    inviteGuildCharterSign,
    inviteToGuild,
    kickGuildMember,
    leaveGuild,
    respondGuildCharterSign,
    respondGuildInvite,
    setGuildRank,
    startGuildCharter,
    type GuildState,
  } from '$lib/api';
  import {
    canInvite,
    canManageMember,
    GUILD_CHARTER_COST,
    GUILD_CHARTER_SIGNATURES_REQUIRED,
    type GuildRank,
  } from '@game/shared';
  import { CLASS_COLOR, className } from '$lib/cosmetics';
  import { openProfile } from '$lib/ui-stores';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Guild',
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
    // Charter
    charterTitle: 'Found a guild',
    charterIntro: `Founding a guild works like a charter: pay ${GUILD_CHARTER_COST} gold to start one, then gather ${GUILD_CHARTER_SIGNATURES_REQUIRED} signatures from other players before you can found it.`,
    charterNamePlaceholder: 'Proposed guild name…',
    startCharter: `Buy charter (${GUILD_CHARTER_COST}g)`,
    yourCharter: 'Your guild charter',
    signatures: 'Signatures',
    signPlaceholder: 'Ask a player to sign…',
    askSign: 'Ask to sign',
    found: 'Found guild',
    cancelCharter: 'Tear up charter',
    signed: 'signed',
    pending: 'pending',
    charterRequests: 'Charter signatures requested',
    sign: 'Sign',
    needMore: (have: number, need: number): string => `${have} / ${need} signatures`,
  };

  let gs = $state<GuildState | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let nameInput = $state('');
  let inviteInput = $state('');
  let signInput = $state('');

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

  function startCharter(): void {
    const name = nameInput.trim();
    if (name.length < 3) return;
    void run(async () => {
      const s = await startGuildCharter(characterId, name);
      nameInput = '';
      return s;
    });
  }

  function askSign(): void {
    const name = signInput.trim();
    if (!name) return;
    void run(async () => {
      const s = await inviteGuildCharterSign(characterId, name);
      signInput = '';
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

<div class="space-y-6">
  <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{ui.title}</h1>

  {#if loading}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {:else if gs}
    {@const s = gs}
    {#if error}<p class="text-sm text-[var(--danger)]">{error}</p>{/if}

    {#if s.guild}
      {@const g = s.guild}
      <section class="panel panel-pad">
        <div class="flex items-center justify-between">
          <h2 class="panel-title text-xl">🏰 {g.name}</h2>
          <span class="chip">{g.memberCount} members · {g.myRank}</span>
        </div>

        {#if canInvite(myRank ?? 'member')}
          <form
            class="mt-4 flex gap-2"
            onsubmit={(e) => {
              e.preventDefault();
              invite();
            }}
          >
            <input bind:value={inviteInput} maxlength="16" placeholder={ui.invitePlaceholder} class="input" />
            <button type="submit" disabled={busy || inviteInput.trim().length === 0} class="btn btn-primary btn-sm">
              {ui.invite}
            </button>
          </form>
        {/if}
      </section>

      <!-- Roster -->
      <section class="panel panel-pad">
        <h3 class="panel-title">{ui.members}</h3>
        <ul class="mt-3 space-y-2">
          {#each g.members as m (m.characterId)}
            <li class="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2">
              <span>
                <button
                  class="font-semibold hover:underline"
                  style={`color:${CLASS_COLOR[m.class] ?? 'var(--text)'}`}
                  onclick={() => openProfile(m.characterId, m.name)}
                >
                  {m.rank === 'leader' ? '👑 ' : m.rank === 'officer' ? '✦ ' : ''}{m.name}
                </button>
                <span class="text-xs text-[var(--text-faint)]">· {ui.level} {m.level} {className(m.class)}</span>
              </span>
              {#if m.characterId !== characterId}
                <span class="flex gap-2">
                  {#if myRank === 'leader' && m.rank !== 'leader'}
                    {#if m.rank === 'member'}
                      <button onclick={() => run(() => setGuildRank(characterId, m.characterId, 'officer'))} disabled={busy} class="btn btn-sm">
                        {ui.promote}
                      </button>
                    {:else}
                      <button onclick={() => run(() => setGuildRank(characterId, m.characterId, 'member'))} disabled={busy} class="btn btn-sm">
                        {ui.demote}
                      </button>
                    {/if}
                  {/if}
                  {#if myRank && canManageMember(myRank, m.rank)}
                    <button onclick={() => run(() => kickGuildMember(characterId, m.characterId))} disabled={busy} class="btn btn-danger btn-sm">
                      {ui.kick}
                    </button>
                  {/if}
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      </section>

      <div class="flex gap-3">
        <button onclick={() => run(() => leaveGuild(characterId))} disabled={busy} class="btn btn-danger">{ui.leave}</button>
        {#if myRank === 'leader'}
          <button onclick={() => run(() => disbandGuild(characterId))} disabled={busy} class="btn btn-danger">{ui.disband}</button>
        {/if}
      </div>
    {:else}
      <!-- Incoming guild invites -->
      {#if s.invites.length > 0}
        <section class="panel panel-pad">
          <h2 class="panel-title">{ui.invites}</h2>
          <ul class="mt-3 space-y-2">
            {#each s.invites as inv (inv.inviteId)}
              <li class="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2">
                <span>🏰 {inv.guildName}
                  {#if inv.invitedBy}<span class="text-xs text-[var(--text-faint)]">· by {inv.invitedBy}</span>{/if}
                </span>
                <span class="flex gap-2">
                  <button onclick={() => run(() => respondGuildInvite(characterId, inv.inviteId, true))} disabled={busy} class="btn btn-primary btn-sm">{ui.accept}</button>
                  <button onclick={() => run(() => respondGuildInvite(characterId, inv.inviteId, false))} disabled={busy} class="btn btn-sm">{ui.decline}</button>
                </span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <!-- Incoming charter sign requests -->
      {#if s.charterInvites.length > 0}
        <section class="panel panel-pad">
          <h2 class="panel-title">{ui.charterRequests}</h2>
          <ul class="mt-3 space-y-2">
            {#each s.charterInvites as req (req.charterId)}
              <li class="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2">
                <span>📜 {req.guildName}
                  {#if req.founderName}<span class="text-xs text-[var(--text-faint)]">· by {req.founderName}</span>{/if}
                </span>
                <span class="flex gap-2">
                  <button onclick={() => run(() => respondGuildCharterSign(characterId, req.charterId, true))} disabled={busy} class="btn btn-primary btn-sm">{ui.sign}</button>
                  <button onclick={() => run(() => respondGuildCharterSign(characterId, req.charterId, false))} disabled={busy} class="btn btn-sm">{ui.decline}</button>
                </span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if s.charter}
        {@const ch = s.charter}
        <!-- Founder's own charter in progress -->
        <section class="panel panel-pad">
          <div class="flex items-center justify-between">
            <h2 class="panel-title">📜 {ui.yourCharter}: {ch.name}</h2>
            <span class="chip" style={`color:${ch.canFound ? 'var(--success)' : 'var(--gold-bright)'}`}>
              {ui.needMore(ch.signedCount, ch.required)}
            </span>
          </div>

          <div class="bar mt-3">
            <div class="bar-fill" style={`width:${Math.min(100, (ch.signedCount / ch.required) * 100)}%`}></div>
          </div>

          {#if ch.signatures.length > 0}
            <h3 class="mt-4 text-sm font-semibold text-[var(--text-dim)]">{ui.signatures}</h3>
            <ul class="mt-2 flex flex-wrap gap-1.5">
              {#each ch.signatures as sig (sig.characterId)}
                <button
                  class="chip"
                  style={`color:${sig.signed ? 'var(--success)' : 'var(--text-faint)'}`}
                  onclick={() => openProfile(sig.characterId, sig.name)}
                >
                  {sig.signed ? '✔' : '…'} {sig.name}
                </button>
              {/each}
            </ul>
          {/if}

          <form
            class="mt-4 flex gap-2"
            onsubmit={(e) => {
              e.preventDefault();
              askSign();
            }}
          >
            <input bind:value={signInput} maxlength="16" placeholder={ui.signPlaceholder} class="input" />
            <button type="submit" disabled={busy || signInput.trim().length === 0} class="btn btn-sm">{ui.askSign}</button>
          </form>

          <div class="mt-4 flex gap-3">
            <button onclick={() => run(() => foundGuildFromCharter(characterId))} disabled={busy || !ch.canFound} class="btn btn-primary">
              {ui.found}
            </button>
            <button onclick={() => run(() => cancelGuildCharter(characterId))} disabled={busy} class="btn btn-danger">
              {ui.cancelCharter}
            </button>
          </div>
        </section>
      {:else}
        <!-- Start a new charter -->
        <section class="panel panel-pad">
          <h2 class="panel-title">{ui.charterTitle}</h2>
          <p class="mt-2 text-sm text-[var(--text-dim)]">{ui.noGuild}</p>
          <p class="mt-1 text-sm text-[var(--text-faint)]">{ui.charterIntro}</p>
          <form
            class="mt-4 flex gap-2"
            onsubmit={(e) => {
              e.preventDefault();
              startCharter();
            }}
          >
            <input bind:value={nameInput} maxlength="24" placeholder={ui.charterNamePlaceholder} class="input" />
            <button type="submit" disabled={busy || nameInput.trim().length < 3} class="btn btn-primary">
              {ui.startCharter}
            </button>
          </form>
        </section>
      {/if}
    {/if}
  {:else if error}
    <p class="text-[var(--danger)]">{error}</p>
  {/if}
</div>
