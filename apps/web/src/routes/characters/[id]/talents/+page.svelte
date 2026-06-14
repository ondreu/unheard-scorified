<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { ApiError } from '$lib/api';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Talents',
    back: '← Back to character',
    available: 'Available Points',
    spent: 'Spent',
    total: 'Total',
    reset: 'Reset All Talents',
    resetting: 'Resetting…',
    maxRank: 'MAX',
    tierReq: 'Requires',
    pointsInTree: 'pts in tree',
    allocate: '+',
    allocating: '…',
  };

  interface TalentNodeView {
    id: string;
    name: string;
    description: string;
    tierRequirement: number;
    maxRanks: number;
    allocatedPoints: number;
    effect: {
      statPerRank?: Record<string, number>;
      healthPerRank?: number;
      combatTags?: string[];
    };
  }

  interface TalentTreeView {
    name: string;
    nodes: TalentNodeView[];
    pointsSpent: number;
  }

  interface TalentsView {
    trees: TalentTreeView[];
    totalPoints: number;
    spentPoints: number;
    availablePoints: number;
  }

  let talents = $state<TalentsView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let pendingTalentId = $state<string | null>(null);
  let resetting = $state(false);

  const characterId = $derived($page.params.id ?? '');

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      talents = await fetchTalents();
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

  function authHeaders(): Record<string, string> {
    try {
      const raw = localStorage.getItem('tokens');
      if (!raw) return {};
      const tokens = JSON.parse(raw) as { accessToken?: string };
      return tokens.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {};
    } catch {
      return {};
    }
  }

  async function fetchTalents(): Promise<TalentsView> {
    const res = await fetch(`/api/characters/${characterId}/talents`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<TalentsView>;
  }

  async function allocate(talentId: string): Promise<void> {
    pendingTalentId = talentId;
    error = null;
    try {
      const res = await fetch(`/api/characters/${characterId}/talents/${talentId}`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      talents = (await res.json()) as TalentsView;
    } catch (err) {
      error = (err as Error).message;
    } finally {
      pendingTalentId = null;
    }
  }

  async function resetAll(): Promise<void> {
    resetting = true;
    error = null;
    try {
      const res = await fetch(`/api/characters/${characterId}/talents`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      talents = (await res.json()) as TalentsView;
    } catch (err) {
      error = (err as Error).message;
    } finally {
      resetting = false;
    }
  }

  function canAllocate(node: TalentNodeView, tree: TalentTreeView, availablePoints: number): boolean {
    if (availablePoints <= 0) return false;
    if (node.allocatedPoints >= node.maxRanks) return false;
    if (tree.pointsSpent < node.tierRequirement) return false;
    return true;
  }

  function effectLabel(node: TalentNodeView): string {
    const parts: string[] = [];
    if (node.effect.statPerRank) {
      for (const [stat, val] of Object.entries(node.effect.statPerRank)) {
        parts.push(`+${val} ${stat.charAt(0).toUpperCase() + stat.slice(1)} per rank`);
      }
    }
    if (node.effect.healthPerRank) {
      parts.push(`+${node.effect.healthPerRank} Health per rank`);
    }
    if (node.effect.combatTags?.length) {
      parts.push(`Tags: ${node.effect.combatTags.join(', ')}`);
    }
    return parts.join(' · ') || '—';
  }

  const TREE_COLORS = ['text-amber-300', 'text-blue-300', 'text-emerald-300'];
  const TREE_BORDER = ['border-amber-700/40', 'border-blue-700/40', 'border-emerald-700/40'];
</script>

<main class="mx-auto max-w-5xl px-6 py-12">
  <a href={`/characters/${characterId}`} class="text-sm text-amber-300 underline">{ui.back}</a>
  <h1 class="mt-4 text-3xl font-bold text-amber-200">{ui.title}</h1>

  {#if error}
    <p class="mt-4 text-red-400">{error}</p>
  {/if}

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if talents}
    {@const t = talents}
    <!-- Header: points summary -->
    <div class="mt-4 flex flex-wrap items-center gap-4">
      <div class="rounded border border-amber-700/40 bg-black/20 px-4 py-2 text-sm">
        <span class="text-amber-100/60">{ui.available}: </span>
        <span class="font-bold text-amber-300">{t.availablePoints}</span>
        <span class="ml-2 text-amber-100/40">({ui.spent}: {t.spentPoints} / {ui.total}: {t.totalPoints})</span>
      </div>
      {#if t.spentPoints > 0}
        <button
          onclick={resetAll}
          disabled={resetting}
          class="rounded border border-red-800/60 px-3 py-2 text-sm text-red-400 hover:border-red-600 disabled:opacity-40"
        >
          {resetting ? ui.resetting : ui.reset}
        </button>
      {/if}
    </div>

    <!-- Talent Trees -->
    <div class="mt-6 grid gap-6 md:grid-cols-3">
      {#each t.trees as tree, treeIdx (tree.name)}
        <section class="rounded-lg border {TREE_BORDER[treeIdx]} bg-black/20 p-4">
          <h2 class="mb-1 text-lg font-bold {TREE_COLORS[treeIdx]}">{tree.name}</h2>
          <p class="mb-4 text-xs text-amber-100/40">{tree.pointsSpent} pts spent</p>

          <div class="space-y-3">
            {#each tree.nodes as node (node.id)}
              {@const locked = tree.pointsSpent < node.tierRequirement}
              {@const maxed = node.allocatedPoints >= node.maxRanks}
              {@const canAlloc = canAllocate(node, tree, t.availablePoints)}

              <div
                class="rounded border p-3 transition-colors
                  {locked ? 'border-gray-800/40 opacity-50' : maxed ? 'border-amber-700/60' : 'border-amber-900/40'}
                  bg-black/10"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold {locked ? 'text-gray-500' : maxed ? 'text-amber-300' : 'text-amber-100'}">
                      {node.name}
                      {#if maxed}<span class="ml-1 text-xs text-amber-500">[{ui.maxRank}]</span>{/if}
                    </p>
                    <p class="mt-0.5 text-xs text-amber-100/50">
                      Rank {node.allocatedPoints} / {node.maxRanks}
                    </p>
                  </div>
                  <button
                    onclick={() => allocate(node.id)}
                    disabled={!canAlloc || pendingTalentId !== null}
                    class="shrink-0 rounded px-2 py-1 text-sm font-bold transition-colors
                      {canAlloc && pendingTalentId === null
                        ? 'bg-amber-600 text-black hover:bg-amber-500'
                        : 'bg-gray-800 text-gray-600 cursor-not-allowed'}"
                  >
                    {pendingTalentId === node.id ? ui.allocating : ui.allocate}
                  </button>
                </div>
                <p class="mt-1 text-xs text-amber-100/60">{node.description}</p>
                <p class="mt-1 text-xs text-amber-100/30">{effectLabel(node)}</p>
                {#if node.tierRequirement > 0}
                  <p class="mt-1 text-xs text-amber-100/30">
                    {ui.tierReq} {node.tierRequirement} {ui.pointsInTree}
                  </p>
                {/if}
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
</main>
