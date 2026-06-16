<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    listAvailableQuests,
    startActivity,
    startQuesting,
    type QuestView,
  } from '$lib/api';
  import { ZONES } from '@game/shared';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Available Quests',
    empty: 'No story quests available right now. Level up to unlock more — or just go questing below.',
    send: 'Send',
    sending: 'Sending…',
    reward: 'Reward',
    duration: 'Duration',
    level: 'Lvl',
    questingTitle: 'Gone Questing',
    questingBlurb:
      'No fixed objective — just head out and quest for as long as you like. Rewards scale with the time you commit and your level.',
    go: 'Go questing',
  };

  // Preset délky pro Gone Questing (v mezích GRIND.minSec..maxSec na serveru).
  const QUESTING_PRESETS: { label: string; sec: number }[] = [
    { label: '30 min', sec: 1800 },
    { label: '1 hour', sec: 3600 },
    { label: '3 hours', sec: 10800 },
    { label: '6 hours', sec: 21600 },
  ];

  let quests = $state<QuestView[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let sendingId = $state<string | null>(null);
  let questingSec = $state(3600);
  let questingBusy = $state(false);

  const characterId = $derived($page.params.id ?? '');

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      quests = await listAvailableQuests(characterId);
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

  async function send(quest: QuestView): Promise<void> {
    sendingId = quest.id;
    error = null;
    try {
      await startActivity(characterId, quest.id);
      await goto(`/characters/${characterId}`);
    } catch (err) {
      error = (err as Error).message;
      sendingId = null;
    }
  }

  async function goQuesting(): Promise<void> {
    questingBusy = true;
    error = null;
    try {
      await startQuesting(characterId, questingSec);
      await goto(`/characters/${characterId}`);
    } catch (err) {
      error = (err as Error).message;
      questingBusy = false;
    }
  }

  function zoneName(zoneId: string): string {
    return ZONES[zoneId as keyof typeof ZONES]?.name ?? zoneId;
  }

  function formatDuration(sec: number): string {
    if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
    if (sec >= 60) return `${Math.floor(sec / 60)}m`;
    return `${sec}s`;
  }
</script>

<div class="space-y-6">
  <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{ui.title}</h1>

  {#if error}
    <p class="text-[var(--danger)]">{error}</p>
  {/if}

  <!-- Gone Questing: generická idle aktivita s volnou délkou (nahradila repeatables). -->
  <section class="panel panel-pad space-y-3">
    <h2 class="panel-title">{ui.questingTitle}</h2>
    <p class="text-sm text-[var(--text-dim)]">{ui.questingBlurb}</p>
    <div class="flex flex-wrap items-center gap-2">
      <label class="text-xs uppercase tracking-wide text-[var(--text-faint)]" for="questing-dur">
        {ui.duration}
      </label>
      <select
        id="questing-dur"
        bind:value={questingSec}
        disabled={questingBusy}
        class="input w-auto"
      >
        {#each QUESTING_PRESETS as p (p.sec)}
          <option value={p.sec}>{p.label}</option>
        {/each}
      </select>
      <button onclick={goQuesting} disabled={questingBusy} class="btn btn-primary btn-sm">
        {questingBusy ? ui.sending : ui.go}
      </button>
    </div>
  </section>

  {#if loading}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {:else if quests.length === 0}
    <p class="text-[var(--text-dim)]">{ui.empty}</p>
  {:else}
    <ul class="space-y-3">
      {#each quests as q (q.id)}
        <li class="panel panel-pad">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="panel-title">{q.name}</h2>
              <p class="text-xs uppercase tracking-wide text-[var(--text-faint)]">
                {zoneName(q.zoneId)} · {q.kind} · {ui.level}
                {q.requiredLevel}
              </p>
            </div>
            <button
              onclick={() => send(q)}
              disabled={sendingId !== null}
              class="btn btn-primary btn-sm shrink-0"
            >
              {sendingId === q.id ? ui.sending : ui.send}
            </button>
          </div>
          <p class="mt-2 text-sm text-[var(--text-dim)]">{q.description}</p>
          <p class="mt-2 text-xs text-[var(--text-faint)]">
            {ui.duration}: {formatDuration(q.durationSec)} · {ui.reward}: {q.baseXp} XP, ~{q.baseGold}
            gold
          </p>
        </li>
      {/each}
    </ul>
  {/if}
</div>
