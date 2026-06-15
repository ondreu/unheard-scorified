<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    getRotation,
    setRotation,
    type RotationAbility,
    type RotationConditionType,
    type RotationRule,
  } from '$lib/api';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Combat Rotation',
    intro:
      'Set the priority and conditions for your unlocked abilities. Higher rules fire first; ' +
      'when a rule is held back, you fall back to auto-attacks. Applies to dungeons, raids and arenas.',
    empty: 'No active abilities yet — unlock a capstone talent to add abilities to your rotation.',
    save: 'Save Rotation',
    saving: 'Saving…',
    saved: 'Rotation saved.',
    enabled: 'Enabled',
    condition: 'Condition',
    up: '↑',
    down: '↓',
  };

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
</script>

<div class="space-y-5">
  <div>
    <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{ui.title}</h1>
    <p class="mt-1 max-w-2xl text-sm text-[var(--text-dim)]">{ui.intro}</p>
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
          <div class="min-w-40 flex-1">
            <div class="font-semibold text-[var(--text)]">{abilityName(rule.abilityId)}</div>
            <div class="text-xs text-[var(--text-faint)]">
              {abilityMeta(rule.abilityId)?.kind} · {abilityMeta(rule.abilityId)?.cooldownSec}s CD
            </div>
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
</div>
