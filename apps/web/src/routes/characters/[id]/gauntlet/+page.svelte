<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    enterGauntlet,
    getGauntletStatus,
    recentGauntletRuns,
    type GauntletRunSummary,
    type GauntletStatusView,
  } from '$lib/api';
  import { ITEMS } from '@game/shared';
  import SceneBanner from '$lib/components/SceneBanner.svelte';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'The Gauntlet',
    subtitle: 'Active survival arena — fight waves, draft rewards, see how far you get',
    intro:
      'Enter with your character as they are. Each turn you choose which ability to use. Clear a wave and pick one of three rewards — a buff, a piece of gear, or a new spell — that lasts for this run only. The run ends when you fall.',
    enter: 'Enter the Gauntlet',
    entering: 'Entering…',
    resume: 'Resume run →',
    best: 'Best run',
    waves: 'waves',
    daily: 'Daily rewards',
    xp: 'XP',
    gold: 'Gold',
    recent: 'Recent runs',
    none: 'No runs yet — be the first to step in.',
    capHint: 'Rewards are capped per day so the arena stays a fun extra, not a grind.',
  };

  let status = $state<GauntletStatusView | null>(null);
  let runs = $state<GauntletRunSummary[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let entering = $state(false);

  const characterId = $derived($page.params.id ?? '');

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      [status, runs] = await Promise.all([
        getGauntletStatus(characterId),
        recentGauntletRuns(characterId),
      ]);
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

  async function enter(): Promise<void> {
    entering = true;
    error = null;
    try {
      const run = await enterGauntlet(characterId);
      await goto(`/characters/${characterId}/gauntlet/run/${run.runId}`);
    } catch (err) {
      error = (err as Error).message;
      entering = false;
    }
  }

  function itemName(id: string): string {
    return ITEMS[id as keyof typeof ITEMS]?.name ?? id;
  }

  function pct(a: number, b: number): number {
    return b <= 0 ? 0 : Math.min(100, Math.round((a / b) * 100));
  }
</script>

<div class="space-y-6">
  <SceneBanner sceneId="arena" title={ui.title} subtitle={ui.subtitle} />

  {#if loading}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {:else if error && !status}
    <p class="text-[var(--danger)]">{error}</p>
  {:else if status}
    {@const s = status}
    <section class="panel panel-pad space-y-3">
      <p class="text-sm text-[var(--text-dim)]">{ui.intro}</p>
      {#if error}<p class="text-sm text-[var(--danger)]">{error}</p>{/if}
      {#if s.activeRunId}
        <a href={`/characters/${characterId}/gauntlet/run/${s.activeRunId}`} class="btn btn-primary w-full">
          {ui.resume}
        </a>
      {:else}
        <button class="btn btn-primary w-full" disabled={entering} onclick={enter}>
          {entering ? ui.entering : `🔥 ${ui.enter}`}
        </button>
      {/if}
    </section>

    <div class="grid gap-3 sm:grid-cols-2">
      <section class="panel panel-pad">
        <h2 class="panel-title">{ui.best}</h2>
        <p class="mt-1 text-2xl font-bold text-[var(--gold-bright)]">
          {s.bestWave} <span class="text-base font-normal text-[var(--text-dim)]">{ui.waves}</span>
        </p>
      </section>

      <section class="panel panel-pad">
        <h2 class="panel-title">{ui.daily}</h2>
        <div class="mt-2 space-y-2 text-sm">
          <div>
            <div class="flex justify-between">
              <span class="text-[var(--text-dim)]">{ui.xp}</span>
              <span>{s.daily.xpEarned} / {s.daily.xpCap}</span>
            </div>
            <div class="bar mt-1"><div class="bar-fill" style={`width:${pct(s.daily.xpEarned, s.daily.xpCap)}%`}></div></div>
          </div>
          <div>
            <div class="flex justify-between">
              <span class="text-[var(--text-dim)]">{ui.gold}</span>
              <span>{s.daily.goldEarned} / {s.daily.goldCap}</span>
            </div>
            <div class="bar mt-1"><div class="bar-fill" style={`width:${pct(s.daily.goldEarned, s.daily.goldCap)}%`}></div></div>
          </div>
        </div>
        <p class="mt-2 text-xs text-[var(--text-dim)]">{ui.capHint}</p>
      </section>
    </div>

    <section class="panel panel-pad">
      <h2 class="panel-title mb-2">{ui.recent}</h2>
      {#if runs.length === 0}
        <p class="text-sm text-[var(--text-dim)]">{ui.none}</p>
      {:else}
        <div class="space-y-1 text-sm">
          {#each runs as r (r.runId)}
            <div class="flex items-center justify-between rounded-lg bg-black/20 px-3 py-1.5">
              <span>
                <span class="font-semibold text-[var(--gold)]">{r.wavesCleared}</span>
                <span class="text-[var(--text-dim)]"> {ui.waves}</span>
                <span class="ml-2 text-xs text-[var(--text-dim)]">{r.status === 'dead' ? '💀' : '🏳️'}</span>
              </span>
              <span class="text-xs text-[var(--text-dim)]">
                +{r.reward.xp} XP · +{r.reward.gold}g{r.reward.items.length
                  ? ` · ${r.reward.items.map(itemName).join(', ')}`
                  : ''}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>
