<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ABILITY_SCORES,
    ABILITY_ABBREV,
    type AbilityScore,
    type LevelUpChoice,
  } from '@game/shared';
  import { ApiError } from '$lib/api';
  import { currentSession } from '$lib/auth';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Level Up',
    subtitle: 'D&D progression — choose a subclass, raise ability scores, or take feats.',
    reset: 'Reset All Choices',
    resetting: 'Resetting…',
    chooseSubclass: 'Choose Subclass',
    asi: 'Ability Score Improvement',
    asiHint: 'Raise one ability by +2, or two abilities by +1 each.',
    feat: 'Feat',
    or: 'or',
    chosen: 'Chosen',
    locked: 'Reached at level',
  };

  interface SlotView {
    id: string;
    type: 'subclass' | 'asi_or_feat';
    level: number;
    choice: LevelUpChoice | null;
  }
  interface FeatView {
    id: string;
    name: string;
    description: string;
  }
  interface SubclassView {
    id: string;
    name: string;
    description: string;
  }
  interface LevelUpView {
    level: number;
    slots: SlotView[];
    feats: FeatView[];
    subclasses: SubclassView[];
  }

  let view = $state<LevelUpView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let pendingSlot = $state<string | null>(null);
  let resetting = $state(false);
  // Per-ASI-slot local pick state (slotId -> increases map).
  let asiPick = $state<Record<string, Partial<Record<AbilityScore, number>>>>({});

  const characterId = $derived($page.params.id ?? '');

  onMount(load);

  function authHeaders(): Record<string, string> {
    const token = currentSession()?.accessToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function load(): Promise<void> {
    loading = true;
    try {
      const res = await fetch(`/api/characters/${characterId}/levelup`, { headers: authHeaders() });
      if (!res.ok) throw new ApiError(res.status, await res.text());
      view = (await res.json()) as LevelUpView;
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

  async function choose(slotId: string, choice: LevelUpChoice): Promise<void> {
    pendingSlot = slotId;
    error = null;
    try {
      const res = await fetch(`/api/characters/${characterId}/levelup/${slotId}`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(choice),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      view = (await res.json()) as LevelUpView;
    } catch (err) {
      error = (err as Error).message;
    } finally {
      pendingSlot = null;
    }
  }

  async function resetAll(): Promise<void> {
    resetting = true;
    error = null;
    try {
      const res = await fetch(`/api/characters/${characterId}/levelup`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      view = (await res.json()) as LevelUpView;
      asiPick = {};
    } catch (err) {
      error = (err as Error).message;
    } finally {
      resetting = false;
    }
  }

  function asiTotal(slotId: string): number {
    const m = asiPick[slotId] ?? {};
    return ABILITY_SCORES.reduce((s, k) => s + (m[k] ?? 0), 0);
  }

  function bumpAsi(slotId: string, ability: AbilityScore): void {
    const m = { ...(asiPick[slotId] ?? {}) };
    const cur = m[ability] ?? 0;
    if (asiTotal(slotId) >= 2 && cur === 0) return; // already spent 2
    if (cur >= 2) return; // max +2 per ability
    m[ability] = cur + 1;
    asiPick = { ...asiPick, [slotId]: m };
  }

  function clearAsi(slotId: string): void {
    asiPick = { ...asiPick, [slotId]: {} };
  }

  function confirmAsi(slotId: string): void {
    if (asiTotal(slotId) !== 2) return;
    void choose(slotId, { kind: 'asi', increases: asiPick[slotId] ?? {} });
  }

  function subclassName(id: string): string {
    return view?.subclasses.find((s) => s.id === id)?.name ?? id;
  }
  function featName(id: string): string {
    return view?.feats.find((f) => f.id === id)?.name ?? id;
  }

  function choiceLabel(c: LevelUpChoice): string {
    if (c.kind === 'subclass') return `Subclass: ${subclassName(c.subclassId)}`;
    if (c.kind === 'feat') return `Feat: ${featName(c.featId)}`;
    const parts = ABILITY_SCORES.filter((k) => (c.increases[k] ?? 0) > 0).map(
      (k) => `+${c.increases[k]} ${ABILITY_ABBREV[k]}`,
    );
    return `ASI: ${parts.join(', ')}`;
  }
</script>

<div class="stack">
  <header class="page-head">
    <h1>{ui.title}</h1>
    <p class="muted">{ui.subtitle}</p>
  </header>

  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  {#if loading}
    <p class="muted">Loading…</p>
  {:else if view}
    <div class="row spread">
      <span class="muted">Character level <strong>{view.level}</strong></span>
      <button class="btn btn-ghost" onclick={resetAll} disabled={resetting}>
        {resetting ? ui.resetting : ui.reset}
      </button>
    </div>

    {#if view.slots.length === 0}
      <div class="hub-card">
        <p class="muted">No level-up choices yet. Reach higher levels to unlock a subclass and ability score improvements.</p>
      </div>
    {/if}

    {#each view.slots as slot (slot.id)}
      <section class="hub-card stack">
        <div class="row spread">
          <h2>
            {#if slot.type === 'subclass'}{ui.chooseSubclass}{:else}{ui.asi} / {ui.feat}{/if}
            <span class="muted small">· {ui.locked} {slot.level}</span>
          </h2>
          {#if slot.choice}
            <span class="badge">{ui.chosen}: {choiceLabel(slot.choice)}</span>
          {/if}
        </div>

        {#if slot.type === 'subclass'}
          <div class="grid-cards">
            {#each view.subclasses as sub (sub.id)}
              <button
                class="option {slot.choice?.kind === 'subclass' && slot.choice.subclassId === sub.id ? 'option-active' : ''}"
                disabled={pendingSlot === slot.id}
                onclick={() => choose(slot.id, { kind: 'subclass', subclassId: sub.id as never })}
              >
                <strong>{sub.name}</strong>
                <span class="muted small">{sub.description}</span>
              </button>
            {/each}
          </div>
        {:else}
          <div class="two-col">
            <div class="stack">
              <h3>{ui.asi}</h3>
              <p class="muted small">{ui.asiHint}</p>
              <div class="asi-grid">
                {#each ABILITY_SCORES as ab (ab)}
                  <button class="asi-btn" disabled={pendingSlot === slot.id} onclick={() => bumpAsi(slot.id, ab)}>
                    {ABILITY_ABBREV[ab]}
                    {#if (asiPick[slot.id]?.[ab] ?? 0) > 0}<span class="pick">+{asiPick[slot.id]?.[ab]}</span>{/if}
                  </button>
                {/each}
              </div>
              <div class="row">
                <button class="btn btn-primary" disabled={asiTotal(slot.id) !== 2 || pendingSlot === slot.id} onclick={() => confirmAsi(slot.id)}>
                  Confirm ASI ({asiTotal(slot.id)}/2)
                </button>
                <button class="btn btn-ghost" onclick={() => clearAsi(slot.id)}>Clear</button>
              </div>
            </div>

            <div class="stack">
              <h3>{ui.feat}</h3>
              <div class="grid-cards">
                {#each view.feats as feat (feat.id)}
                  <button
                    class="option {slot.choice?.kind === 'feat' && slot.choice.featId === feat.id ? 'option-active' : ''}"
                    disabled={pendingSlot === slot.id}
                    onclick={() => choose(slot.id, { kind: 'feat', featId: feat.id as never })}
                  >
                    <strong>{feat.name}</strong>
                    <span class="muted small">{feat.description}</span>
                  </button>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </section>
    {/each}
  {/if}
</div>

<style>
  .stack { display: flex; flex-direction: column; gap: 1rem; }
  .row { display: flex; gap: 0.75rem; align-items: center; }
  .spread { justify-content: space-between; }
  .small { font-size: 0.8rem; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
  @media (max-width: 720px) { .two-col { grid-template-columns: 1fr; } }
  .grid-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.5rem; }
  .option {
    display: flex; flex-direction: column; gap: 0.25rem; text-align: left;
    padding: 0.6rem 0.7rem; border: 1px solid var(--border, #333); border-radius: 8px;
    background: var(--surface-2, #1a1a22); color: inherit; cursor: pointer;
  }
  .option:hover { border-color: var(--r-uncommon, #1eff00); }
  .option-active { border-color: var(--r-rare, #0070dd); box-shadow: 0 0 0 1px var(--r-rare, #0070dd); }
  .asi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.4rem; }
  .asi-btn {
    padding: 0.5rem; border: 1px solid var(--border, #333); border-radius: 8px;
    background: var(--surface-2, #1a1a22); color: inherit; cursor: pointer; font-weight: 600;
  }
  .asi-btn:hover { border-color: var(--r-uncommon, #1eff00); }
  .pick { color: var(--r-uncommon, #1eff00); margin-left: 0.25rem; }
  .badge { font-size: 0.8rem; padding: 0.15rem 0.5rem; border-radius: 6px; background: var(--surface-3, #232330); }
</style>
