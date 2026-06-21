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
  import { gauntletActors } from '$lib/combat-actors';
  import PixelAbilityIcon from '$lib/components/PixelAbilityIcon.svelte';
  import SpellSlotBar from '$lib/components/SpellSlotBar.svelte';
  import SpellTooltip from '$lib/components/SpellTooltip.svelte';
  import ConditionBadges from '$lib/components/ConditionBadges.svelte';
  import { activeCharacterLevel, activeCharacterSpellSaveDc, openNpc } from '$lib/ui-stores';

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
    noKi: 'No Ki',
    vs: 'vs',
    takeIt: 'Take it',
    bonusAction: 'Bonus action',
    bonusActionHint: 'cast alongside your action this turn',
    bonusNone: 'None',
    bonusQueued: 'Bonus queued',
  };

  /** Součet slotů napříč tiery (kompaktní „zbývá / max" v panelu hráče). */
  function slotTotal(map: Record<number, number>): number {
    return Object.values(map).reduce((a, b) => a + b, 0);
  }

  let run = $state<GauntletRunView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);

  // Vědomě zvolená bonus action (ADR 0042) — proběhne vedle hlavní akce; null = žádná.
  let bonusAbilityId = $state<string | null>(null);

  const characterId = $derived($page.params.id ?? '');
  const runId = $derived($page.params.runId ?? '');
  const finished = $derived(run?.status === 'dead' || run?.status === 'retired');
  const bonusOptions = $derived(
    (run?.abilities ?? []).filter((a) => a.actionCost === 'bonus' && a.ready && !a.outOfSlots && !a.outOfKi),
  );

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
    const bonus = bonusAbilityId && bonusAbilityId !== abilityId ? bonusAbilityId : undefined;
    try {
      run = await gauntletAct(characterId, runId, abilityId, bonus);
      bonusAbilityId = null;
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
            <button
              type="button"
              class="ml-1 rounded-full px-1 text-xs text-[var(--text-faint)] hover:text-[var(--info)]"
              title="View stat block"
              aria-label="View stat block"
              onclick={() => openNpc(e.name)}
            >ⓘ</button>
          </span>
          <span class="text-sm text-[var(--text-dim)]">{e.currentHealth} / {e.maxHealth}</span>
        </div>
        <div class="bar mt-2">
          <div class="bar-fill" style={`width:${hpPct(e.currentHealth, e.maxHealth)}%;background:var(--danger)`}></div>
        </div>
        {#if e.conditions.length > 0}
          <div class="mt-2"><ConditionBadges conditions={e.conditions} /></div>
        {/if}
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
            <SpellSlotBar
              slots={r.player.spellSlots}
              max={r.player.maxSpellSlots}
              title="Spell slots remaining this run (per tier)"
            />
          {/if}
          {#if r.player.maxKiPoints > 0}
            <span class="ml-1 text-[var(--info)]" title="Ki remaining this run">
              🌀 {r.player.kiPoints}/{r.player.maxKiPoints}
            </span>
          {/if}
          {#if r.player.maxRageCharges > 0}
            <span class="ml-1 text-[var(--danger)]" title="Rage charges left{r.player.raging ? ' — raging!' : ''}">
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
    </section>

    <!-- Bonus action selector (ADR 0042) — vědomá volba vedle hlavní akce -->
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

    <!-- Ability bar (active combat) -->
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
                onclick={() => act(a.id)}
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
            </SpellTooltip>
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
      <CombatLog events={r.events} actors={gauntletActors(r)} groupRounds />
    {/if}
  {/if}
</div>
