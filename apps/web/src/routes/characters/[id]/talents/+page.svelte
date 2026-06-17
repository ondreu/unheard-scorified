<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { SIGNATURE_ABILITIES, type AbilityKind } from '@game/shared';
  import { ApiError } from '$lib/api';
  import { currentTokens } from '$lib/auth';
  import PixelAbilityIcon from '$lib/components/PixelAbilityIcon.svelte';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Talents',
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
    const token = currentTokens()?.accessToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
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

  function canAllocate(
    node: TalentNodeView,
    tree: TalentTreeView,
    availablePoints: number,
  ): boolean {
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

  const TREE_COLORS = ['var(--gold-bright)', 'var(--info)', 'var(--success)'];

  /** Capstone uzel odemyká signature ability → vrať její název+druh pro ikonu. */
  function capstoneAbility(node: TalentNodeView): { name: string; kind: AbilityKind } | null {
    for (const tag of node.effect.combatTags ?? []) {
      const spec = SIGNATURE_ABILITIES[tag];
      if (spec) return { name: spec.name, kind: spec.kind };
    }
    return null;
  }
</script>

<div class="space-y-6">
  <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{ui.title}</h1>

  {#if error}
    <p class="text-[var(--danger)]">{error}</p>
  {/if}

  {#if loading}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {:else if talents}
    {@const t = talents}
    <!-- Header: points summary -->
    <div class="flex flex-wrap items-center gap-4">
      <div class="panel px-4 py-2 text-sm">
        <span class="text-[var(--text-dim)]">{ui.available}: </span>
        <span class="font-bold text-[var(--gold-bright)]">{t.availablePoints}</span>
        <span class="ml-2 text-[var(--text-faint)]"
          >({ui.spent}: {t.spentPoints} / {ui.total}: {t.totalPoints})</span
        >
      </div>
      {#if t.spentPoints > 0}
        <button onclick={resetAll} disabled={resetting} class="btn btn-danger btn-sm">
          {resetting ? ui.resetting : ui.reset}
        </button>
      {/if}
    </div>

    <!-- Talent Trees -->
    <div class="grid gap-6 md:grid-cols-3">
      {#each t.trees as tree, treeIdx (tree.name)}
        <section class="panel panel-pad">
          <h2 class="panel-title" style={`color:${TREE_COLORS[treeIdx] ?? 'var(--gold-bright)'}`}>
            {tree.name}
          </h2>
          <p class="mb-4 text-xs text-[var(--text-faint)]">{tree.pointsSpent} pts spent</p>

          <div class="space-y-3">
            {#each tree.nodes as node (node.id)}
              {@const locked = tree.pointsSpent < node.tierRequirement}
              {@const maxed = node.allocatedPoints >= node.maxRanks}
              {@const canAlloc = canAllocate(node, tree, t.availablePoints)}
              {@const capstone = capstoneAbility(node)}

              <div
                class="rounded-lg border bg-[var(--surface-2)] p-3 transition-colors
                  {locked
                  ? 'border-[var(--border)] opacity-50'
                  : maxed
                    ? 'border-[var(--border-strong)]'
                    : 'border-[var(--border)]'}"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="flex min-w-0 items-start gap-2">
                    {#if capstone}
                      <PixelAbilityIcon
                        name={capstone.name}
                        kind={capstone.kind}
                        size={24}
                        dim={16}
                      />
                    {/if}
                    <div class="min-w-0">
                      <p
                        class="text-sm font-semibold {locked
                          ? 'text-[var(--text-faint)]'
                          : maxed
                            ? 'text-[var(--gold-bright)]'
                            : 'text-[var(--text)]'}"
                      >
                        {node.name}
                        {#if maxed}<span class="ml-1 text-xs text-[var(--gold)]"
                            >[{ui.maxRank}]</span
                          >{/if}
                      </p>
                      <p class="mt-0.5 text-xs text-[var(--text-dim)]">
                        Rank {node.allocatedPoints} / {node.maxRanks}
                      </p>
                    </div>
                  </div>
                  <button
                    onclick={() => allocate(node.id)}
                    disabled={!canAlloc || pendingTalentId !== null}
                    class="btn btn-sm shrink-0 {canAlloc && pendingTalentId === null
                      ? 'btn-primary'
                      : ''}"
                  >
                    {pendingTalentId === node.id ? ui.allocating : ui.allocate}
                  </button>
                </div>
                <p class="mt-1 text-xs text-[var(--text-dim)]">{node.description}</p>
                <p class="mt-1 text-xs text-[var(--text-faint)]">{effectLabel(node)}</p>
                {#if node.tierRequirement > 0}
                  <p class="mt-1 text-xs text-[var(--text-faint)]">
                    {ui.tierReq}
                    {node.tierRequirement}
                    {ui.pointsInTree}
                  </p>
                {/if}
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>
