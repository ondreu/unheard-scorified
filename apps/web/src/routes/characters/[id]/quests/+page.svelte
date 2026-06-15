<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { ApiError, listAvailableQuests, startActivity, type QuestView } from '$lib/api';
  import { ZONES } from '@game/shared';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Available Quests',
    empty: 'No quests available right now. Level up to unlock more.',
    send: 'Send',
    sending: 'Sending…',
    reward: 'Reward',
    duration: 'Duration',
    level: 'Lvl',
  };

  let quests = $state<QuestView[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let sendingId = $state<string | null>(null);

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
