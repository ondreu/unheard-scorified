<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    getRotation,
    setRotation,
    testRotationDummy,
    type CombatEvent,
    type RotationAbility,
    type RotationConditionType,
    type RotationRule,
  } from '$lib/api';
  import type { AbilityKind } from '@game/shared';
  import CombatMeters from '$lib/components/CombatMeters.svelte';
  import PixelAbilityIcon from '$lib/components/PixelAbilityIcon.svelte';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Combat Rotation',
    intro:
      'Set the priority and conditions for your unlocked abilities. Higher rules fire first; ' +
      'when a rule is held back, you fall back to auto-attacks. Applies to dungeons, raids and arenas.',
    healerNote:
      'Healers: disable your damage spells to focus purely on healing (HPS), keep both for a ' +
      'hybrid that also helps with damage, or disable your heals for a niche damage rotation.',
    empty: 'No active abilities yet — unlock a capstone talent to add abilities to your rotation.',
    save: 'Save Rotation',
    saving: 'Saving…',
    saved: 'Rotation saved.',
    enabled: 'Enabled',
    condition: 'Condition',
    up: '↑',
    down: '↓',
    dummyTitle: 'Test on Training Dummy',
    dummyIntro:
      'Save your rotation, then run it against a stationary training dummy to see how it plays out — no party or opponent needed.',
    role: 'Role',
    duration: 'Duration',
    runTest: 'Run test',
    running: 'Running…',
  };

  const ROLES = [
    { value: 'dps', label: 'DPS' },
    { value: 'tank', label: 'Tank' },
    { value: 'healer', label: 'Healer' },
  ];
  const DURATIONS = [30, 60, 120];

  const CONDITIONS: { value: RotationConditionType; label: string; hasThreshold: boolean }[] = [
    { value: 'always', label: 'Always', hasThreshold: false },
    { value: 'enemy_hp_below', label: 'Target HP below', hasThreshold: true },
    { value: 'enemy_hp_above', label: 'Target HP above', hasThreshold: true },
    { value: 'self_hp_below', label: 'Self HP below', hasThreshold: true },
  ];

  function hasThreshold(t: RotationConditionType): boolean {
    return CONDITIONS.find((c) => c.value === t)?.hasThreshold ?? false;
  }

  let abilities = $state<RotationAbility[]>([]);
  let rules = $state<RotationRule[]>([]);
  let error = $state<string | null>(null);
  let saving = $state(false);
  let savedFlash = $state(false);

  let dummyRole = $state('dps');
  let dummyDuration = $state(60);
  let dummyRunning = $state(false);
  let dummyError = $state<string | null>(null);
  let dummyEvents = $state<CombatEvent[] | null>(null);

  const characterId = $derived($page.params.id ?? '');

  function abilityName(id: string): string {
    return abilities.find((a) => a.id === id)?.name ?? id;
  }
  function abilityMeta(id: string): RotationAbility | undefined {
    return abilities.find((a) => a.id === id);
  }

  onMount(load);

  async function load(): Promise<void> {
    try {
      const view = await getRotation(characterId);
      abilities = view.abilities;
      rules = view.rules;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await goto('/login');
        return;
      }
      error = (err as Error).message;
    }
  }

  function move(i: number, dir: -1 | 1): void {
    const j = i + dir;
    if (j < 0 || j >= rules.length) return;
    const next = [...rules];
    [next[i], next[j]] = [next[j]!, next[i]!];
    rules = next;
  }

  function onConditionChange(rule: RotationRule, value: string): void {
    rule.conditionType = value as RotationConditionType;
    if (hasThreshold(rule.conditionType)) {
      rule.threshold = rule.threshold ?? 0.3;
    } else {
      rule.threshold = undefined;
    }
    rules = [...rules];
  }

  async function save(): Promise<void> {
    saving = true;
    error = null;
    savedFlash = false;
    try {
      const view = await setRotation(characterId, rules);
      abilities = view.abilities;
      rules = view.rules;
      savedFlash = true;
      setTimeout(() => (savedFlash = false), 2500);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      saving = false;
    }
  }

  async function runDummyTest(): Promise<void> {
    dummyRunning = true;
    dummyError = null;
    try {
      const result = await testRotationDummy(characterId, dummyRole, dummyDuration);
      dummyEvents = result.events;
    } catch (err) {
      dummyError = (err as Error).message;
    } finally {
      dummyRunning = false;
    }
  }

  function eventStyle(e: CombatEvent): string {
    if (e.type === 'defeat' || e.type === 'player_defeated') return 'color:var(--danger);font-weight:600';
    if (e.type === 'heal') return 'color:var(--success)';
    if (e.type === 'drain') return 'color:var(--success);opacity:0.9';
    if (e.type === 'dot') return 'color:var(--gold-bright)';
    if (e.type === 'absorb') return 'color:var(--info);opacity:0.8';
    if (e.type === 'ability') return 'color:var(--info)';
    return 'color:var(--text-dim)';
  }
