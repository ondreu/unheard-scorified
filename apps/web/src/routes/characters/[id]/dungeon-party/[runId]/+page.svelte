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
  import { dungeonPartyActors } from '$lib/combat-actors';
  import PixelAbilityIcon from '$lib/components/PixelAbilityIcon.svelte';
  import SpellSlotBar from '$lib/components/SpellSlotBar.svelte';
  import SpellTooltip from '$lib/components/SpellTooltip.svelte';
  import UpcastPicker from '$lib/components/UpcastPicker.svelte';
  import ConditionBadges from '$lib/components/ConditionBadges.svelte';
  import { activeCharacterLevel, activeCharacterSpellSaveDc, openNpc } from '$lib/ui-stores';
  import type { Socket } from 'socket.io-client';
  import { connectDungeonParty, joinPartyRun, submitPartyTurn } from '$lib/dungeon-party-socket';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    notFound: 'Live dungeon run not found.',
    encounter: 'Encounter',
    boss: 'BOSS',
    target: 'Target',
    healTarget: 'Support target',
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
    endTurn: 'End turn',
    dodge: 'Dodge',
    youFell: 'You have fallen — your allies fight on.',
    aiSoon: 'AI takes over idle players in',
    bonusAction: 'Bonus action',
    bonusActionHint: 'cast alongside your action this round',
    bonusNone: 'None',
    bonusQueued: 'Bonus queued',
  };

  const roleIcon: Record<string, string> = { tank: '🛡️', healer: '✨', dps: '⚔️' };

  let run = $state<DungeonPartyRunView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let targetId = $state(0);
  // Vědomě zvolená bonus action (ADR 0042) — proběhne vedle hlavní akce; null = žádná.
  let bonusAbilityId = $state<string | null>(null);
  // Vědomě zvolený upcast tier per ability (Upcast — volba slotu). undefined = auto.
  let upcastTier = $state<Record<string, number | undefined>>({});
  // Friendly cíl léčení: `slot` člena party. Heal ability posílá tenhle slot místo
  // nepřátelského `targetId`. null = ještě nezvoleno → default na vlastní slot.
  let healTargetId = $state<number | null>(null);
  let now = $state(Date.now());
  let poll: ReturnType<typeof setInterval> | null = null;
  let clock: ReturnType<typeof setInterval> | null = null;
  let socket: Socket | null = null;
  let unjoin: (() => void) | null = null;

  const characterId = $derived($page.params.id ?? '');
  const runId = $derived($page.params.runId ?? '');
  const finished = $derived(run?.status === 'cleared' || run?.status === 'wiped');
  const bonusOptions = $derived(
    (run?.you?.abilities ?? []).filter((a) => a.actionCost === 'bonus' && a.ready && !a.outOfSlots && !a.outOfKi),
  );
  const deadlineSec = $derived(
    run?.roundDeadline ? Math.max(0, Math.round((run.roundDeadline - now) / 1000)) : null,
  );

  onMount(() => {
    load();
    // Realtime push (Slice 4c): join the run room; server signals → re-pull view.
    socket = connectDungeonParty();
    unjoin = joinPartyRun(
      socket,
      characterId,
      runId,
      (r) => {
        run = r;
        loading = false;
        retarget();
      },
      (e) => (error = e),
    );
    // Slower REST safety net (WS push covers the live path).
    poll = setInterval(() => {
      if (!busy && run?.status === 'in_combat') refresh();
    }, 8000);
    clock = setInterval(() => (now = Date.now()), 1000);
  });
  onDestroy(() => {
    if (unjoin) unjoin();
    if (socket) socket.disconnect();
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
    // Heal cíl: vlastní slot jako default; mrtvý cíl → zpět na sebe.
    const mySlot = run.you?.slot ?? run.members.find((m) => m.isYou)?.slot ?? 0;
    const ht = run.members.find((m) => m.slot === healTargetId);
    if (healTargetId == null || !ht || ht.currentHealth <= 0) healTargetId = mySlot;
  }

  // Podpůrné ability (heal/shield/mitigation) cílí spojence; útočné nepřítele.
  const FRIENDLY_KINDS = new Set(['heal', 'shield', 'mitigation']);
  function targetFor(kind: string): number {
    return FRIENDLY_KINDS.has(kind) ? (healTargetId ?? 0) : targetId;
  }

  async function submit(abilityId: string, kind: string): Promise<void> {
    if (busy || !run || run.status !== 'in_combat' || run.you?.submitted) return;
    busy = true;
    error = null;
    const tgt = targetFor(kind);
    const bonus = bonusAbilityId && bonusAbilityId !== abilityId ? bonusAbilityId : undefined;
    try {
      // Preferuj WS (server-authoritative ack); REST fallback, když socket nejede.
      const tier = upcastTier[abilityId];
      run =
        socket && socket.connected
          ? await submitPartyTurn(socket, characterId, runId, abilityId, tgt, bonus, tier)
          : await submitDungeonParty(characterId, runId, abilityId, tgt, bonus, tier);
      bonusAbilityId = null;
      retarget();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  /** Formální ukončení tahu: Pass (nic) nebo Dodge (disadvantage na útoky proti tobě). */
  async function endTurn(action: 'pass' | 'dodge'): Promise<void> {
    if (busy || !run || run.status !== 'in_combat' || run.you?.submitted) return;
    busy = true;
    error = null;
    try {
      run =
        socket && socket.connected
          ? await submitPartyTurn(socket, characterId, runId, action, 0)
          : await submitDungeonParty(characterId, runId, action, 0);
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

    <!-- Party panel (click a member to pick your heal target) -->
    <section class="space-y-2">
      <p class="text-xs uppercase tracking-wide text-[var(--text-dim)]">{ui.party}</p>
      {#each r.members as m (m.slot)}
        <button
          type="button"
          class="panel panel-pad w-full text-left {m.currentHealth <= 0 ? 'opacity-40' : ''} {m.isYou ? 'ring-1 ring-[var(--accent)]' : ''} {healTargetId === m.slot && m.currentHealth > 0 && !finished ? 'ring-2 ring-[var(--success)]' : ''}"
          disabled={m.currentHealth <= 0 || finished}
          onclick={() => (healTargetId = m.slot)}
        >
          <div class="flex items-center justify-between">
            <span class="font-semibold">
              {roleIcon[m.role] ?? ''} {m.name}
              {#if m.isYou}<span class="ml-1 text-xs text-[var(--accent)]">(you)</span>{/if}
              {#if m.isAi}<span class="ml-1 text-xs text-[var(--text-faint)]">AI</span>{/if}
              {#if healTargetId === m.slot && m.currentHealth > 0 && !finished}<span class="ml-1 text-xs text-[var(--success)]">💚 {ui.healTarget}</span>{/if}
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
          {#if m.conditions.length > 0}
            <div class="mt-2"><ConditionBadges conditions={m.conditions} /></div>
          {/if}
        </button>
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

    <!-- Bonus action selector (ADR 0042) — vědomá volba vedle hlavní akce -->
    {#if r.status === 'in_combat' && r.you && r.you.currentHealth > 0 && !r.you.submitted && bonusOptions.length > 0}
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

    <!-- Ability bar (only when it's your move and you're alive) -->
    {#if r.status === 'in_combat' && r.you && r.you.currentHealth > 0 && !r.you.submitted}
      <section>
        {#if bonusAbilityId}
          <p class="mb-2 text-xs text-[var(--gold-bright)]">
            ✨ {ui.bonusQueued}: {bonusOptions.find((b) => b.id === bonusAbilityId)?.name ?? ''}
          </p>
        {/if}
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {#each r.you.abilities as a (a.id)}
            <div>
              <SpellTooltip
                abilityId={a.id}
                level={$activeCharacterLevel ?? 1}
                slotTier={upcastTier[a.id]}
                spellSaveDc={$activeCharacterSpellSaveDc ?? undefined}
              >
                <button
                  class="btn flex w-full items-center gap-2 text-left"
                  disabled={busy || !a.ready || a.outOfSlots || a.outOfKi}
                  onclick={() => submit(a.id, a.kind)}
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
              {#if r.you && a.ready && !a.outOfSlots}
                <UpcastPicker
                  spellTier={a.spellTier}
                  upcastPerSlot={a.upcastPerSlot}
                  slots={r.you.spellSlots}
                  bind:selected={upcastTier[a.id]}
                  disabled={busy}
                />
              {/if}
            </div>
          {/each}
        </div>
        <div class="mt-2 flex gap-2">
          <button class="btn btn-sm flex-1" disabled={busy} title="Incoming attacks have disadvantage until your next turn" onclick={() => endTurn('dodge')}>🤺 {ui.dodge}</button>
          <button class="btn btn-sm flex-1" disabled={busy} title="Take no action and end your turn" onclick={() => endTurn('pass')}>⏭️ {ui.endTurn}</button>
        </div>
        {#if r.you && (slotTotal(r.you.maxSpellSlots) > 0 || r.you.maxKiPoints > 0)}
          <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-dim)]">
            {#if slotTotal(r.you.maxSpellSlots) > 0}
              <SpellSlotBar slots={r.you.spellSlots} max={r.you.maxSpellSlots} title="Spell slots per tier" />
            {/if}
            {#if r.you.maxKiPoints > 0}<span>🌀 {r.you.kiPoints}/{r.you.maxKiPoints} Ki</span>{/if}
          </div>
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
      <CombatLog events={r.events} actors={dungeonPartyActors(r)} groupRounds />
    {/if}
  {/if}
</div>
