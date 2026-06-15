<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    getSocial,
    getTeamArena,
    leaveTeamQueue,
    queueTeam,
    type SocialView,
    type TeamArenaView,
  } from '$lib/api';

  const ui = {
    back: '← Back to character',
    title: 'Team Arena',
    subtitle: 'Hand-pick a team (friends or guild) for rated 3v3 / 5v5.',
    rating: 'Rating',
    record: 'W/L',
    queued: 'In queue — searching for a team…',
    form: 'Queue a team',
    bracket: 'Bracket',
    teammate: 'Teammate',
    queue: 'Queue',
    leave: 'Leave queue',
    ineligible: 'Reach the required level to enter the Arena.',
    friendsHint: 'Your friends:',
    matched: 'Match found! Entering…',
  };

  let view = $state<TeamArenaView | null>(null);
  let social = $state<SocialView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let busy = $state(false);

  let bracket = $state<'3v3' | '5v5'>('3v3');
  let names = $state<string[]>(['', '']);

  const characterId = $derived($page.params.id ?? '');
  const teamSize = $derived(bracket === '3v3' ? 3 : 5);

  onMount(load);

  // Drž počet jmen = teamSize-1 dle bracketu.
  $effect(() => {
    const need = teamSize - 1;
    if (names.length !== need) {
      names = Array.from({ length: need }, (_, i) => names[i] ?? '');
    }
  });

  async function load(): Promise<void> {
    loading = true;
    try {
      [view, social] = await Promise.all([getTeamArena(characterId), getSocial(characterId)]);
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

  async function submit(): Promise<void> {
    const teammates = names.map((n) => n.trim()).filter(Boolean);
    if (teammates.length !== teamSize - 1 || busy) return;
    busy = true;
    error = null;
    notice = null;
    try {
      const res = await queueTeam(characterId, bracket, teammates);
      if (res.status === 'matched' && res.matchId) {
        notice = ui.matched;
        await goto(`/characters/${characterId}/team-match/${res.matchId}`);
      } else {
        view = await getTeamArena(characterId);
      }
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  async function leave(b: '3v3' | '5v5'): Promise<void> {
    if (busy) return;
    busy = true;
    error = null;
    try {
      await leaveTeamQueue(characterId, b);
      view = await getTeamArena(characterId);
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
  <p class="mt-1 text-sm text-amber-100/60">{ui.subtitle}</p>

  {#if notice}<p class="mt-3 text-sm text-emerald-300">{notice}</p>{/if}
  {#if error}<p class="mt-3 text-sm text-red-400">{error}</p>{/if}

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if view}
    {@const v = view}
    {#if !v.eligible}
      <p class="mt-6 text-amber-100/70">{ui.ineligible}</p>
    {:else}
      <!-- Bracket standings -->
      <section class="mt-6 space-y-2">
        {#each v.brackets as br (br.bracket)}
          <div class="flex items-center justify-between rounded border border-red-900/40 bg-black/20 px-4 py-3">
            <div>
              <span class="font-semibold text-amber-200">{br.bracket}</span>
              <span class="ml-2 text-xs text-amber-100/50">{br.tier}</span>
            </div>
            <div class="text-sm text-amber-100/80">
              {ui.rating} <span class="font-mono text-amber-200">{br.rating}</span>
              <span class="ml-2 text-amber-100/50">{ui.record} {br.wins}/{br.losses}</span>
              {#if br.queued}
                <button
                  onclick={() => leave(br.bracket)}
                  disabled={busy}
                  class="ml-3 rounded border border-amber-900/50 px-2 py-1 text-xs text-amber-100/70 hover:border-red-700/60 hover:text-red-400 disabled:opacity-40"
                >
                  {ui.leave}
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </section>

      {#if v.brackets.some((b) => b.queued)}
        <p class="mt-3 text-sm text-amber-300">{ui.queued}</p>
      {/if}

      <!-- Queue form -->
      <section class="mt-6 rounded-lg border border-amber-900/40 bg-black/20 p-5">
        <h2 class="text-lg font-semibold text-amber-200">{ui.form}</h2>
        <label class="mt-3 block text-sm text-amber-100/70">
          {ui.bracket}
          <select
            bind:value={bracket}
            class="mt-1 block w-full rounded border border-amber-900/50 bg-black/30 px-2 py-2 text-amber-100"
          >
            <option value="3v3">3v3</option>
            <option value="5v5">5v5</option>
          </select>
        </label>
        <div class="mt-3 space-y-2">
          {#each names as _, i (i)}
            <input
              bind:value={names[i]}
              maxlength="16"
              placeholder={`${ui.teammate} ${i + 1}`}
              class="block w-full rounded border border-amber-900/50 bg-black/30 px-3 py-2 text-sm text-amber-100 placeholder:text-amber-100/30"
            />
          {/each}
        </div>
        {#if social && social.friends.length > 0}
          <p class="mt-2 text-xs text-amber-100/40">
            {ui.friendsHint}
            {social.friends.map((f) => f.name).join(', ')}
          </p>
        {/if}
        <button
          onclick={submit}
          disabled={busy || names.filter((n) => n.trim()).length !== teamSize - 1}
          class="mt-3 rounded bg-red-700/70 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-red-600/70 disabled:opacity-40"
        >
          {ui.queue}
        </button>
      </section>
    {/if}
  {/if}
</main>
