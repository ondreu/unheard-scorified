<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import type { AbilityKind, CasterType } from '@game/shared';
  import { ApiError } from '$lib/api';
  import { currentSession } from '$lib/auth';
  import PixelAbilityIcon from '$lib/components/PixelAbilityIcon.svelte';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Spellbook',
    subtitle: 'D&D tiered spell slots — spent while adventuring, restored on a Long Rest.',
    longRest: 'Long Rest',
    resting: 'Resting…',
    rested: 'Fully rested',
    spent: 'Slots spent',
    noCaster: 'This class has no spell slots. Its abilities are martial techniques — see Rotation.',
    slots: 'Spell Slots',
    cantrips: 'Cantrips (at-will)',
    casting: 'Spellcasting',
  };

  interface SlotTier {
    tier: number;
    max: number;
    available: number;
  }
  interface SpellEntry {
    id: string;
    name: string;
    description?: string;
    kind: AbilityKind;
    spellTier: number;
  }
  interface TierGroup {
    tier: number;
    spells: SpellEntry[];
  }
  interface SpellView {
    characterId: string;
    level: number;
    casterType: CasterType;
    spellcastingAbility: string | null;
    spellSaveDc: number;
    spellAttackBonus: number;
    slots: SlotTier[];
    totalMax: number;
    totalAvailable: number;
    rested: boolean;
    spellbook: { casterType: CasterType; cantrips: SpellEntry[]; spellsByTier: TierGroup[] };
  }

  let view = $state<SpellView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let resting = $state(false);

  const characterId = $derived($page.params.id ?? '');

  onMount(load);

  function authHeaders(): Record<string, string> {
    const token = currentSession()?.accessToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function load(): Promise<void> {
    loading = true;
    try {
      const res = await fetch(`/api/characters/${characterId}/spells`, { headers: authHeaders() });
      if (!res.ok) throw new ApiError(res.status, await res.text());
      view = (await res.json()) as SpellView;
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

  async function longRest(): Promise<void> {
    resting = true;
    error = null;
    try {
      const res = await fetch(`/api/characters/${characterId}/spells/long-rest`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      view = (await res.json()) as SpellView;
    } catch (err) {
      error = (err as Error).message;
    } finally {
      resting = false;
    }
  }

  const TIER_LABEL = (t: number): string => (t === 0 ? 'Cantrip' : `Level ${t}`);
  const ABBREV: Record<string, string> = {
    strength: 'STR',
    dexterity: 'DEX',
    constitution: 'CON',
    intelligence: 'INT',
    wisdom: 'WIS',
    charisma: 'CHA',
  };
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
    {#if view.casterType === 'none'}
      <div class="hub-card">
        <p class="muted">{ui.noCaster}</p>
      </div>
    {:else}
      <section class="hub-card stack">
        <div class="row spread">
          <h2>{ui.casting}</h2>
          <span class="badge {view.rested ? 'badge-ok' : 'badge-warn'}">
            {view.rested ? ui.rested : `${view.totalMax - view.totalAvailable} ${ui.spent}`}
          </span>
        </div>
        <div class="caster-meta">
          <span class="chip">Caster: <strong>{view.casterType}</strong></span>
          {#if view.spellcastingAbility}
            <span class="chip">Ability: <strong>{ABBREV[view.spellcastingAbility] ?? view.spellcastingAbility}</strong></span>
          {/if}
          <span class="chip">Save DC: <strong>{view.spellSaveDc}</strong></span>
          <span class="chip">Atk: <strong>+{view.spellAttackBonus}</strong></span>
        </div>

        <div class="row spread">
          <h3>{ui.slots}</h3>
          <button class="btn btn-sm" onclick={longRest} disabled={resting || view.rested}>
            {resting ? ui.resting : ui.longRest}
          </button>
        </div>
        <div class="slot-rows">
          {#each view.slots as s (s.tier)}
            <div class="slot-row">
              <span class="slot-tier">Lvl {s.tier}</span>
              <span class="pips">
                {#each { length: s.max } as _, i (i)}
                  <span class="pip {i < s.available ? 'pip-on' : 'pip-off'}"></span>
                {/each}
              </span>
              <span class="muted small">{s.available}/{s.max}</span>
            </div>
          {/each}
        </div>
      </section>

      {#if view.spellbook.cantrips.length > 0}
        <section class="hub-card stack">
          <h3>{ui.cantrips}</h3>
          <div class="spell-list">
            {#each view.spellbook.cantrips as sp (sp.id)}
              <div class="spell-row">
                <PixelAbilityIcon name={sp.name} kind={sp.kind} size={22} dim={22} />
                <div class="stack tight">
                  <strong>{sp.name}</strong>
                  {#if sp.description}<span class="muted small">{sp.description}</span>{/if}
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#each view.spellbook.spellsByTier as group (group.tier)}
        <section class="hub-card stack">
          <h3>{TIER_LABEL(group.tier)} Spells</h3>
          <div class="spell-list">
            {#each group.spells as sp (sp.id)}
              <div class="spell-row">
                <PixelAbilityIcon name={sp.name} kind={sp.kind} size={22} dim={22} />
                <div class="stack tight">
                  <strong>{sp.name}</strong>
                  {#if sp.description}<span class="muted small">{sp.description}</span>{/if}
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/each}
    {/if}
  {/if}
</div>

<style>
  .caster-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .slot-rows {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .slot-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .slot-tier {
    min-width: 3.5rem;
    font-weight: 600;
  }
  .pips {
    display: inline-flex;
    gap: 0.3rem;
    flex: 1;
    flex-wrap: wrap;
  }
  .pip {
    width: 0.85rem;
    height: 0.85rem;
    border-radius: 3px;
    border: 1px solid var(--border, #555);
  }
  .pip-on {
    background: #7db4e0;
    box-shadow: 0 0 4px #7db4e0aa;
  }
  .pip-off {
    background: transparent;
    opacity: 0.5;
  }
  .spell-list {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .spell-row {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
  }
  .stack.tight {
    gap: 0.1rem;
  }
  .badge-ok {
    background: var(--success, #2f7d4f);
  }
  .badge-warn {
    background: var(--warning, #8a6d2f);
  }
</style>
