<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    claimAchievement,
    claimGoal,
    getAchievements,
    getGoals,
    type AchievementsView,
    type GoalsView,
    type GoalView,
  } from '$lib/api';

  const ui = {
    title: 'Achievements',
    goalsDaily: 'Daily goals',
    goalsWeekly: 'Weekly goals',
    claim: 'Claim',
    claimed: 'Claimed',
    reward: 'g',
    progress: (v: number, t: number): string => `${Math.min(v, t)} / ${t}`,
  };

  let view = $state<AchievementsView | null>(null);
  let goals = $state<GoalsView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let busy = $state<string | null>(null);

  const characterId = $derived($page.params.id ?? '');

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      [view, goals] = await Promise.all([getAchievements(characterId), getGoals(characterId)]);
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
    [view, goals] = await Promise.all([getAchievements(characterId), getGoals(characterId)]);
  }

  async function claim(id: string, reward: number): Promise<void> {
    if (busy) return;
    busy = id;
    error = null;
    try {
      await claimAchievement(characterId, id);
      notice = `+${reward} gold!`;
      await refresh();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = null;
    }
  }

  async function claimG(id: string, reward: number): Promise<void> {
    if (busy) return;
    busy = id;
    error = null;
    try {
      await claimGoal(characterId, id);
      notice = `+${reward} gold!`;
      await refresh();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = null;
    }
  }
</script>

{#snippet goalRow(g: GoalView)}
  <li class="rounded-lg border border-[var(--border)] p-3">
    <div class="flex items-center justify-between">
      <span class="text-sm" style={g.completed ? 'color:var(--success)' : 'color:var(--text)'}>{g.name}</span>
      {#if g.claimed}
        <span class="text-xs text-[var(--text-faint)]">{ui.claimed}</span>
      {:else if g.claimable}
        <button
          onclick={() => claimG(g.id, g.rewardGold)}
          disabled={busy === g.id}
          class="btn btn-primary btn-sm"
        >
          {ui.claim} +{g.rewardGold}{ui.reward}
        </button>
      {:else}
        <span class="text-xs text-[var(--gold-bright)]">+{g.rewardGold}{ui.reward}</span>
      {/if}
    </div>
    <p class="text-xs text-[var(--text-dim)]">{g.description}</p>
    <div class="mt-1.5 flex items-center gap-2">
      <div class="bar">
        <div class="bar-fill" style={`width: ${g.pct * 100}%`}></div>
      </div>
      <span class="text-xs text-[var(--text-faint)]">{ui.progress(g.value, g.target)}</span>
    </div>
  </li>
{/snippet}

<div class="space-y-6">
  {#if view}
    <div class="flex items-center justify-between">
      <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{ui.title}</h1>
      <span class="text-sm text-[var(--text-dim)]">{view.completedCount} / {view.total}</span>
    </div>
  {:else}
    <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{ui.title}</h1>
  {/if}

  {#if notice}<p class="text-sm text-[var(--success)]">{notice}</p>{/if}
  {#if error}<p class="text-sm text-[var(--danger)]">{error}</p>{/if}

  {#if loading}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {:else if view}
    {#if goals}
      <section class="panel panel-pad">
        <h2 class="panel-title">{ui.goalsDaily}</h2>
        <ul class="mt-2 space-y-2">
          {#each goals.daily as g (g.id)}{@render goalRow(g)}{/each}
        </ul>
        <h2 class="panel-title mt-4">{ui.goalsWeekly}</h2>
        <ul class="mt-2 space-y-2">
          {#each goals.weekly as g (g.id)}{@render goalRow(g)}{/each}
        </ul>
      </section>
    {/if}
    <section class="panel panel-pad">
      <h2 class="panel-title">{ui.title}</h2>
      <ul class="mt-3 space-y-2">
        {#each view.achievements as a (a.id)}
          <li class="rounded-lg border border-[var(--border)] p-4">
            <div class="flex items-center justify-between">
              <div>
                <span class="font-semibold" style={a.completed ? 'color:var(--success)' : 'color:var(--text)'}
                  >{a.name}</span
                >
                <p class="text-xs text-[var(--text-dim)]">{a.description}</p>
              </div>
              <div class="text-right">
                {#if a.claimed}
                  <span class="text-xs text-[var(--text-faint)]">{ui.claimed}</span>
                {:else if a.claimable}
                  <button
                    onclick={() => claim(a.id, a.rewardGold)}
                    disabled={busy === a.id}
                    class="btn btn-primary btn-sm"
                  >
                    {ui.claim} +{a.rewardGold}{ui.reward}
                  </button>
                {:else}
                  <span class="text-xs text-[var(--gold-bright)]">+{a.rewardGold}{ui.reward}</span>
                {/if}
              </div>
            </div>
            <!-- progress bar -->
            <div class="mt-2 flex items-center gap-2">
              <div class="bar">
                <div class="bar-fill" style={`width: ${a.pct * 100}%`}></div>
              </div>
              <span class="text-xs text-[var(--text-faint)]">{ui.progress(a.value, a.threshold)}</span>
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>
