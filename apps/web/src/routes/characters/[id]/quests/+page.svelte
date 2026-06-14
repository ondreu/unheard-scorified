<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { ApiError, listAvailableQuests, startActivity, type QuestView } from '$lib/api';
  import { ZONES } from '@game/shared';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Available Quests',
    back: '← Back to character',
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

<main class="mx-auto max-w-lg px-6 py-12">
  <a href={`/characters/${characterId}`} class="text-sm text-amber-300 underline">{ui.back}</a>
  <h1 class="mt-4 text-3xl font-bold text-amber-200">{ui.title}</h1>

  {#if error}
    <p class="mt-4 text-red-400">{error}</p>
  {/if}

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if quests.length === 0}
    <p class="mt-6 text-amber-100/60">{ui.empty}</p>
  {:else}
    <ul class="mt-6 space-y-4">
      {#each quests as q (q.id)}
        <li class="rounded-lg border border-amber-900/40 bg-black/20 p-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="font-semibold text-amber-200">{q.name}</h2>
              <p class="text-xs uppercase tracking-wide text-amber-100/40">
                {zoneName(q.zoneId)} · {q.kind} · {ui.level}
                {q.requiredLevel}
              </p>
            </div>
            <button
              onclick={() => send(q)}
              disabled={sendingId !== null}
              class="shrink-0 rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-500 disabled:opacity-50"
            >
              {sendingId === q.id ? ui.sending : ui.send}
            </button>
          </div>
          <p class="mt-2 text-sm text-amber-100/70">{q.description}</p>
          <p class="mt-2 text-xs text-amber-100/60">
            {ui.duration}: {formatDuration(q.durationSec)} · {ui.reward}: {q.baseXp} XP, ~{q.baseGold}
            gold
          </p>
        </li>
      {/each}
    </ul>
  {/if}
</main>
