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
    subtitle: 'Choose your active spells. Spell slots are spent adventuring and restored on a Long Rest.',
    longRest: 'Long Rest',
    resting: 'Resting…',
    rested: 'Fully rested',
    spent: 'Slots spent',
    noCaster: 'This class has no spell slots. Its abilities are martial techniques — see Rotation.',
    slots: 'Spell Slots',
    cantrips: 'Cantrips (at-will)',
    casting: 'Spellcasting',
    prepared: 'Prepared Spells',
    save: 'Save Spells',
    saving: 'Saving…',
    saved: 'Spells saved',
    restToEdit: 'Take a Long Rest to change your prepared spells.',
    pickHint: 'Pick the spells you want available in combat. Changing them is free on a Long Rest.',
  };

  interface SlotTier { tier: number; max: number; available: number; }
  interface SpellEntry {
    id: string;
    name: string;
    description?: string;
    kind: AbilityKind;
    spellTier: number;
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
    pool: { cantrips: SpellEntry[]; leveled: SpellEntry[] };
    prepared: string[];
    preparedExplicit: boolean;
    limits: { cantrips: number; leveled: number };
    canEdit: boolean;
  }

  let view = $state<SpellView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let resting = $state(false);
  let saving = $state(false);
  let savedFlash = $state(false);
  // Lokální výběr aktivních kouzel (Set ids) — inicializovaný z view.prepared.
  let selected = $state<Set<string>>(new Set());

  const characterId = $derived($page.params.id ?? '');

  // Počty zvolených cantripů / leveled (pro limity a counter).
  const cantripCount = $derived(
    view ? view.pool.cantrips.filter((s) => selected.has(s.id)).length : 0,
  );
  const leveledCount = $derived(
    view ? view.pool.leveled.filter((s) => selected.has(s.id)).length : 0,
  );
  // Liší se výběr od uloženého stavu?
  const dirty = $derived.by(() => {
    if (!view) return false;
    const cur = new Set(view.prepared);
    if (cur.size !== selected.size) return true;
    for (const id of selected) if (!cur.has(id)) return true;
    return false;
  });

  // Leveled kouzla seskupená po tieru (pro hezké sekce).
  const leveledByTier = $derived.by(() => {
    const groups = new Map<number, SpellEntry[]>();
    for (const s of view?.pool.leveled ?? []) {
      const g = groups.get(s.spellTier) ?? [];
      g.push(s);
      groups.set(s.spellTier, g);
    }
    return [...groups.keys()].sort((a, b) => a - b).map((tier) => ({ tier, spells: groups.get(tier)! }));
  });

  onMount(load);

  function authHeaders(): Record<string, string> {
    const token = currentSession()?.accessToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function syncSelected(): void {
    selected = new Set(view?.prepared ?? []);
  }

  async function load(): Promise<void> {
    loading = true;
    try {
      const res = await fetch(`/api/characters/${characterId}/spells`, { headers: authHeaders() });
      if (!res.ok) throw new ApiError(res.status, await res.text());
      view = (await res.json()) as SpellView;
      syncSelected();
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
      syncSelected();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      resting = false;
    }
  }

  function isCantrip(id: string): boolean {
    return view?.pool.cantrips.some((s) => s.id === id) ?? false;
  }

  /** Lze kouzlo přidat? (pod limitem pro daný typ). Odebrat lze vždy. */
  function canAdd(entry: SpellEntry): boolean {
    if (!view) return false;
    if (selected.has(entry.id)) return true;
    return entry.spellTier === 0
      ? cantripCount < view.limits.cantrips
      : leveledCount < view.limits.leveled;
  }

  function toggle(entry: SpellEntry): void {
    if (!view?.canEdit) return;
    const next = new Set(selected);
    if (next.has(entry.id)) {
      next.delete(entry.id);
    } else {
      if (!canAdd(entry)) return;
      next.add(entry.id);
    }
    selected = next;
  }

  async function save(): Promise<void> {
    if (!view || saving) return;
    saving = true;
    error = null;
    try {
      const res = await fetch(`/api/characters/${characterId}/spells/prepared`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ spellIds: [...selected] }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      view = (await res.json()) as SpellView;
      syncSelected();
      savedFlash = true;
      setTimeout(() => (savedFlash = false), 1800);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      saving = false;
    }
  }

  const ABBREV: Record<string, string> = {
    strength: 'STR', dexterity: 'DEX', constitution: 'CON',
    intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
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

      <!-- Prepared spells editor (Kniha kouzel, ADR 0039) -->
      <section class="hub-card stack">
        <div class="row spread">
          <h2>{ui.prepared}</h2>
          <div class="row">
            {#if savedFlash}<span class="badge badge-ok">{ui.saved}</span>{/if}
            <button class="btn btn-primary btn-sm" onclick={save} disabled={!view.canEdit || !dirty || saving}>
              {saving ? ui.saving : ui.save}
            </button>
          </div>
        </div>
        <p class="muted small">{ui.pickHint}</p>
        {#if !view.canEdit}
          <div class="alert alert-warn">{ui.restToEdit}</div>
        {/if}

        {#if view.limits.cantrips > 0 && view.pool.cantrips.length > 0}
          <div class="group-head">
            <h3>{ui.cantrips}</h3>
            <span class="counter {cantripCount >= view.limits.cantrips ? 'counter-full' : ''}">
              {cantripCount}/{view.limits.cantrips}
            </span>
          </div>
          <div class="spell-grid">
            {#each view.pool.cantrips as sp (sp.id)}
              {@const active = selected.has(sp.id)}
              <button
                class="spell-card {active ? 'spell-active' : ''}"
                disabled={!view.canEdit || (!active && !canAdd(sp))}
                onclick={() => toggle(sp)}
              >
                <PixelAbilityIcon name={sp.name} kind={sp.kind} size={22} dim={22} />
                <div class="stack tight">
                  <strong>{sp.name}</strong>
                  {#if sp.description}<span class="muted small">{sp.description}</span>{/if}
                </div>
                {#if active}<span class="check">✓</span>{/if}
              </button>
            {/each}
          </div>
        {/if}

        <div class="group-head">
          <h3>Spells</h3>
          <span class="counter {leveledCount >= view.limits.leveled ? 'counter-full' : ''}">
            {leveledCount}/{view.limits.leveled}
          </span>
        </div>
        {#each leveledByTier as group (group.tier)}
          <h4 class="tier-label">Level {group.tier}</h4>
          <div class="spell-grid">
            {#each group.spells as sp (sp.id)}
              {@const active = selected.has(sp.id)}
              <button
                class="spell-card {active ? 'spell-active' : ''}"
                disabled={!view.canEdit || (!active && !canAdd(sp))}
                onclick={() => toggle(sp)}
              >
                <PixelAbilityIcon name={sp.name} kind={sp.kind} size={22} dim={22} />
                <div class="stack tight">
                  <strong>{sp.name}</strong>
                  {#if sp.description}<span class="muted small">{sp.description}</span>{/if}
                </div>
                {#if active}<span class="check">✓</span>{/if}
              </button>
            {/each}
          </div>
        {/each}
      </section>
    {/if}
  {/if}
</div>

<style>
  .stack { display: flex; flex-direction: column; gap: 1rem; }
  .row { display: flex; gap: 0.6rem; align-items: center; }
  .spread { justify-content: space-between; }
  .small { font-size: 0.8rem; }
  .caster-meta { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .slot-rows { display: flex; flex-direction: column; gap: 0.5rem; }
  .slot-row { display: flex; align-items: center; gap: 0.75rem; }
  .slot-tier { min-width: 3.5rem; font-weight: 600; }
  .pips { display: inline-flex; gap: 0.3rem; flex: 1; flex-wrap: wrap; }
  .pip { width: 0.85rem; height: 0.85rem; border-radius: 3px; border: 1px solid var(--border, #555); }
  .pip-on { background: #7db4e0; box-shadow: 0 0 4px #7db4e0aa; }
  .pip-off { background: transparent; opacity: 0.5; }
  .stack.tight { gap: 0.1rem; }
  .badge-ok { background: var(--success, #2f7d4f); }
  .badge-warn { background: var(--warning, #8a6d2f); }

  .group-head { display: flex; align-items: baseline; gap: 0.6rem; }
  .counter {
    font-size: 0.8rem; font-weight: 600; padding: 0.1rem 0.5rem; border-radius: 6px;
    background: var(--surface-3, #232330); color: var(--muted, #9aa);
  }
  .counter-full { background: var(--r-uncommon, #1eff00); color: #06210a; }
  .tier-label { font-size: 0.85rem; opacity: 0.75; margin: 0.25rem 0 0; }
  .spell-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.5rem;
  }
  .spell-card {
    position: relative; display: flex; align-items: flex-start; gap: 0.6rem; text-align: left;
    padding: 0.6rem 0.7rem; border: 1px solid var(--border, #333); border-radius: 8px;
    background: var(--surface-2, #1a1a22); color: inherit; cursor: pointer;
  }
  .spell-card:hover:not(:disabled) { border-color: var(--r-uncommon, #1eff00); }
  .spell-card:disabled { opacity: 0.45; cursor: not-allowed; }
  .spell-active { border-color: var(--r-rare, #0070dd); box-shadow: 0 0 0 1px var(--r-rare, #0070dd); }
  .check { position: absolute; top: 0.4rem; right: 0.55rem; color: var(--r-rare, #4ea3ff); font-weight: 700; }
  .alert-warn { background: var(--warning, #8a6d2f); color: #fff; padding: 0.5rem 0.7rem; border-radius: 8px; }
</style>
