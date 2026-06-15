<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    getProfessions,
    startCraft,
    startGather,
    type GatheringNodeView,
    type ProfessionPanel,
    type RecipeView,
  } from '$lib/api';
  import { RARITY_COLOR } from '$lib/cosmetics';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Professions',
    gathering: 'Gathering',
    crafting: 'Crafting',
    reputation: 'Reputation',
    materials: 'Materials & Goods',
    noMaterials: 'No materials gathered yet.',
    gather: 'Gather',
    craft: 'Craft',
    starting: 'Starting…',
    locked: 'Locked',
    reqSkill: 'Requires skill',
    skill: 'Skill',
    needs: 'Needs',
    makes: 'Makes',
    repGate: 'Requires',
  };

  let panel = $state<ProfessionPanel | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let startingId = $state<string | null>(null);

  const characterId = $derived($page.params.id ?? '');
  const gatheringSkills = $derived((panel?.skills ?? []).filter((s) => s.kind === 'gathering'));
  const craftingSkills = $derived((panel?.skills ?? []).filter((s) => s.kind === 'crafting'));

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      panel = await getProfessions(characterId);
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

  function pct(value: number, min: number, max: number | null): number {
    if (max === null) return 100;
    if (max <= min) return 100;
    return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  }

  function fmtDuration(sec: number): string {
    if (sec < 60) return `${sec}s`;
    const m = Math.round(sec / 60);
    if (m < 60) return `${m}m`;
    return `${Math.round(m / 60)}h`;
  }

  async function gather(node: GatheringNodeView): Promise<void> {
    startingId = node.id;
    error = null;
    try {
      await startGather(characterId, node.id);
      await goto(`/characters/${characterId}`);
    } catch (err) {
      error = (err as Error).message;
      startingId = null;
    }
  }

  async function craft(recipe: RecipeView): Promise<void> {
    startingId = recipe.id;
    error = null;
    try {
      await startCraft(characterId, recipe.id);
      await goto(`/characters/${characterId}`);
    } catch (err) {
      error = (err as Error).message;
      startingId = null;
    }
  }
</script>

<div class="space-y-6">
  <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{ui.title}</h1>

  {#if error}
    <p class="text-[var(--danger)]">{error}</p>
  {/if}

  {#if loading}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {:else if panel}
    <!-- Skills -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {#each panel.skills as s (s.id)}
        <div class="panel panel-pad">
          <div class="flex items-baseline justify-between">
            <h2 class="panel-title">{s.name}</h2>
            <span class="text-xs uppercase tracking-wide text-[var(--text-faint)]">{s.kind}</span>
          </div>
          <div class="bar mt-2">
            <div class="bar-fill" style={`width:${pct(s.skill, 0, s.maxSkill)}%`}></div>
          </div>
          <p class="mt-1 text-xs text-[var(--text-dim)]">{ui.skill} {s.skill} / {s.maxSkill}</p>
        </div>
      {/each}
    </div>

    <!-- Reputation -->
    <section class="panel panel-pad">
      <h2 class="panel-title">{ui.reputation}</h2>
      <ul class="mt-3 space-y-3">
        {#each panel.reputation as r (r.factionId)}
          <li>
            <div class="flex items-baseline justify-between">
              <span class="font-medium text-[var(--text)]">{r.name}</span>
              <span class="text-sm text-[var(--gold-bright)]">{r.tierName}</span>
            </div>
            <div class="bar mt-2">
              <div class="bar-fill" style={`width:${pct(r.standing, r.currentMin, r.nextMin)}%`}></div>
            </div>
            <p class="mt-1 text-xs text-[var(--text-faint)]">
              {r.standing}{r.nextMin !== null ? ` / ${r.nextMin}` : ' (max)'}
            </p>
          </li>
        {/each}
      </ul>
    </section>

    <!-- Materials -->
    <section class="panel panel-pad">
      <h2 class="panel-title">{ui.materials}</h2>
      {#if panel.materials.length === 0}
        <p class="mt-2 text-sm text-[var(--text-dim)]">{ui.noMaterials}</p>
      {:else}
        <ul class="mt-3 flex flex-wrap gap-2">
          {#each panel.materials as m (m.itemId)}
            <li class="chip">
              <span style={`color:${RARITY_COLOR[m.rarity] ?? 'var(--r-common)'}`}>{m.name}</span>
              <span class="text-[var(--text-faint)]">×{m.quantity}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <!-- Gathering -->
    <section class="panel panel-pad">
      <h2 class="panel-title">{ui.gathering}</h2>
      <ul class="mt-3 space-y-3">
        {#each panel.gathering as n (n.id)}
          <li class="rounded-lg border border-[var(--border)] p-4 {n.unlocked ? '' : 'opacity-60'}">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h3 class="font-semibold text-[var(--gold-bright)]">{n.name}</h3>
                <p class="text-xs uppercase tracking-wide text-[var(--text-faint)]">
                  {ui.reqSkill} {n.requiredSkill} · {fmtDuration(n.durationSec)} · +{n.baseXp} XP · +{n.repReward} rep
                </p>
                <p class="mt-1 text-sm text-[var(--text-dim)]">{n.description}</p>
              </div>
              {#if n.unlocked}
                <button
                  onclick={() => gather(n)}
                  disabled={startingId !== null}
                  class="btn btn-primary btn-sm shrink-0"
                >
                  {startingId === n.id ? ui.starting : ui.gather}
                </button>
              {:else}
                <span class="chip shrink-0">
                  {ui.locked} · {ui.reqSkill} {n.requiredSkill}
                </span>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </section>

    <!-- Crafting -->
    <section class="panel panel-pad">
      <h2 class="panel-title">{ui.crafting}</h2>
      <ul class="mt-3 space-y-3">
        {#each panel.recipes as r (r.id)}
          <li class="rounded-lg border border-[var(--border)] p-4 {r.unlocked ? '' : 'opacity-60'}">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h3 class="font-semibold text-[var(--gold-bright)]">{r.name}</h3>
                <p class="text-xs uppercase tracking-wide text-[var(--text-faint)]">
                  {ui.reqSkill} {r.requiredSkill} · {fmtDuration(r.durationSec)} · +{r.baseXp} XP
                </p>
                <p class="mt-1 text-sm text-[var(--text-dim)]">{r.description}</p>
                <p class="mt-2 text-xs text-[var(--text-dim)]">
                  {ui.needs}:
                  {#each r.inputs as i (i.materialId)}
                    <span style={`color:${i.have >= i.quantity ? 'var(--success)' : 'var(--danger)'}`}>
                      {i.name} {i.have}/{i.quantity}
                    </span>{' '}
                  {/each}
                </p>
                <p class="text-xs text-[var(--text-dim)]">{ui.makes}: {r.output.name} ×{r.output.quantity}</p>
                {#if r.requiredReputation}
                  <p class="text-xs" style={`color:${r.requiredReputation.met ? 'var(--success)' : 'var(--danger)'}`}>
                    {ui.repGate} {r.requiredReputation.tierName} · {r.requiredReputation.factionName}
                  </p>
                {/if}
              </div>
              {#if r.unlocked}
                <button
                  onclick={() => craft(r)}
                  disabled={startingId !== null || !r.craftable}
                  class="btn btn-primary btn-sm shrink-0"
                  title={r.craftable ? '' : 'Missing materials'}
                >
                  {startingId === r.id ? ui.starting : ui.craft}
                </button>
              {:else}
                <span class="chip shrink-0">
                  {ui.locked}
                </span>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>
