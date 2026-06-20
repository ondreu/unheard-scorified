<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    abandonDungeonTurn,
    actDungeonTurn,
    getDungeonTurnRun,
    type DungeonTurnRunView,
  } from '$lib/api';
  import { ITEMS } from '@game/shared';
  import CombatLog from '$lib/components/CombatLog.svelte';
  import PixelAbilityIcon from '$lib/components/PixelAbilityIcon.svelte';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    notFound: 'Dungeon run not found.',
    encounter: 'Encounter',
    boss: 'BOSS',
    you: 'You',
    target: 'Target',
    healTarget: 'Heal target',
    abandon: 'Abandon',
    abandoning: 'Leaving…',
    cleared: '🏆 Dungeon cleared!',
    dead: '💀 You have fallen',
    abandoned: '🏳️ Run abandoned',
    reward: 'Reward',
    loot: 'Loot',
    lockedOut: '🔒 Already saved this week — no reward.',
    cleared2: 'encounters cleared',
    back: 'Back to Dungeons',
    cooldown: 'CD',
    noSlots: 'No slot',
    noKi: 'No Ki',
    party: 'Party',
  };

  const roleIcon: Record<string, string> = { tank: '🛡️', healer: '✨', dps: '⚔️' };

  function slotTotal(map: Record<number, number>): number {
    return Object.values(map).reduce((a, b) => a + b, 0);
  }

  let run = $state<DungeonTurnRunView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);
  // Zvolený cíl (index nepřítele); auto-přepne na živého při změně stavu.
  let targetId = $state(0);
  // Friendly cíl léčení: index člena party (0 = hráč, 1..N = parťák). Heal ability
  // posílá tenhle index místo nepřátelského `targetId`.
  let healTargetId = $state(0);

  const characterId = $derived($page.params.id ?? '');
  const runId = $derived($page.params.runId ?? '');
  const finished = $derived(run?.status === 'cleared' || run?.status === 'dead');

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      run = await getDungeonTurnRun(characterId, runId);
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

  /** Je zvolený cíl mrtvý / chybí? Přepni na prvního živého nepřítele / hráče. */
  function retarget(): void {
    if (!run) return;
    const cur = run.enemies.find((e) => e.idx === targetId);
    if (!cur || cur.currentHealth <= 0) {
      const alive = run.enemies.find((e) => e.currentHealth > 0);
      if (alive) targetId = alive.idx;
    }
    // Heal cíl: 0 = hráč, 1..N = parťák. Mrtvý parťák → zpět na hráče.
    if (healTargetId > 0) {
      const ally = run.allies[healTargetId - 1];
      if (!ally || ally.currentHealth <= 0) healTargetId = 0;
    }
  }

  /** Heal/buff ability cílí spojence (index člena party), ostatní nepřítele. */
  function targetFor(kind: string): number {
    return kind === 'heal' ? healTargetId : targetId;
  }

  async function act(abilityId: string, kind: string): Promise<void> {
    if (busy || !run || run.status !== 'in_combat') return;
    busy = true;
    error = null;
    try {
      run = await actDungeonTurn(characterId, runId, abilityId, targetFor(kind));
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
      run = await abandonDungeonTurn(characterId, runId);
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

  const endText = $derived(
    run?.status === 'cleared' ? ui.cleared : run?.status === 'dead' ? ui.dead : ui.abandoned,
  );
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
        {r.dungeonName}
        <span class="ml-2 text-sm font-normal text-[var(--text-dim)]">
          {ui.encounter} {r.encounterIndex + 1}/{r.encounterCount}
        </span>
      </h1>
      {#if !finished}
        <button class="btn btn-sm" disabled={busy} onclick={abandon}>
          {busy ? ui.abandoning : ui.abandon}
        </button>
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

    <!-- Player (click to pick heal target in a group) -->
    <button
      type="button"
      class="panel panel-pad w-full text-left {r.allies.length > 0 && healTargetId === 0 && !finished ? 'ring-2 ring-[var(--success)]' : ''}"
      disabled={r.allies.length === 0 || finished}
      onclick={() => (healTargetId = 0)}
    >
      <div class="flex items-center justify-between">
        <span class="font-semibold">
          {roleIcon[r.playerRole] ?? ''} {r.player.name}
          {#if r.allies.length > 0 && healTargetId === 0 && !finished}<span class="ml-2 text-xs text-[var(--success)]">💚 {ui.healTarget}</span>{/if}
        </span>
        <span class="text-sm text-[var(--text-dim)]">
          {r.player.currentHealth} / {r.player.maxHealth}
          {#if r.player.absorb > 0}<span class="ml-1 text-[var(--info)]">🛡️ {r.player.absorb}</span>{/if}
          {#if slotTotal(r.player.maxSpellSlots) > 0}
            <span class="ml-1 text-[var(--accent)]" title="Spell slots (refresh between encounters)">
              ✨ {slotTotal(r.player.spellSlots)}/{slotTotal(r.player.maxSpellSlots)}
            </span>
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
    </button>

    <!-- AI party allies (group, Slice 3) -->
    {#if r.allies.length > 0}
      <section class="space-y-2">
        <p class="text-xs uppercase tracking-wide text-[var(--text-dim)]">{ui.party}</p>
        {#each r.allies as a, i (a.name)}
          <button
            type="button"
            class="panel panel-pad w-full text-left {a.currentHealth <= 0 ? 'opacity-40' : ''} {healTargetId === i + 1 && a.currentHealth > 0 && !finished ? 'ring-2 ring-[var(--success)]' : ''}"
            disabled={a.currentHealth <= 0}
            onclick={() => (healTargetId = i + 1)}
          >
            <div class="flex items-center justify-between">
              <span class="font-semibold">
                {roleIcon[a.role] ?? ''} {a.name}
                {#if healTargetId === i + 1 && a.currentHealth > 0 && !finished}<span class="ml-2 text-xs text-[var(--success)]">💚 {ui.healTarget}</span>{/if}
              </span>
              <span class="text-sm text-[var(--text-dim)]">
                {a.currentHealth} / {a.maxHealth}
                {#if a.absorb > 0}<span class="ml-1 text-[var(--info)]">🛡️ {a.absorb}</span>{/if}
              </span>
            </div>
            <div class="bar mt-2">
              <div class="bar-fill" style={`width:${hpPct(a.currentHealth, a.maxHealth)}%;background:var(--success)`}></div>
            </div>
          </button>
        {/each}
      </section>
    {/if}

    <!-- Ability bar -->
    {#if r.status === 'in_combat'}
      <section>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {#each r.abilities as a (a.id)}
            <button
              class="btn flex items-center gap-2 text-left"
              disabled={busy || !a.ready || a.outOfSlots || a.outOfKi}
              title={a.outOfSlots
                ? `${a.description} (out of spell slots)`
                : a.outOfKi
                  ? `${a.description} (not enough Ki)`
                  : a.description}
              onclick={() => act(a.id, a.kind)}
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
      </section>
    {/if}

    <!-- End screen -->
    {#if finished}
      <section class="panel panel-pad text-center">
        <p class="text-xl font-bold" style={`color:${r.status === 'dead' ? 'var(--danger)' : 'var(--gold-bright)'}`}>
          {endText}
        </p>
        <p class="mt-1 text-sm text-[var(--text-dim)]">{r.encountersCleared} {ui.cleared2}</p>
        {#if r.myLockedOut}
          <p class="mt-3 text-sm text-[var(--text-dim)]">{ui.lockedOut}</p>
        {:else if r.reward && (r.reward.xp > 0 || r.reward.gold > 0 || r.reward.items.length > 0)}
          <p class="mt-3 font-semibold text-[var(--success)]">
            {ui.reward}: +{r.reward.xp} XP, +{r.reward.gold} gold
          </p>
          {#if r.reward.items.length > 0}
            <p class="mt-1 text-sm text-[var(--text-dim)]">🎁 {ui.loot}: {r.reward.items.map(itemName).join(', ')}</p>
          {/if}
        {/if}
        <a href={`/characters/${characterId}/dungeons`} class="btn btn-primary mt-4 inline-flex">{ui.back}</a>
      </section>
    {/if}

    <!-- Combat log -->
    {#if r.events.length > 0}
      <CombatLog events={r.events} />
    {/if}
  {/if}
</div>
