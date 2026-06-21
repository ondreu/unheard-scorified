<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    abandonDuel,
    actDuel,
    getDuelRun,
    type DuelRunView,
  } from '$lib/api';
  import { castableTiers } from '@game/shared';
  import CombatLog from '$lib/components/CombatLog.svelte';
  import { duelTurnActors } from '$lib/combat-actors';
  import PixelAbilityIcon from '$lib/components/PixelAbilityIcon.svelte';
  import SpellSlotBar from '$lib/components/SpellSlotBar.svelte';
  import SpellTooltip from '$lib/components/SpellTooltip.svelte';
  import UpcastDialog from '$lib/components/UpcastDialog.svelte';
  import ConditionBadges from '$lib/components/ConditionBadges.svelte';
  import { activeCharacterLevel, activeCharacterSpellSaveDc, openNpc } from '$lib/ui-stores';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    notFound: 'Duel not found.',
    title: 'Test Duel',
    boss: 'BOSS',
    target: 'Target',
    abandon: 'Abandon',
    abandoning: 'Leaving…',
    won: '🏆 Victory!',
    lost: '💀 Defeated',
    abandoned: '🏳️ Duel abandoned',
    noReward: 'Test fight — no rewards, XP, or kills.',
    back: 'Back to Bestiary',
    cooldown: 'CD',
    noSlots: 'No slot',
    noKi: 'No Ki',
    bonusAction: 'Bonus action',
    bonusActionHint: 'cast alongside your action this turn',
    bonusNone: 'None',
    bonusQueued: 'Bonus queued',
    endTurn: 'End turn',
    dodge: 'Dodge',
  };

  function slotTotal(map: Record<number, number>): number {
    return Object.values(map).reduce((a, b) => a + b, 0);
  }

  let run = $state<DuelRunView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);
  // Zvolený cíl (index nepřítele) — duel má jednoho, auto na živého.
  let targetId = $state(0);
  let bonusAbilityId = $state<string | null>(null);
  let pendingCast = $state<DuelRunView['abilities'][number] | null>(null);

  const characterId = $derived($page.params.id ?? '');
  const runId = $derived($page.params.runId ?? '');
  const finished = $derived(run?.status === 'cleared' || run?.status === 'dead');
  const bonusOptions = $derived(
    (run?.abilities ?? []).filter((a) => a.actionCost === 'bonus' && a.ready && !a.outOfSlots && !a.outOfKi),
  );

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      run = await getDuelRun(characterId, runId);
      retarget();
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

  function retarget(): void {
    if (!run) return;
    const cur = run.enemies.find((e) => e.idx === targetId);
    if (!cur || cur.currentHealth <= 0) {
      const alive = run.enemies.find((e) => e.currentHealth > 0);
      if (alive) targetId = alive.idx;
    }
  }

  // Podpůrné ability (heal/shield/mitigation) cílí sebe (solo); útočné nepřítele.
  const FRIENDLY_KINDS = new Set(['heal', 'shield', 'mitigation']);
  function targetFor(kind: string): number {
    return FRIENDLY_KINDS.has(kind) ? 0 : targetId;
  }

  function canChooseUpcast(a: DuelRunView['abilities'][number]): boolean {
    if (!run || a.upcastPerSlot <= 0) return false;
    return castableTiers(run.player.spellSlots, a.spellTier).length >= 2;
  }

  function onAbilityTap(a: DuelRunView['abilities'][number]): void {
    if (canChooseUpcast(a)) pendingCast = a;
    else void act(a.id, a.kind);
  }

  async function act(abilityId: string, kind: string, castTier?: number): Promise<void> {
    if (busy || !run || run.status !== 'in_combat') return;
    busy = true;
    error = null;
    const bonus = bonusAbilityId && bonusAbilityId !== abilityId ? bonusAbilityId : undefined;
    try {
      run = await actDuel(characterId, runId, abilityId, targetFor(kind), bonus, castTier);
      bonusAbilityId = null;
      pendingCast = null;
      retarget();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  async function endTurn(action: 'pass' | 'dodge'): Promise<void> {
    if (busy || !run || run.status !== 'in_combat') return;
    busy = true;
    error = null;
    try {
      run = await actDuel(characterId, runId, action, 0);
      retarget();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  async function abandon(): Promise<void> {
    if (busy || !run) return;
    busy = true;
    error = null;
    try {
      run = await abandonDuel(characterId, runId);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  function hpPct(cur: number, max: number): number {
    return max <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((cur / max) * 100)));
  }

  const endText = $derived(run?.status === 'cleared' ? ui.won : run?.status === 'dead' ? ui.lost : ui.abandoned);
</script>

<div class="space-y-5">
  {#if loading}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {:else if error && !run}
    <p class="text-[var(--danger)]">{error ?? ui.notFound}</p>
  {:else if run}
    {@const r = run}

    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-bold">
        {ui.title}
        <span class="ml-2 text-sm font-normal text-[var(--text-dim)]">vs {r.enemyName}</span>
      </h1>
      {#if !finished}
        <button class="btn btn-sm" disabled={busy} onclick={abandon}>
          {busy ? ui.abandoning : ui.abandon}
        </button>
      {/if}
    </div>

    {#if error}<p class="text-sm text-[var(--danger)]">{error}</p>{/if}

    <!-- Enemy (single) -->
    {#if r.enemies.length > 0 && !finished}
      <section class="space-y-2">
        {#each r.enemies as e (e.idx)}
          <div class="relative">
            <button
              class="panel panel-pad w-full text-left {e.idx === targetId ? 'ring-2 ring-[var(--gold-bright)]' : ''} {e.currentHealth <= 0 ? 'opacity-40' : ''}"
              disabled={e.currentHealth <= 0}
              onclick={() => (targetId = e.idx)}
            >
              <div class="flex items-center justify-between">
                <span class="font-semibold">
                  {e.name}
                  {#if e.isBoss}<span class="ml-2 rounded bg-[var(--danger)]/30 px-1.5 py-0.5 text-xs font-bold text-[var(--danger)]">{ui.boss}</span>{/if}
                  {#if e.idx === targetId && e.currentHealth > 0}<span class="ml-2 text-xs text-[var(--gold-bright)]">🎯 {ui.target}</span>{/if}
                </span>
                <span class="text-sm text-[var(--text-dim)]">{e.currentHealth} / {e.maxHealth}</span>
              </div>
              <div class="bar mt-2">
                <div class="bar-fill" style={`width:${hpPct(e.currentHealth, e.maxHealth)}%;background:var(--danger)`}></div>
              </div>
              {#if e.conditions.length > 0}
                <div class="mt-2"><ConditionBadges conditions={e.conditions} /></div>
              {/if}
            </button>
            <button
              type="button"
              class="absolute right-1.5 top-1.5 rounded-full px-1 text-xs text-[var(--text-faint)] hover:text-[var(--info)]"
              title="View stat block"
              aria-label="View stat block"
              onclick={() => openNpc(e.name)}
            >ⓘ</button>
          </div>
        {/each}
      </section>
    {/if}

    <!-- Player -->
    <div class="panel panel-pad">
      <div class="flex items-center justify-between">
        <span class="font-semibold">{r.player.name}</span>
        <span class="text-sm text-[var(--text-dim)]">
          {r.player.currentHealth} / {r.player.maxHealth}
          {#if r.player.absorb > 0}<span class="ml-1 text-[var(--info)]">🛡️ {r.player.absorb}</span>{/if}
          {#if slotTotal(r.player.maxSpellSlots) > 0}
            <SpellSlotBar slots={r.player.spellSlots} max={r.player.maxSpellSlots} title="Spell slots per tier" />
          {/if}
          {#if r.player.maxKiPoints > 0}
            <span class="ml-1 text-[var(--info)]" title="Ki">🌀 {r.player.kiPoints}/{r.player.maxKiPoints}</span>
          {/if}
          {#if r.player.maxRageCharges > 0}
            <span class="ml-1 text-[var(--danger)]" title="Rage charges{r.player.raging ? ' — raging!' : ''}">
              💢 {r.player.rageCharges}/{r.player.maxRageCharges}{r.player.raging ? '🔥' : ''}
            </span>
          {/if}
        </span>
      </div>
      <div class="bar mt-2">
        <div class="bar-fill" style={`width:${hpPct(r.player.currentHealth, r.player.maxHealth)}%;background:var(--success)`}></div>
      </div>
      {#if r.player.conditions.length > 0}
        <div class="mt-2"><ConditionBadges conditions={r.player.conditions} /></div>
      {/if}
    </div>

    <!-- Bonus action selector (ADR 0042) -->
    {#if r.status === 'in_combat' && bonusOptions.length > 0}
      <section class="panel panel-pad">
        <p class="mb-2 text-xs uppercase tracking-wide text-[var(--text-dim)]">
          {ui.bonusAction} <span class="normal-case">— {ui.bonusActionHint}</span>
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            class="btn text-sm {bonusAbilityId === null ? 'ring-2 ring-[var(--gold-bright)]' : ''}"
            onclick={() => (bonusAbilityId = null)}
          >
            {ui.bonusNone}
          </button>
          {#each bonusOptions as b (b.id)}
            <button
              class="btn flex items-center gap-2 text-sm {bonusAbilityId === b.id ? 'ring-2 ring-[var(--gold-bright)]' : ''}"
              title={b.description}
              onclick={() => (bonusAbilityId = bonusAbilityId === b.id ? null : b.id)}
            >
              <PixelAbilityIcon name={b.name} kind={b.kind as never} size={18} />
              <span>{b.name}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Ability bar -->
    {#if r.status === 'in_combat'}
      <section>
        {#if bonusAbilityId}
          <p class="mb-2 text-xs text-[var(--gold-bright)]">
            ✨ {ui.bonusQueued}: {bonusOptions.find((b) => b.id === bonusAbilityId)?.name ?? ''}
          </p>
        {/if}
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {#each r.abilities as a (a.id)}
            <SpellTooltip
              abilityId={a.id}
              level={$activeCharacterLevel ?? 1}
              spellSaveDc={$activeCharacterSpellSaveDc ?? undefined}
            >
              <button
                class="btn flex w-full items-center gap-2 text-left"
                disabled={busy || !a.ready || a.outOfSlots || a.outOfKi}
                onclick={() => onAbilityTap(a)}
              >
                <PixelAbilityIcon name={a.name} kind={a.kind as never} size={22} />
                <span class="min-w-0 flex-1 truncate">{a.name}</span>
                {#if a.ready && !a.outOfSlots && canChooseUpcast(a)}
                  <span class="shrink-0 text-xs text-[var(--accent)]" title="Choose upcast slot">▲</span>
                {/if}
                {#if !a.ready}
                  <span class="shrink-0 text-xs text-[var(--text-dim)]">{ui.cooldown} {a.cooldownRemaining}</span>
                {:else if a.outOfSlots}
                  <span class="shrink-0 text-xs text-[var(--danger)]">{ui.noSlots}</span>
                {:else if a.outOfKi}
                  <span class="shrink-0 text-xs text-[var(--danger)]">{ui.noKi}</span>
                {/if}
              </button>
            </SpellTooltip>
          {/each}
        </div>
        <div class="mt-2 flex gap-2">
          <button class="btn btn-sm flex-1" disabled={busy} title="Incoming attacks have disadvantage until your next turn" onclick={() => endTurn('dodge')}>🤺 {ui.dodge}</button>
          <button class="btn btn-sm flex-1" disabled={busy} title="Take no action and end your turn" onclick={() => endTurn('pass')}>⏭️ {ui.endTurn}</button>
        </div>
      </section>
    {/if}

    <!-- Upcast cast dialog -->
    {#if pendingCast}
      <UpcastDialog
        ability={pendingCast}
        slots={r.player.spellSlots}
        level={$activeCharacterLevel ?? 1}
        spellSaveDc={$activeCharacterSpellSaveDc ?? undefined}
        {busy}
        oncast={(tier) => act(pendingCast!.id, pendingCast!.kind, tier)}
        oncancel={() => (pendingCast = null)}
      />
    {/if}

    <!-- End screen -->
    {#if finished}
      <section class="panel panel-pad text-center">
        <p class="text-xl font-bold" style={`color:${r.status === 'dead' ? 'var(--danger)' : 'var(--gold-bright)'}`}>
          {endText}
        </p>
        <p class="mt-1 text-sm text-[var(--text-dim)]">{ui.noReward}</p>
        <a href={`/characters/${characterId}/bestiary`} class="btn btn-primary mt-4 inline-flex">{ui.back}</a>
      </section>
    {/if}

    <!-- Combat log -->
    {#if r.events.length > 0}
      <CombatLog events={r.events} actors={duelTurnActors(r)} groupRounds />
    {/if}
  {/if}
</div>
