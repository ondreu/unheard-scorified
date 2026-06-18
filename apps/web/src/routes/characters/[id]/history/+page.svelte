<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { ApiError, getHistory, type HistoryEntry } from '$lib/api';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Activity History',
    sub: 'Results of your completed quests, dungeons and arena matches.',
    empty: 'No activity yet. Go earn some glory!',
    loading: 'Loading…',
  };

  // Per-kind ikona + barva pro vizuální odlišení feedu.
  const KIND_META: Record<string, { icon: string; color: string; label: string }> = {
    quest: { icon: '📜', color: 'var(--gold)', label: 'Quest' },
    grind: { icon: '📜', color: 'var(--gold)', label: 'Quest' },
    gather: { icon: '⚒️', color: '#c79c6e', label: 'Gathering' },
    craft: { icon: '⚒️', color: '#c79c6e', label: 'Crafting' },
    dungeon: { icon: '🗝️', color: '#9b7bd4', label: 'Dungeon' },
    raid: { icon: '🐉', color: 'var(--horde)', label: 'Raid' },
    arena: { icon: '⚔️', color: '#e0925a', label: 'Arena' },
  };

  function meta(kind: string): { icon: string; color: string; label: string } {
    return KIND_META[kind] ?? { icon: '•', color: 'var(--text-dim)', label: kind };
  }

  function outcomeColor(outcome: string | null): string {
    if (outcome === 'win' || outcome === 'victory') return 'var(--success)';
    if (outcome === 'loss' || outcome === 'defeat') return 'var(--danger)';
    return 'var(--text-dim)';
  }

  function ago(iso: string): string {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  let entries = $state<HistoryEntry[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const characterId = $derived($page.params.id ?? '');

  onMount(async () => {
    try {
      entries = await getHistory(characterId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await goto('/login');
        return;
      }
      error = (err as Error).message;
    } finally {
      loading = false;
    }
  });
</script>

<div class="space-y-4">
  <div>
    <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{ui.title}</h1>
    <p class="mt-1 text-sm text-[var(--text-dim)]">{ui.sub}</p>
  </div>

  {#if error}
    <p class="text-[var(--danger)]">{error}</p>
  {:else if loading}
    <p class="text-[var(--text-dim)]">{ui.loading}</p>
  {:else if entries.length === 0}
    <p class="text-[var(--text-faint)]">{ui.empty}</p>
  {:else}
    <ul class="space-y-2">
      {#each entries as e (e.id)}
        {@const m = meta(e.kind)}
        <li class="panel flex items-start gap-3 px-4 py-3">
          <span class="mt-0.5 text-lg" aria-hidden="true">{m.icon}</span>
          <div class="min-w-0 flex-1">
            <p class="font-medium" style={`color:${outcomeColor(e.outcome)}`}>{e.title}</p>
            {#if e.detail}<p class="text-sm text-[var(--text-dim)]">{e.detail}</p>{/if}
          </div>
          <span class="shrink-0 text-right text-xs text-[var(--text-faint)]">
            <span class="block" style={`color:${m.color}`}>{m.label}</span>
            {ago(e.createdAt)}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
