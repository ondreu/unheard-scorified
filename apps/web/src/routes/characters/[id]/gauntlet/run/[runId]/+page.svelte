<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    ApiError,
    gauntletAct,
    gauntletDraft,
    gauntletRetire,
    getGauntletRun,
    type GauntletDraftOption,
    type GauntletRunView,
  } from '$lib/api';
  import { ITEMS } from '@game/shared';
  import CombatLog from '$lib/components/CombatLog.svelte';
  import PixelAbilityIcon from '$lib/components/PixelAbilityIcon.svelte';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    notFound: 'Gauntlet run not found.',
    wave: 'Wave',
    enemy: 'Enemy',
    you: 'You',
    elite: 'ELITE',
    chooseReward: 'Choose your reward',
    chooseHint: 'Pick one — it lasts for the rest of this run.',
    retire: 'Retire & claim',
    retiring: 'Retiring…',
    dead: '💀 You have fallen',
    retired: '🏳️ Run complete',
    reward: 'Reward',
    loot: 'Materials',
    waysCleared: 'waves cleared',
    backToArena: 'Back to The Gauntlet',
    cooldown: 'CD',
    noSlots: 'No slot',
    vs: 'vs',
    takeIt: 'Take it',
  };

  /** Součet slotů napříč tiery (kompaktní „zbývá / max" v panelu hráče). */
  function slotTotal(map: Record<number, number>): number {
    return Object.values(map).reduce((a, b) => a + b, 0);
  }

  let run = $state<GauntletRunView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);

  const characterId = $derived($page.params.id ?? '');
  const runId = $derived($page.params.runId ?? '');
  const finished = $derived(run?.status === 'dead' || run?.status === 'retired');

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      run = await getGauntletRun(characterId, runId);
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

  async function act(abilityId: string): Promise<void> {
    if (busy || !run || run.status !== 'in_combat') return;
    busy = true;
    error = null;
    try {
      run = await gauntletAct(characterId, runId, abilityId);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  async function choose(optionId: string): Promise<void> {
    if (busy || !run || run.status !== 'drafting') return;
    busy = true;
    error = null;
    try {
      run = await gauntletDraft(characterId, runId, optionId);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  async function retire(): Promise<void> {
    if (busy || !run) return;
    busy = true;
    error = null;
    try {
      run = await gauntletRetire(characterId, runId);
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

  const draftIcon: Record<GauntletDraftOption['kind'], string> = {
    buff: '✨',
    gear: '🛡️',
    ability: '📖',
  };

  function fmtStat(n: number): string {
    return n > 0 ? `+${n}` : `${n}`;
  }
</script>

<div class="space-y-5">
  {#if loading}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {:else if error && !run}
    <p class="text-[var(--danger)]">{error ?? ui.notFound}</p>
  {:else if run}
    {@const r = run}

    <!-- Header: wave + retire -->
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-bold">
        🔥 {ui.wave} <span class="text-[var(--gold-bright)]">{r.wave}</span>
      </h1>
      {#if !finished}
        <button class="btn btn-sm" disabled={busy} onclick={retire}>
          {busy ? ui.retiring : ui.retire}
        </button>
      {/if}
    </div>

    {#if error}<p class="text-sm text-[var(--danger)]">{error}</p>{/if}

    <!-- Enemy -->
    {#if r.enemy}
      {@const e = r.enemy}
      <section class="panel panel-pad">
        <div class="flex items-center justify-between">
          <span class="font-semibold">
            {e.name}
            {#if e.isElite}<span class="ml-2 rounded bg-[var(--danger)]/30 px-1.5 py-0.5 text-xs font-bold text-[var(--danger)]">{ui.elite}</span>{/if}
          </span>
          <span class="text-sm text-[var(--text-dim)]">{e.currentHealth} / {e.maxHealth}</span>
        </div>
        <div class="bar mt-2">
          <div class="bar-fill" style={`width:${hpPct(e.currentHealth, e.maxHealth)}%;background:var(--danger)`}></div>
        </div>
      </section>
    {/if}

    <!-- Player -->
    <section class="panel panel-pad">
      <div class="flex items-center justify-between">
        <span class="font-semibold">{r.player.name}</span>
        <span class="text-sm text-[var(--text-dim)]">
          {r.player.currentHealth} / {r.player.maxHealth}
          {#if r.player.absorb > 0}<span class="ml-1 text-[var(--info)]">🛡️ {r.player.absorb}</span>{/if}
          {#if slotTotal(r.player.maxSpellSlots) > 0}
            <span class="ml-1 text-[var(--accent)]" title="Spell slots remaining this run">
              ✨ {slotTotal(r.player.spellSlots)}/{slotTotal(r.player.maxSpellSlots)}
            </span>
          {/if}
        </span>
      </div>
      <div class="bar mt-2">
        <div class="bar-fill" style={`width:${hpPct(r.player.currentHealth, r.player.maxHealth)}%;background:var(--success)`}></div>
      </div>
    </section>

    <!-- Ability bar (active combat) -->
    {#if r.status === 'in_combat'}
      <section>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {#each r.abilities as a (a.id)}
            <button
              class="btn flex items-center gap-2 text-left"
              disabled={busy || !a.ready || a.outOfSlots}
              title={a.outOfSlots ? `${a.description} (out of spell slots)` : a.description}
              onclick={() => act(a.id)}
            >
              <PixelAbilityIcon name={a.name} kind={a.kind as never} size={22} />
              <span class="min-w-0 flex-1 truncate">{a.name}</span>
              {#if !a.ready}
                <span class="shrink-0 text-xs text-[var(--text-dim)]">{ui.cooldown} {a.cooldownRemaining}</span>
              {:else if a.outOfSlots}
                <span class="shrink-0 text-xs text-[var(--danger)]">{ui.noSlots}</span>
              {/if}
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Draft (between waves) -->
    {#if r.status === 'drafting' && r.draft}
      <section class="panel panel-pad">
        <h2 class="panel-title">{ui.chooseReward}</h2>
        <p class="mb-3 text-xs text-[var(--text-dim)]">{ui.chooseHint}</p>
        <div class="grid gap-3 sm:grid-cols-3">
          {#each r.draft as opt (opt.id)}
            <div class="flex flex-col rounded-xl border border-[var(--border)] bg-black/20 p-3">
              <div class="text-sm font-semibold">{draftIcon[opt.kind]} {opt.name}</div>
              <p class="mt-1 flex-1 text-xs text-[var(--text-dim)]">{opt.description}</p>
              {#if opt.comparison && opt.comparison.length > 0}
                <table class="mt-2 w-full text-xs">
                  <tbody>
                    {#each opt.comparison as c (c.label)}
                      <tr>
                        <td class="text-[var(--text-dim)]">{c.label}</td>
                        <td class="text-right text-[var(--text-dim)]">{c.current}</td>
                        <td class="px-1 text-center text-[var(--text-dim)]">{ui.vs}</td>
                        <td
                          class="text-right font-semibold"
                          style={`color:${c.offered >= c.current ? 'var(--success)' : 'var(--danger)'}`}
                        >{c.offered}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {/if}
              <button class="btn btn-primary btn-sm mt-3" disabled={busy} onclick={() => choose(opt.id)}>
                {ui.takeIt}
              </button>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- End screen -->
    {#if finished}
      <section class="panel panel-pad text-center">
        <p class="text-xl font-bold" style={`color:${r.status === 'dead' ? 'var(--danger)' : 'var(--gold-bright)'}`}>
          {r.status === 'dead' ? ui.dead : ui.retired}
        </p>
        <p class="mt-1 text-sm text-[var(--text-dim)]">{r.wavesCleared} {ui.waysCleared}</p>
        {#if r.reward}
          <p class="mt-3 font-semibold text-[var(--success)]">
            {ui.reward}: +{r.reward.xp} XP, +{r.reward.gold} gold
          </p>
          {#if r.reward.items.length > 0}
            <p class="mt-1 text-sm text-[var(--text-dim)]">🎁 {ui.loot}: {r.reward.items.map(itemName).join(', ')}</p>
          {/if}
        {/if}
        <a href={`/characters/${characterId}/gauntlet`} class="btn btn-primary mt-4 inline-flex">{ui.backToArena}</a>
      </section>
    {/if}

    <!-- Combat log -->
    {#if r.events.length > 0}
      <CombatLog events={r.events} />
    {/if}
  {/if}
</div>
