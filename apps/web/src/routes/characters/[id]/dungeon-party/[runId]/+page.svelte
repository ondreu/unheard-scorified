<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import {
    ApiError,
    abandonDungeonParty,
    getDungeonPartyRun,
    submitDungeonParty,
    type DungeonPartyRunView,
  } from '$lib/api';
  import { ITEMS } from '@game/shared';
  import CombatLog from '$lib/components/CombatLog.svelte';
  import PixelAbilityIcon from '$lib/components/PixelAbilityIcon.svelte';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    notFound: 'Live dungeon run not found.',
    encounter: 'Encounter',
    boss: 'BOSS',
    target: 'Target',
    abandon: 'Abandon',
    cleared: '🏆 Dungeon cleared!',
    wiped: '💀 The party wiped',
    reward: 'Reward',
    loot: 'Loot',
    lockedOut: '🔒 Already saved this week — no reward.',
    cleared2: 'encounters cleared',
    back: 'Back to Group',
    cooldown: 'CD',
    noSlots: 'No slot',
    noKi: 'No Ki',
    party: 'Party',
    waiting: 'Waiting for the party…',
    submitted: 'Action locked in',
    youFell: 'You have fallen — your allies fight on.',
    aiSoon: 'AI takes over idle players in',
  };

  const roleIcon: Record<string, string> = { tank: '🛡️', healer: '✨', dps: '⚔️' };

  let run = $state<DungeonPartyRunView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let targetId = $state(0);
  let now = $state(Date.now());
  let poll: ReturnType<typeof setInterval> | null = null;
  let clock: ReturnType<typeof setInterval> | null = null;

  const characterId = $derived($page.params.id ?? '');
  const runId = $derived($page.params.runId ?? '');
  const finished = $derived(run?.status === 'cleared' || run?.status === 'wiped');
  const deadlineSec = $derived(
    run?.roundDeadline ? Math.max(0, Math.round((run.roundDeadline - now) / 1000)) : null,
  );

  onMount(() => {
    load();
    // Poll the shared run (REST; WS push is Slice 4c).
    poll = setInterval(() => {
      if (!busy && run?.status === 'in_combat') refresh();
    }, 2500);
    clock = setInterval(() => (now = Date.now()), 1000);
  });
  onDestroy(() => {
    if (poll) clearInterval(poll);
    if (clock) clearInterval(clock);
  });

  async function load(): Promise<void> {
    loading = true;
    try {
      run = await getDungeonPartyRun(characterId, runId);
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

  async function refresh(): Promise<void> {
    try {
      run = await getDungeonPartyRun(characterId, runId);
      retarget();
    } catch {
      /* transient — keep last state */
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

  async function submit(abilityId: string): Promise<void> {
    if (busy || !run || run.status !== 'in_combat' || run.you?.submitted) return;
    busy = true;
    error = null;
    try {
      run = await submitDungeonParty(characterId, runId, abilityId, targetId);
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
      run = await abandonDungeonParty(characterId, runId);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  function itemName(id: string): string {
    return ITEMS[id as keyof typeof ITEMS]?.name ?? id;
  }
  function hpPct(cur: number, max: number): number {
    return max <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((cur / max) * 100)));
  }
  function slotTotal(map: Record<number, number>): number {
    return Object.values(map).reduce((a, b) => a + b, 0);
  }

  const endText = $derived(run?.status === 'cleared' ? ui.cleared : ui.wiped);
</script>

<div class="space-y-5">
  {#if loading}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {:else if error && !run}
    <p class="text-[var(--danger)]">{error ?? ui.notFound}</p>
  {:else if run}
    {@const r = run}

    <div class="flex items-center justify-between">
      <h1 class="text-lg font-bold">
        {r.dungeonName}
        <span class="ml-2 text-sm font-normal text-[var(--text-dim)]">
          {ui.encounter} {r.encounterIndex + 1}/{r.encounterCount} · {r.size}-player
        </span>
      </h1>
      {#if !finished}
        <button class="btn btn-sm" disabled={busy} onclick={abandon}>{ui.abandon}</button>
      {/if}
    </div>

    {#if error}<p class="text-sm text-[var(--danger)]">{error}</p>{/if}

    <!-- Enemies (click to target) -->
    {#if r.enemies.length > 0 && !finished}
      <section class="space-y-2">
        {#each r.enemies as e (e.idx)}
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
          </button>
        {/each}
      </section>
    {/if}

    <!-- Party panel -->
    <section class="space-y-2">
      <p class="text-xs uppercase tracking-wide text-[var(--text-dim)]">{ui.party}</p>
      {#each r.members as m (m.slot)}
        <div class="panel panel-pad {m.currentHealth <= 0 ? 'opacity-40' : ''} {m.isYou ? 'ring-1 ring-[var(--accent)]' : ''}">
          <div class="flex items-center justify-between">
            <span class="font-semibold">
              {roleIcon[m.role] ?? ''} {m.name}
              {#if m.isYou}<span class="ml-1 text-xs text-[var(--accent)]">(you)</span>{/if}
              {#if m.isAi}<span class="ml-1 text-xs text-[var(--text-faint)]">AI</span>{/if}
            </span>
            <span class="text-sm text-[var(--text-dim)]">
              {m.currentHealth} / {m.maxHealth}
              {#if m.absorb > 0}<span class="ml-1 text-[var(--info)]">🛡️ {m.absorb}</span>{/if}
              {#if !finished && m.currentHealth > 0 && !m.isAi}
                <span class="ml-1 text-xs {m.submitted ? 'text-[var(--success)]' : 'text-[var(--text-faint)]'}">{m.submitted ? '✓' : '…'}</span>
              {/if}
            </span>
          </div>
          <div class="bar mt-2">
            <div class="bar-fill" style={`width:${hpPct(m.currentHealth, m.maxHealth)}%;background:var(--success)`}></div>
          </div>
        </div>
      {/each}
    </section>

    <!-- Round status -->
    {#if r.status === 'in_combat'}
      <section class="panel panel-pad text-sm">
        {#if !r.you || r.you.currentHealth <= 0}
          <p class="text-[var(--text-dim)]">{ui.youFell}</p>
        {:else if r.you.submitted}
          <p class="text-[var(--success)]">{ui.submitted} — {ui.waiting}</p>
        {:else}
          <p class="text-[var(--text-dim)]">Choose your action.</p>
        {/if}
        {#if deadlineSec != null}
          <p class="mt-1 text-xs text-[var(--text-faint)]">{ui.aiSoon} {deadlineSec}s</p>
        {/if}
      </section>
    {/if}

    <!-- Ability bar (only when it's your move and you're alive) -->
    {#if r.status === 'in_combat' && r.you && r.you.currentHealth > 0 && !r.you.submitted}
      <section>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {#each r.you.abilities as a (a.id)}
            <button
              class="btn flex items-center gap-2 text-left"
              disabled={busy || !a.ready || a.outOfSlots || a.outOfKi}
              title={a.outOfSlots ? `${a.description} (out of spell slots)` : a.outOfKi ? `${a.description} (not enough Ki)` : a.description}
              onclick={() => submit(a.id)}
            >
              <PixelAbilityIcon name={a.name} kind={a.kind as never} size={22} />
              <span class="min-w-0 flex-1 truncate">{a.name}</span>
              {#if !a.ready}
                <span class="shrink-0 text-xs text-[var(--text-dim)]">{ui.cooldown} {a.cooldownRemaining}</span>
              {:else if a.outOfSlots}
                <span class="shrink-0 text-xs text-[var(--danger)]">{ui.noSlots}</span>
              {:else if a.outOfKi}
                <span class="shrink-0 text-xs text-[var(--danger)]">{ui.noKi}</span>
              {/if}
            </button>
          {/each}
        </div>
        {#if r.you && (slotTotal(r.you.maxSpellSlots) > 0 || r.you.maxKiPoints > 0)}
          <p class="mt-2 text-xs text-[var(--text-dim)]">
            {#if slotTotal(r.you.maxSpellSlots) > 0}✨ {slotTotal(r.you.spellSlots)}/{slotTotal(r.you.maxSpellSlots)} slots{/if}
            {#if r.you.maxKiPoints > 0}· 🌀 {r.you.kiPoints}/{r.you.maxKiPoints} Ki{/if}
          </p>
        {/if}
      </section>
    {/if}

    <!-- End screen -->
    {#if finished}
      <section class="panel panel-pad text-center">
        <p class="text-xl font-bold" style={`color:${r.status === 'wiped' ? 'var(--danger)' : 'var(--gold-bright)'}`}>{endText}</p>
        <p class="mt-1 text-sm text-[var(--text-dim)]">{r.encountersCleared} {ui.cleared2}</p>
        {#if r.myLockedOut}
          <p class="mt-3 text-sm text-[var(--text-dim)]">{ui.lockedOut}</p>
        {:else if r.reward && (r.reward.xp > 0 || r.reward.gold > 0 || r.reward.items.length > 0)}
          <p class="mt-3 font-semibold text-[var(--success)]">{ui.reward}: +{r.reward.xp} XP, +{r.reward.gold} gold</p>
          {#if r.reward.items.length > 0}
            <p class="mt-1 text-sm text-[var(--text-dim)]">🎁 {ui.loot}: {r.reward.items.map(itemName).join(', ')}</p>
          {/if}
        {/if}
        <a href={`/characters/${characterId}/group`} class="btn btn-primary mt-4 inline-flex">{ui.back}</a>
      </section>
    {/if}

    {#if r.events.length > 0}
      <CombatLog events={r.events} />
    {/if}
  {/if}
</div>