</script>

<div class="space-y-5">
  <div>
    <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{ui.title}</h1>
    <p class="mt-1 max-w-2xl text-sm text-[var(--text-dim)]">{ui.intro}</p>
    {#if abilities.some((a) => a.kind === 'heal')}
      <p class="mt-1 max-w-2xl text-sm text-[var(--info)]">{ui.healerNote}</p>
    {/if}
  </div>

  {#if error}
    <p class="text-[var(--danger)]">{error}</p>
  {/if}

  {#if rules.length === 0}
    <p class="panel panel-pad text-[var(--text-dim)]">{ui.empty}</p>
  {:else}
    <ol class="space-y-2">
      {#each rules as rule, i (rule.abilityId)}
        <li class="panel panel-pad flex flex-wrap items-center gap-3">
          <span class="text-[var(--text-faint)] w-6 text-right">{i + 1}.</span>
          <PixelAbilityIcon
            name={abilityName(rule.abilityId)}
            kind={abilityMeta(rule.abilityId)?.kind as AbilityKind | undefined}
            size={28}
            dim={16}
          />
          <div class="min-w-48 flex-1">
            <div class="font-semibold text-[var(--text)]">{abilityName(rule.abilityId)}</div>
            <div class="text-xs text-[var(--text-faint)]">
              {abilityMeta(rule.abilityId)?.kind} · {abilityMeta(rule.abilityId)?.cooldownSec}s CD
            </div>
            {#if abilityMeta(rule.abilityId)?.description}
              <div class="mt-0.5 text-xs text-[var(--text-dim)]">
                {abilityMeta(rule.abilityId)?.description}
              </div>
            {/if}
          </div>

          <label class="flex items-center gap-1 text-sm text-[var(--text-dim)]">
            <input type="checkbox" bind:checked={rule.enabled} />
            {ui.enabled}
          </label>

          <select
            class="input max-w-44"
            value={rule.conditionType}
            onchange={(e) => onConditionChange(rule, (e.target as HTMLSelectElement).value)}
          >
            {#each CONDITIONS as c (c.value)}
              <option value={c.value}>{c.label}</option>
            {/each}
          </select>

          {#if hasThreshold(rule.conditionType)}
            <div class="flex items-center gap-1 text-sm text-[var(--text-dim)]">
              <input
                type="number"
                class="input w-20"
                min="0"
                max="100"
                step="5"
                value={Math.round((rule.threshold ?? 0.3) * 100)}
                oninput={(e) => {
                  const pct = Number((e.target as HTMLInputElement).value);
                  rule.threshold = Math.min(1, Math.max(0, pct / 100));
                  rules = [...rules];
                }}
              />
              <span>%</span>
            </div>
          {/if}

          <div class="flex gap-1">
            <button class="btn px-2" disabled={i === 0} onclick={() => move(i, -1)}>{ui.up}</button>
            <button class="btn px-2" disabled={i === rules.length - 1} onclick={() => move(i, 1)}>
              {ui.down}
            </button>
          </div>
        </li>
      {/each}
    </ol>

    <div class="flex items-center gap-3">
      <button class="btn btn-primary" disabled={saving} onclick={save}>
        {saving ? ui.saving : ui.save}
      </button>
      {#if savedFlash}<span class="text-sm text-[var(--success)]">{ui.saved}</span>{/if}
    </div>
  {/if}

  <div class="panel panel-pad space-y-3">
    <div>
      <h2 class="font-display text-lg font-semibold text-[var(--gold-bright)]">{ui.dummyTitle}</h2>
      <p class="mt-1 max-w-2xl text-sm text-[var(--text-dim)]">{ui.dummyIntro}</p>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <label class="flex items-center gap-2 text-sm text-[var(--text-dim)]">
        {ui.role}
        <select class="input" bind:value={dummyRole}>
          {#each ROLES as r (r.value)}
            <option value={r.value}>{r.label}</option>
          {/each}
        </select>
      </label>

      <label class="flex items-center gap-2 text-sm text-[var(--text-dim)]">
        {ui.duration}
        <select class="input" bind:value={dummyDuration}>
          {#each DURATIONS as d (d)}
            <option value={d}>{d}s</option>
          {/each}
        </select>
      </label>

      <button class="btn btn-primary" disabled={dummyRunning} onclick={runDummyTest}>
        {dummyRunning ? ui.running : ui.runTest}
      </button>
    </div>

    {#if dummyError}
      <p class="text-[var(--danger)]">{dummyError}</p>
    {/if}

    {#if dummyEvents}
      <CombatMeters events={dummyEvents} />
      <ul class="max-h-80 space-y-1 overflow-y-auto font-mono text-xs">
        {#each [...dummyEvents].reverse() as e, i (dummyEvents.length - 1 - i)}
          <li style={eventStyle(e)}>
            <span class="text-[var(--text-faint)]">{e.t.toFixed(1)}s</span>
            {e.message}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
