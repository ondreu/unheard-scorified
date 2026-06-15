<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    claimAchievement,
    getAchievements,
    type AchievementsView,
  } from '$lib/api';

  const ui = {
    back: '← Back to character',
    title: 'Achievements',
    claim: 'Claim',
    claimed: 'Claimed',
    reward: 'g',
    progress: (v: number, t: number): string => `${Math.min(v, t)} / ${t}`,
  };

  let view = $state<AchievementsView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let busy = $state<string | null>(null);

  const characterId = $derived($page.params.id ?? '');

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      view = await getAchievements(characterId);
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

  async function claim(id: string, reward: number): Promise<void> {
    if (busy) return;
    busy = id;
    error = null;
    try {
      await claimAchievement(characterId, id);
      notice = `+${reward} gold!`;
      view = await getAchievements(characterId);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = null;
    }
  }
</script>

<main class="mx-auto max-w-lg px-6 py-12">
  <a href={`/characters/${characterId}`} class="text-sm text-amber-300 underline">{ui.back}</a>
  {#if view}
    <div class="mt-4 flex items-center justify-between">
      <h1 class="text-3xl font-bold text-amber-200">{ui.title}</h1>
      <span class="text-sm text-amber-100/60">{view.completedCount} / {view.total}</span>
    </div>
  {/if}

  {#if notice}<p class="mt-3 text-sm text-emerald-300">{notice}</p>{/if}
  {#if error}<p class="mt-3 text-sm text-red-400">{error}</p>{/if}

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if view}
    <ul class="mt-6 space-y-2">
      {#each view.achievements as a (a.id)}
        <li
          class="rounded border bg-black/20 p-4 {a.completed
            ? 'border-emerald-900/50'
            : 'border-amber-900/40'}"
        >
          <div class="flex items-center justify-between">
            <div>
              <span class="font-semibold {a.completed ? 'text-emerald-300' : 'text-amber-200'}"
                >{a.name}</span
              >
              <p class="text-xs text-amber-100/60">{a.description}</p>
            </div>
            <div class="text-right">
              {#if a.claimed}
                <span class="text-xs text-amber-100/40">{ui.claimed}</span>
              {:else if a.claimable}
                <button
                  onclick={() => claim(a.id, a.rewardGold)}
                  disabled={busy === a.id}
                  class="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-black hover:bg-emerald-500 disabled:opacity-40"
                >
                  {ui.claim} +{a.rewardGold}{ui.reward}
                </button>
              {:else}
                <span class="text-xs text-amber-300">+{a.rewardGold}{ui.reward}</span>
              {/if}
            </div>
          </div>
          <!-- progress bar -->
          <div class="mt-2 flex items-center gap-2">
            <div class="h-1.5 flex-1 overflow-hidden rounded bg-black/40">
              <div
                class="h-full {a.completed ? 'bg-emerald-500' : 'bg-amber-500'}"
                style={`width: ${a.pct * 100}%`}
              ></div>
            </div>
            <span class="text-xs text-amber-100/40">{ui.progress(a.value, a.threshold)}</span>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</main>
