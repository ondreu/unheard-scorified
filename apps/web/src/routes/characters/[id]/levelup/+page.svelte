<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ABILITY_SCORES,
    ABILITY_ABBREV,
    type AbilityScore,
    type LevelUpChoice,
    type LevelTrack,
    type LevelTrackEntry,
    type LevelTrackChoiceType,
  } from '@game/shared';
  import { ApiError } from '$lib/api';
  import { currentSession } from '$lib/auth';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Level Up',
    subtitle: 'Your D&D progression, level by level. Milestone levels let you choose.',
    reset: 'Reset All Choices',
    resetting: 'Resetting…',
    chooseSubclass: 'Choose Subclass',
    asi: 'Ability Score Improvement',
    asiHint: 'Raise one ability by +2, or two abilities by +1 each.',
    feat: 'Feat',
    chosen: 'Chosen',
    locked: 'Unlocks at level',
    current: 'You are here',
    hp: 'Hit Points',
    prof: 'Proficiency',
    feature: 'Feature',
    features: 'Features',
    newSpells: 'New spells',
    spellSlots: 'Spell slots',
    milestone: 'Milestone',
  };

  interface SlotView {
    id: string;
    type: LevelTrackChoiceType;
    level: number;
    choice: LevelUpChoice | null;
    group?: string;
  }
  interface FeatView {
    id: string;
    name: string;
    description: string;
    prerequisite: string;
    eligible: boolean;
    abilityOptions: AbilityScore[];
  }
  interface SubclassView {
    id: string;
    name: string;
    description: string;
  }
  interface FeatureOptionView {
    id: string;
    name: string;
    description: string;
  }
  interface FeatureGroupView {
    id: string;
    name: string;
    description: string;
    options: FeatureOptionView[];
  }
  interface LevelUpView {
    level: number;
    slots: SlotView[];
    feats: FeatView[];
    subclasses: SubclassView[];
    featureGroups: FeatureGroupView[];
    track: LevelTrack;
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
      // Vyčistí rozpracovanou lokální ASI volbu tohoto slotu — po uložení (ASI
      // i feat) ať nezůstane „pending" pick, který by omylem přepsal volbu.
      asiPick = { ...asiPick, [slotId]: {} };
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
    if (asiTotal(slotId) >= 2) return; // už rozdáno max +2 celkem
    if (cur >= 2) return; // max +2 do jednoho atributu
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
  function featureGroup(groupId: string): FeatureGroupView | undefined {
    return view?.featureGroups.find((g) => g.id === groupId);
  }
  function featureOptionName(groupId: string, optionId: string): string {
    return featureGroup(groupId)?.options.find((o) => o.id === optionId)?.name ?? optionId;
  }

  function choiceLabel(c: LevelUpChoice): string {
    if (c.kind === 'subclass') return `Subclass: ${subclassName(c.subclassId)}`;
    if (c.kind === 'feat') {
      const ab = c.abilityChoice ? ` (+1 ${ABILITY_ABBREV[c.abilityChoice]})` : '';
      return `Feat: ${featName(c.featId)}${ab}`;
    }
    if (c.kind === 'class_feature') return featureOptionName(c.groupId, c.optionId);
    const parts = ABILITY_SCORES.filter((k) => (c.increases[k] ?? 0) > 0).map(
      (k) => `+${c.increases[k]} ${ABILITY_ABBREV[k]}`,
    );
    return `ASI: ${parts.join(', ')}`;
  }

  // Slot pro daný level + typ volby (subclass má fixní id, ASI id = `asi@<level>`).
  function slotFor(level: number, type: LevelTrackChoiceType): SlotView | undefined {
    if (!view) return undefined;
    return view.slots.find((s) => s.type === type && s.level === level);
  }

  // Class-feature sloty odemčené na daném levelu, seskupené po skupině (group id).
  function featureSlotsAt(level: number): { group: FeatureGroupView; slots: SlotView[] }[] {
    if (!view) return [];
    const byGroup = new Map<string, SlotView[]>();
    for (const s of view.slots) {
      if (s.type !== 'class_feature' || s.level !== level || !s.group) continue;
      const list = byGroup.get(s.group) ?? [];
      list.push(s);
      byGroup.set(s.group, list);
    }
    const out: { group: FeatureGroupView; slots: SlotView[] }[] = [];
    for (const [groupId, slots] of byGroup) {
      const group = featureGroup(groupId);
      if (group) out.push({ group, slots });
    }
    return out;
  }

  // Option id už zvolené v JINÉM slotu téže skupiny (nelze 2× totéž).
  function optionTakenElsewhere(groupId: string, optionId: string, exceptSlotId: string): boolean {
    if (!view) return false;
    return view.slots.some(
      (s) =>
        s.id !== exceptSlotId &&
        s.choice?.kind === 'class_feature' &&
        s.choice.groupId === groupId &&
        s.choice.optionId === optionId,
    );
  }

  function tierLabel(tier: number): string {
    if (tier === 0) return 'Cantrip';
    const suffix = tier === 1 ? 'st' : tier === 2 ? 'nd' : tier === 3 ? 'rd' : 'th';
    return `${tier}${suffix}`;
  }

  function hasMilestone(entry: LevelTrackEntry): boolean {
    return entry.choices.length > 0;
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
    <div class="row spread wrap">
      <span class="muted">
        <strong>{view.track.className}</strong>
        {#if view.track.subclassName}· {view.track.subclassName}{/if}
        · Level <strong>{view.level}</strong>
      </span>
      <button class="btn btn-ghost" onclick={resetAll} disabled={resetting}>
        {resetting ? ui.resetting : ui.reset}
      </button>
    </div>

    <ol class="track">
      {#each view.track.entries as entry (entry.level)}
        {@const milestone = hasMilestone(entry)}
        <li
          class="level"
          class:reached={entry.reached}
          class:current={entry.level === view.level}
          class:milestone
        >
          <div class="lv-rail">
            <span class="lv-badge">{entry.level}</span>
          </div>

          <div class="lv-body">
            <div class="lv-head">
              <h2>Level {entry.level}</h2>
              {#if entry.level === view.level}<span class="tag tag-current">{ui.current}</span>{/if}
              {#if milestone}<span class="tag tag-milestone">{ui.milestone}</span>{/if}
            </div>

            <!-- Per-level feedback: každý level něco přináší. -->
            <div class="grants">
              <span class="grant">+{entry.hpGain} {ui.hp} <span class="muted small">({entry.totalHp} total)</span></span>
              {#if entry.proficiencyIncreased}
                <span class="grant grant-up">{ui.prof} +{entry.proficiencyBonus}</span>
              {/if}
              {#each entry.newSpellSlots as slot (slot.tier)}
                <span class="grant grant-slot">
                  +{slot.gained} {tierLabel(slot.tier)} {ui.spellSlots} <span class="muted small">({slot.total})</span>
                </span>
              {/each}
            </div>

            {#if entry.newFeatures.length}
              <div class="feat-list">
                {#each entry.newFeatures as f (f.id)}
                  <div class="item">
                    <strong>{f.name}</strong>
                    {#if f.description}<span class="muted small">{f.description}</span>{/if}
                  </div>
                {/each}
              </div>
            {/if}

            {#if entry.newSpells.length}
              <details class="spells">
                <summary>{ui.newSpells} ({entry.newSpells.length})</summary>
                <div class="feat-list">
                  {#each entry.newSpells as s (s.id)}
                    <div class="item">
                      <strong>{s.name}</strong>
                      <span class="muted small">{tierLabel(s.spellTier ?? 0)}</span>
                      {#if s.description}<span class="muted small">{s.description}</span>{/if}
                    </div>
                  {/each}
                </div>
              </details>
            {/if}

            <!-- Milníkové volby (subclass / ASI / Feat) — zvýrazněné, interaktivní po dosažení levelu. -->
            {#if milestone}
              {#each entry.choices as choiceType (choiceType)}
                {#if choiceType === 'class_feature'}
                  {#each featureSlotsAt(entry.level) as fg (fg.group.id)}
                    <section class="choice">
                      <div class="row spread wrap">
                        <h3>{fg.group.name}</h3>
                        <span class="muted small">{fg.slots.length} {fg.slots.length === 1 ? 'choice' : 'choices'}</span>
                      </div>
                      <p class="muted small">{fg.group.description}</p>
                      {#if !entry.reached}
                        <p class="muted small">{ui.locked} {entry.level}.</p>
                      {:else}
                        {#each fg.slots as cfslot, i (cfslot.id)}
                          <div class="cf-slot">
                            <div class="row spread wrap">
                              <span class="muted small">Choice {i + 1}</span>
                              {#if cfslot.choice}<span class="badge">{ui.chosen}: {choiceLabel(cfslot.choice)}</span>{/if}
                            </div>
                            <div class="grid-cards">
                              {#each fg.group.options as opt (opt.id)}
                                {@const chosen = cfslot.choice?.kind === 'class_feature' && cfslot.choice.optionId === opt.id}
                                {@const taken = optionTakenElsewhere(fg.group.id, opt.id, cfslot.id)}
                                <button
                                  class="option {chosen ? 'option-active' : ''} {taken && !chosen ? 'ineligible' : ''}"
                                  disabled={pendingSlot === cfslot.id || (taken && !chosen)}
                                  onclick={() => choose(cfslot.id, { kind: 'class_feature', groupId: fg.group.id, optionId: opt.id })}
                                >
                                  <strong>{opt.name}</strong>
                                  <span class="muted small">{opt.description}</span>
                                </button>
                              {/each}
                            </div>
                          </div>
                        {/each}
                      {/if}
                    </section>
                  {/each}
                {:else}
                {@const slot = slotFor(entry.level, choiceType)}
                <section class="choice">
                  <div class="row spread wrap">
                    <h3>
                      {#if choiceType === 'subclass'}{ui.chooseSubclass}{:else}{ui.asi} / {ui.feat}{/if}
                    </h3>
                    {#if slot?.choice}
                      <span class="badge">{ui.chosen}: {choiceLabel(slot.choice)}</span>
                    {/if}
                  </div>

                  {#if !entry.reached || !slot}
                    <p class="muted small">{ui.locked} {entry.level}.</p>
                  {:else if choiceType === 'subclass'}
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
                    <div class="choice-cols">
                      <div class="stack">
                        <h4>{ui.asi}</h4>
                        <p class="muted small">{ui.asiHint}</p>
                        <div class="asi-grid">
                          {#each ABILITY_SCORES as ab (ab)}
                            <button
                              class="asi-btn {(asiPick[slot.id]?.[ab] ?? 0) > 0 ? 'asi-on' : ''}"
                              disabled={pendingSlot === slot.id || asiTotal(slot.id) >= 2 || (asiPick[slot.id]?.[ab] ?? 0) >= 2}
                              onclick={() => bumpAsi(slot.id, ab)}
                            >
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
                        <h4>{ui.feat}</h4>
                        <div class="grid-cards">
                          {#each view.feats as feat (feat.id)}
                            {@const chosen = slot.choice?.kind === 'feat' && slot.choice.featId === feat.id}
                            {@const disabled = pendingSlot === slot.id || !feat.eligible}
                            <div class="feat-card {chosen ? 'option-active' : ''} {!feat.eligible ? 'ineligible' : ''}">
                              <div class="feat-card-head">
                                <strong>{feat.name}</strong>
                                {#if feat.prerequisite}
                                  <span class="req {feat.eligible ? '' : 'req-fail'}">{feat.prerequisite}</span>
                                {/if}
                              </div>
                              <span class="muted small">{feat.description}</span>
                              {#if feat.abilityOptions.length}
                                <!-- Half-feat: zvol atribut pro +1. -->
                                <div class="ab-options">
                                  {#each feat.abilityOptions as ab (ab)}
                                    <button
                                      class="ab-chip {chosen && slot.choice?.kind === 'feat' && slot.choice.abilityChoice === ab ? 'ab-on' : ''}"
                                      {disabled}
                                      onclick={() => choose(slot.id, { kind: 'feat', featId: feat.id as never, abilityChoice: ab })}
                                    >
                                      +1 {ABILITY_ABBREV[ab]}
                                    </button>
                                  {/each}
                                </div>
                              {:else}
                                <button
                                  class="btn btn-ghost feat-pick"
                                  {disabled}
                                  onclick={() => choose(slot.id, { kind: 'feat', featId: feat.id as never })}
                                >
                                  {chosen ? 'Selected' : 'Take feat'}
                                </button>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      </div>
                    </div>
                  {/if}
                </section>
                {/if}
              {/each}
            {/if}
          </div>
        </li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  .stack { display: flex; flex-direction: column; gap: 1rem; }
  .row { display: flex; gap: 0.75rem; align-items: center; }
  .spread { justify-content: space-between; }
  .wrap { flex-wrap: wrap; }
  .small { font-size: 0.8rem; }

  /* Level track — svislá časová osa 1..20. */
  .track { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .level { display: grid; grid-template-columns: 2.5rem 1fr; gap: 0.75rem; opacity: 0.55; }
  .level.reached { opacity: 1; }
  .lv-rail { display: flex; flex-direction: column; align-items: center; padding-top: 0.4rem; position: relative; }
  .lv-rail::after {
    content: ''; flex: 1; width: 2px; background: var(--border, #333); margin-top: 0.35rem; border-radius: 2px;
  }
  .level:last-child .lv-rail::after { display: none; }
  .lv-badge {
    width: 2rem; height: 2rem; border-radius: 50%; display: grid; place-items: center;
    font-weight: 700; font-size: 0.85rem; background: var(--surface-3, #232330);
    border: 1px solid var(--border, #333); color: inherit;
  }
  .level.reached .lv-badge { border-color: var(--r-uncommon, #1eff00); }
  .level.milestone .lv-badge { background: var(--surface-2, #1a1a22); border-color: var(--r-rare, #0070dd); }
  .level.current .lv-badge { box-shadow: 0 0 0 2px var(--r-rare, #0070dd); }

  .lv-body {
    background: var(--surface-2, #1a1a22); border: 1px solid var(--border, #333);
    border-radius: 10px; padding: 0.7rem 0.85rem; display: flex; flex-direction: column; gap: 0.5rem;
  }
  .level.milestone .lv-body { border-color: var(--r-rare, #0070dd); }
  .level.current .lv-body { box-shadow: 0 0 0 1px var(--r-rare, #0070dd); }
  .lv-head { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .lv-head h2 { margin: 0; font-size: 1rem; }
  .tag { font-size: 0.7rem; padding: 0.1rem 0.45rem; border-radius: 999px; font-weight: 600; }
  .tag-current { background: var(--r-rare, #0070dd); color: #fff; }
  .tag-milestone { background: rgba(0, 112, 221, 0.18); color: var(--r-rare, #4ea3ff); border: 1px solid var(--r-rare, #0070dd); }

  .grants { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .grant {
    font-size: 0.8rem; padding: 0.15rem 0.5rem; border-radius: 6px;
    background: var(--surface-3, #232330); white-space: nowrap;
  }
  .grant-up { color: var(--r-uncommon, #1eff00); }
  .grant-slot { color: var(--r-rare, #4ea3ff); }

  .feat-list { display: flex; flex-direction: column; gap: 0.35rem; }
  .item { display: flex; flex-direction: column; gap: 0.1rem; }
  .item strong { font-size: 0.9rem; }
  .spells > summary { cursor: pointer; font-size: 0.85rem; color: var(--r-rare, #4ea3ff); }
  .spells > .feat-list { margin-top: 0.4rem; }

  .choice {
    margin-top: 0.25rem; padding: 0.6rem 0.7rem; border-radius: 8px;
    background: rgba(0, 112, 221, 0.06); border: 1px dashed var(--r-rare, #0070dd);
    display: flex; flex-direction: column; gap: 0.5rem;
  }
  .choice h3 { margin: 0; font-size: 0.95rem; }
  .choice h4 { margin: 0; font-size: 0.85rem; }

  /* Volba ASI/Feat: staty nahoře, featy pod nimi (stack, ne vedle sebe). */
  .choice-cols { display: flex; flex-direction: column; gap: 1.1rem; }
  .grid-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.5rem; }
  .option {
    display: flex; flex-direction: column; gap: 0.25rem; text-align: left;
    padding: 0.6rem 0.7rem; border: 1px solid var(--border, #333); border-radius: 8px;
    background: var(--surface-2, #1a1a22); color: inherit; cursor: pointer;
  }
  .option:hover { border-color: var(--r-uncommon, #1eff00); }
  .option-active { border-color: var(--r-rare, #0070dd); box-shadow: 0 0 0 1px var(--r-rare, #0070dd); }
  .option.ineligible { opacity: 0.4; cursor: not-allowed; }
  .option:disabled { cursor: not-allowed; }

  /* Class-feature volba (Fighting Style / Metamagic / Invocation / manévr). */
  .cf-slot { display: flex; flex-direction: column; gap: 0.4rem; padding-top: 0.3rem; }
  .cf-slot + .cf-slot { border-top: 1px solid var(--border, #333); padding-top: 0.6rem; }

  /* Feat karta — prereq label, half-feat atribut volby. */
  .feat-card {
    display: flex; flex-direction: column; gap: 0.35rem; text-align: left;
    padding: 0.6rem 0.7rem; border: 1px solid var(--border, #333); border-radius: 8px;
    background: var(--surface-2, #1a1a22);
  }
  .feat-card.ineligible { opacity: 0.5; }
  .feat-card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.4rem; }
  .req { font-size: 0.7rem; padding: 0.05rem 0.4rem; border-radius: 999px; background: var(--surface-3, #232330); white-space: nowrap; }
  .req-fail { color: var(--r-poor, #9d9d9d); border: 1px solid var(--r-poor, #9d9d9d); }
  .ab-options { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .ab-chip {
    padding: 0.3rem 0.55rem; border: 1px solid var(--border, #333); border-radius: 6px;
    background: var(--surface-3, #232330); color: inherit; cursor: pointer; font-size: 0.8rem; font-weight: 600;
  }
  .ab-chip:hover:not(:disabled) { border-color: var(--r-uncommon, #1eff00); }
  .ab-chip:disabled { opacity: 0.4; cursor: not-allowed; }
  .ab-chip.ab-on { border-color: var(--r-rare, #0070dd); box-shadow: 0 0 0 1px var(--r-rare, #0070dd); }
  .feat-pick { align-self: flex-start; font-size: 0.8rem; padding: 0.3rem 0.6rem; }
  .feat-pick:disabled { opacity: 0.5; cursor: not-allowed; }
  .asi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.4rem; }
  .asi-btn {
    padding: 0.5rem; border: 1px solid var(--border, #333); border-radius: 8px;
    background: var(--surface-2, #1a1a22); color: inherit; cursor: pointer; font-weight: 600;
  }
  .asi-btn:hover:not(:disabled) { border-color: var(--r-uncommon, #1eff00); }
  .asi-btn.asi-on { border-color: var(--r-uncommon, #1eff00); box-shadow: 0 0 0 1px var(--r-uncommon, #1eff00); }
  .asi-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .pick { color: var(--r-uncommon, #1eff00); margin-left: 0.25rem; }
  .badge { font-size: 0.8rem; padding: 0.15rem 0.5rem; border-radius: 6px; background: var(--surface-3, #232330); }
</style>
