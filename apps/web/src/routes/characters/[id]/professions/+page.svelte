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

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Professions',
    back: '← Back to character',
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

  const RARITY: Record<string, string> = {
    common: 'text-gray-300',
    uncommon: 'text-green-400',
    rare: 'text-blue-400',
    epic: 'text-purple-400',
    legendary: 'text-orange-400',
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

<main class="mx-auto max-w-2xl px-6 py-12">
  <a href={`/characters/${characterId}`} class="text-sm text-amber-300 underline">{ui.back}</a>
  <h1 class="mt-4 text-3xl font-bold text-amber-200">{ui.title}</h1>

  {#if error}
    <p class="mt-4 text-red-400">{error}</p>
  {/if}

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if panel}
    <!-- Skills -->
    <div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {#each panel.skills as s (s.id)}
        <div class="rounded-lg border border-amber-900/40 bg-black/20 p-4">
          <div class="flex items-baseline justify-between">
            <h2 class="font-semibold text-amber-200">{s.name}</h2>
            <span class="text-xs uppercase tracking-wide text-amber-100/40">{s.kind}</span>
          </div>
          <div class="mt-2 h-2 w-full overflow-hidden rounded bg-stone-800">
            <div class="h-full bg-amber-600" style={`width:${pct(s.skill, 0, s.maxSkill)}%`}></div>
          </div>
          <p class="mt-1 text-xs text-amber-100/60">{ui.skill} {s.skill} / {s.maxSkill}</p>
        </div>
      {/each}
    </div>

    <!-- Reputation -->
    <h2 class="mt-8 text-xl font-bold text-amber-200">{ui.reputation}</h2>
    <ul class="mt-3 space-y-3">
      {#each panel.reputation as r (r.factionId)}
        <li class="rounded-lg border border-amber-900/40 bg-black/20 p-4">
          <div class="flex items-baseline justify-between">
            <span class="font-medium text-amber-100">{r.name}</span>
            <span class="text-sm text-amber-300">{r.tierName}</span>
          </div>
          <div class="mt-2 h-2 w-full overflow-hidden rounded bg-stone-800">
            <div class="h-full bg-emerald-600" style={`width:${pct(r.standing, r.currentMin, r.nextMin)}%`}></div>
          </div>
          <p class="mt-1 text-xs text-amber-100/50">
            {r.standing}{r.nextMin !== null ? ` / ${r.nextMin}` : ' (max)'}
          </p>
        </li>
      {/each}
    </ul>

    <!-- Materials -->
    <h2 class="mt-8 text-xl font-bold text-amber-200">{ui.materials}</h2>
    {#if panel.materials.length === 0}
      <p class="mt-2 text-sm text-amber-100/60">{ui.noMaterials}</p>
    {:else}
      <ul class="mt-3 flex flex-wrap gap-2">
        {#each panel.materials as m (m.itemId)}
          <li class="rounded border border-stone-700 bg-black/20 px-3 py-1.5 text-sm">
            <span class={RARITY[m.rarity] ?? 'text-gray-300'}>{m.name}</span>
            <span class="text-amber-100/60">×{m.quantity}</span>
          </li>
        {/each}
      </ul>
    {/if}

    <!-- Gathering -->
    <h2 class="mt-8 text-xl font-bold text-amber-200">{ui.gathering}</h2>
    <ul class="mt-3 space-y-3">
      {#each panel.gathering as n (n.id)}
        <li
          class="rounded-lg border p-4 {n.unlocked
            ? 'border-amber-900/40 bg-black/20'
            : 'border-stone-800/60 bg-black/10 opacity-60'}"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="font-semibold text-amber-200">{n.name}</h3>
              <p class="text-xs uppercase tracking-wide text-amber-100/40">
                {ui.reqSkill} {n.requiredSkill} · {fmtDuration(n.durationSec)} · +{n.baseXp} XP · +{n.repReward} rep
              </p>
              <p class="mt-1 text-sm text-amber-100/70">{n.description}</p>
            </div>
            {#if n.unlocked}
              <button
                onclick={() => gather(n)}
                disabled={startingId !== null}
                class="shrink-0 rounded bg-amber-700 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-amber-600 disabled:opacity-50"
              >
                {startingId === n.id ? ui.starting : ui.gather}
              </button>
            {:else}
              <span class="shrink-0 rounded border border-stone-700 px-3 py-1.5 text-xs text-stone-400">
                {ui.locked} · {ui.reqSkill} {n.requiredSkill}
              </span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>

    <!-- Crafting -->
    <h2 class="mt-8 text-xl font-bold text-amber-200">{ui.crafting}</h2>
    <ul class="mt-3 space-y-3">
      {#each panel.recipes as r (r.id)}
        <li
          class="rounded-lg border p-4 {r.unlocked
            ? 'border-amber-900/40 bg-black/20'
            : 'border-stone-800/60 bg-black/10 opacity-60'}"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="font-semibold text-amber-200">{r.name}</h3>
              <p class="text-xs uppercase tracking-wide text-amber-100/40">
                {ui.reqSkill} {r.requiredSkill} · {fmtDuration(r.durationSec)} · +{r.baseXp} XP
              </p>
              <p class="mt-1 text-sm text-amber-100/70">{r.description}</p>
              <p class="mt-2 text-xs text-amber-100/60">
                {ui.needs}:
                {#each r.inputs as i (i.materialId)}
                  <span class={i.have >= i.quantity ? 'text-emerald-400' : 'text-red-400'}>
                    {i.name} {i.have}/{i.quantity}
                  </span>{' '}
                {/each}
              </p>
              <p class="text-xs text-amber-100/60">{ui.makes}: {r.output.name} ×{r.output.quantity}</p>
              {#if r.requiredReputation}
                <p class="text-xs {r.requiredReputation.met ? 'text-emerald-400' : 'text-red-400'}">
                  {ui.repGate} {r.requiredReputation.tierName} · {r.requiredReputation.factionName}
                </p>
              {/if}
            </div>
            {#if r.unlocked}
              <button
                onclick={() => craft(r)}
                disabled={startingId !== null || !r.craftable}
                class="shrink-0 rounded bg-amber-700 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-amber-600 disabled:opacity-50"
                title={r.craftable ? '' : 'Missing materials'}
              >
                {startingId === r.id ? ui.starting : ui.craft}
              </button>
            {:else}
              <span class="shrink-0 rounded border border-stone-700 px-3 py-1.5 text-xs text-stone-400">
                {ui.locked}
              </span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</main>
