<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import {
    ApiError,
    claimActivity,
    getActivity,
    getCharacter,
    getGroup,
    getArena,
    getDungeonRun,
    recentDungeonRuns,
    type ActivityView,
    type CharacterView,
    type ClaimResult,
    type GroupState,
  } from '$lib/api';
  import { RACES, CLASSES, ITEMS } from '@game/shared';
  import {
    CLASS_COLOR,
    ROLE_META,
    RARITY_COLOR,
  } from '$lib/cosmetics';
  import { openProfile } from '$lib/ui-stores';
  import { QUICK_ACTIONS } from '$lib/nav';
  import Avatar from '$lib/components/Avatar.svelte';
  import PortraitShowcase from '$lib/components/PortraitShowcase.svelte';
  import Badge from '$lib/components/Badge.svelte';
  import HubCard from '$lib/components/HubCard.svelte';
  import PixelItemIcon from '$lib/components/PixelItemIcon.svelte';
  import { itemIconMetaById } from '$lib/pixelart/items';

  // Game-facing UI strings (English; separate from logic for future i18n).
  const ui = {
    activity: 'Activity',
    onQuest: 'On a quest',
    working: '🔨 Working',
    finishesIn: 'Finishes in',
    completed: 'Quest complete!',
    activityDone: 'Activity complete!',
    claim: 'Claim rewards',
    claiming: 'Claiming…',
    goQuesting: 'Go questing →',
    idle: 'Idle — not on any activity.',
    gold: 'Gold',
    levelUp: 'Level up!',
    gained: 'Gained',
    offlineFor: 'Away for',
    group: 'Your group',
    soloHint: 'Not in a group — party up for dungeons and arena.',
    formGroup: 'Form a group →',
    questStory: 'What happened',
    hpLeft: 'HP left',
    defeated: 'Defeated',
    defeatedMsg:
      'You were defeated and earned no reward. Grow stronger and try this challenge again.',
    ongoing: 'In progress elsewhere',
    inDungeon: '⚔️ Dungeon',
    inArenaQueue: '⚔️ In the arena queue',
    watch: 'Watch →',
    open: 'Open →',
  };

  let character = $state<CharacterView | null>(null);
  let activity = $state<ActivityView | null>(null);
  let group = $state<GroupState | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let claiming = $state(false);
  let claimResult = $state<ClaimResult | null>(null);
  let now = $state(Date.now());

  // Other activities running in parallel (server-authoritative, idle): an
  // in-progress dungeon run or an arena queue. Surfaced here so you can
  // leave the run watch page without losing track of it — progress never stops.
  let ongoingDungeon = $state<{ runId: string; name: string } | null>(null);
  let arenaQueued = $state(false);
  const hasOngoing = $derived(!!ongoingDungeon || arenaQueued);

  const characterId = $derived($page.params.id ?? '');
  let ticker: ReturnType<typeof setInterval> | undefined;

  onMount(async () => {
    await load();
    ticker = setInterval(() => (now = Date.now()), 1000);
  });
  onDestroy(() => clearInterval(ticker));

  async function load(): Promise<void> {
    loading = true;
    try {
      [character, activity] = await Promise.all([
        getCharacter(characterId),
        getActivity(characterId),
      ]);
      try {
        group = await getGroup(characterId);
      } catch {
        group = null;
      }
      void loadOngoing();
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

  const remainingMs = $derived(
    activity ? Math.max(0, new Date(activity.progress.finishesAt).getTime() - now) : 0,
  );
  const completed = $derived(activity !== null && remainingMs <= 0);
  const isProfession = $derived(
    activity?.activityType === 'gather' || activity?.activityType === 'craft',
  );

  async function claim(): Promise<void> {
    claiming = true;
    error = null;
    try {
      const result = await claimActivity(characterId);
      claimResult = result;
      character = result.character;
      activity = null;
    } catch (err) {
      error = (err as Error).message;
    } finally {
      claiming = false;
    }
  }

  function closeClaim(): void {
    claimResult = null;
  }

  // Detect parallel activities (best-effort). The newest dungeon run row
  // may still be in progress; arena exposes a queued flag. Runs are lazy on the
  // server, so checking the newest run's completion is enough.
  async function loadOngoing(): Promise<void> {
    try {
      const dRuns = await recentDungeonRuns(characterId);
      const newest = dRuns[0];
      if (newest) {
        const view = await getDungeonRun(characterId, newest.runId);
        ongoingDungeon = view.progress.completed
          ? null
          : { runId: newest.runId, name: view.dungeonName };
      }
    } catch {
      /* best-effort */
    }
    try {
      const arena = await getArena(characterId);
      arenaQueued = arena.queued;
    } catch {
      /* best-effort */
    }
  }

  function formatRemaining(ms: number): string {
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number): string => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  function formatOffline(sec: number): string {
    if (sec < 60) return `${sec}s`;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  // Full stat words; CSS shows the short code on very narrow cells (see markup).
  const stats: { key: keyof CharacterView['sheet']['primary']; label: string; short: string }[] = [
    { key: 'strength', label: 'Strength', short: 'STR' },
    { key: 'dexterity', label: 'Dexterity', short: 'DEX' },
    { key: 'constitution', label: 'Constitution', short: 'CON' },
    { key: 'intelligence', label: 'Intelligence', short: 'INT' },
    { key: 'wisdom', label: 'Wisdom', short: 'WIS' },
    { key: 'charisma', label: 'Charisma', short: 'CHA' },
  ];

  const members = $derived(group?.group?.members ?? []);
</script>

{#if loading}
  <p class="text-[var(--text-dim)]">Loading…</p>
{:else if error && !character}
  <p class="text-[var(--danger)]">{error}</p>
{:else if character}
  {@const c = character}

  <div class="grid gap-5 lg:grid-cols-3">
    <!-- Character panel -->
    <section class="panel panel-pad lg:col-span-2">
      <div class="flex items-start gap-4">
        <PortraitShowcase name={c.name} race={c.race} klass={c.class} size={96} />
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-2xl font-bold text-[var(--gold-bright)]">{c.name}</h1>
          <p class="mt-0.5 text-sm text-[var(--text-dim)]">
            Level {c.sheet.level} · {RACES[c.race as keyof typeof RACES]?.name}
            <span style={`color:${CLASS_COLOR[c.class] ?? 'inherit'}`}
              >{CLASSES[c.class as keyof typeof CLASSES]?.name}</span
            >
          </p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <Badge color="var(--gold-bright)" icon="💰">{c.gold} {ui.gold}</Badge>
          </div>
        </div>
      </div>

      <!-- XP -->
      <div class="mt-4">
        <div class="mb-1 flex justify-between text-xs text-[var(--text-dim)]">
          <span>XP</span>
          <span
            >{c.sheet.xpIntoLevel}{c.sheet.xpForNext > 0
              ? ` / ${c.sheet.xpForNext}`
              : ' (max)'}</span
          >
        </div>
        <div class="bar">
          <div
            class="bar-fill"
            style={`width:${c.sheet.xpForNext > 0 ? Math.min(100, (c.sheet.xpIntoLevel / c.sheet.xpForNext) * 100) : 100}%`}
          ></div>
        </div>
      </div>

      <!-- Stats -->
      <div class="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div class="rounded-lg bg-black/20 px-3 py-2">
          <div class="text-xs text-[var(--text-faint)]">Health</div>
          <div class="font-semibold">{c.sheet.derived.health}</div>
        </div>
        {#if c.sheet.derived.kiPoints > 0}
          <div class="rounded-lg bg-black/20 px-3 py-2">
            <div class="text-xs text-[var(--text-faint)]">Ki</div>
            <div class="font-semibold">{c.sheet.derived.kiPoints}</div>
          </div>
        {:else if c.sheet.derived.rageCharges > 0}
          <div class="rounded-lg bg-black/20 px-3 py-2">
            <div class="text-xs text-[var(--text-faint)]">Rage</div>
            <div class="font-semibold">{c.sheet.derived.rageCharges}</div>
          </div>
        {:else}
          <div class="rounded-lg bg-black/20 px-3 py-2">
            <div class="text-xs text-[var(--text-faint)]">Spell Slots</div>
            <div class="font-semibold">
              {Object.values(c.sheet.derived.spellSlots).reduce((a, b) => a + b, 0) || '—'}
            </div>
          </div>
        {/if}
        {#each stats as s (s.key)}
          <div class="rounded-lg bg-black/20 px-3 py-2">
            <!-- Full word when there's room; short code on the narrowest layout. -->
            <div class="text-xs text-[var(--text-faint)]">
              <span class="hidden sm:inline">{s.label}</span>
              <span class="sm:hidden">{s.short}</span>
            </div>
            <div class="font-semibold">{c.sheet.primary[s.key]}</div>
          </div>
        {/each}
      </div>

      <!-- Racial traits (PHB) -->
      {#if RACES[c.race as keyof typeof RACES]?.traits?.length}
        <div class="mt-4">
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">
            {RACES[c.race as keyof typeof RACES].name} traits
          </h3>
          <ul class="space-y-1">
            {#each RACES[c.race as keyof typeof RACES].traits as t (t.name)}
              <li class="text-sm">
                <span class="font-semibold text-[var(--gold-bright)]">{t.name}</span>
                <span class="text-[var(--text-dim)]"> — {t.description}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </section>

    <!-- Activity panel -->
    <section class="panel panel-pad">
      <h2 class="panel-title">{ui.activity}</h2>
      {#if error && character}<p class="mt-2 text-sm text-[var(--danger)]">{error}</p>{/if}

      {#if activity}
        {@const a = activity}
        <p class="mt-3 text-sm text-[var(--text-dim)]">
          {isProfession ? ui.working : ui.onQuest}:
          <strong class="text-[var(--text)]">{a.title}</strong>
        </p>
        <div class="bar mt-2">
          <div
            class="bar-fill"
            style={`width:${Math.min(100, (1 - remainingMs / (a.durationSec * 1000)) * 100)}%`}
          ></div>
        </div>
        {#if completed}
          <p class="mt-3 font-medium text-[var(--success)]">
            {isProfession ? ui.activityDone : ui.completed}
          </p>
          <button class="btn btn-primary mt-2 w-full" onclick={claim} disabled={claiming}>
            {claiming ? ui.claiming : ui.claim}
          </button>
        {:else}
          <p class="mt-3 text-sm text-[var(--text-dim)]">
            {ui.finishesIn}:
            <span class="font-mono text-[var(--gold-bright)]">{formatRemaining(remainingMs)}</span>
          </p>
        {/if}
      {:else if !hasOngoing}
        <p class="mt-3 text-sm text-[var(--text-faint)]">{ui.idle}</p>
        <a href={`/characters/${characterId}/quests`} class="btn btn-primary mt-3 w-full"
          >{ui.goQuesting}</a
        >
      {/if}

      <!-- Parallel activities: dungeon runs + arena queue run server-side
           (idle), so you can navigate away from their watch pages freely. -->
      {#if hasOngoing}
        <div class="mt-4 border-t border-[var(--border)]/60 pt-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">
            {ui.ongoing}
          </p>
          <ul class="mt-2 space-y-2 text-sm">
            {#if ongoingDungeon}
              <li class="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2">
                <span class="min-w-0 truncate">{ui.inDungeon}: {ongoingDungeon.name}</span>
                <a
                  href={`/characters/${characterId}/dungeon/${ongoingDungeon.runId}`}
                  class="btn btn-sm shrink-0">{ui.watch}</a
                >
              </li>
            {/if}
            {#if arenaQueued}
              <li class="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2">
                <span class="min-w-0 truncate">{ui.inArenaQueue}</span>
                <a href={`/characters/${characterId}/arena`} class="btn btn-sm shrink-0"
                  >{ui.open}</a
                >
              </li>
            {/if}
          </ul>
        </div>
      {/if}
    </section>
  </div>

  <!-- Group panel: party visible from the main overview -->
  <section class="panel panel-pad mt-5">
    <div class="flex items-center justify-between">
      <h2 class="panel-title">{ui.group}</h2>
      <a
        href={`/characters/${characterId}/group`}
        class="text-sm text-[var(--text-dim)] hover:text-[var(--gold)]">Manage →</a
      >
    </div>
    {#if members.length > 0}
      <ul class="mt-3 grid gap-2 sm:grid-cols-2">
        {#each members as m (m.characterId)}
          <li>
            <button
              class="card !py-2"
              onclick={() => openProfile(m.characterId, m.name)}
              disabled={m.status === 'invited'}
              class:opacity-50={m.status === 'invited'}
            >
              <Avatar name={m.name} race={m.race} klass={m.class} size={38} />
              <span class="min-w-0 flex-1 text-left">
                <span class="flex items-center gap-1.5">
                  <span class="truncate font-semibold">{m.name}</span>
                  {#if m.isLeader}<span title="Leader">👑</span>{/if}
                </span>
                <span class="card-sub">
                  Lv {m.level} · {CLASSES[m.class as keyof typeof CLASSES]?.name}
                  {#if m.status === 'invited'}· invited{/if}
                </span>
              </span>
              <span
                class="shrink-0 text-sm"
                style={`color:${ROLE_META[m.role].color}`}
                title={ROLE_META[m.role].label}
              >
                {ROLE_META[m.role].icon}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="mt-2 text-sm text-[var(--text-faint)]">{ui.soloHint}</p>
      <a href={`/characters/${characterId}/group`} class="btn mt-3 inline-flex">{ui.formGroup}</a>
    {/if}
  </section>

  <!-- Quick actions: the most common destinations, one tap from the dashboard.
       Everything else lives under the category tabs in the top nav. -->
  <section class="mt-6">
    <h2 class="panel-title mb-2 text-base">Quick actions</h2>
    <div class="grid gap-3 sm:grid-cols-3">
      {#each QUICK_ACTIONS as s (s.path)}
        <HubCard
          href={`/characters/${characterId}/${s.path}`}
          icon={s.icon}
          title={s.title}
          sub={s.sub}
          accent={s.accent}
        />
      {/each}
    </div>
  </section>

  <!-- Claim result: pops up as its own card (modal) instead of expanding the
       Activity panel inline. -->
  {#if claimResult}
    {@const r = claimResult}
    <div
      class="overlay"
      role="button"
      tabindex="0"
      onclick={closeClaim}
      onkeydown={(e) => e.key === 'Escape' && closeClaim()}
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="panel w-full max-w-md"
        role="dialog"
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
        onkeydown={() => {}}
      >
        <div class="panel-pad">
          <div class="flex items-center justify-between">
            <h2 class="panel-title">
              {#if r.questFailed}❌ {ui.defeated}{:else}{claimResult.leveledUp
                  ? `⭐ ${ui.levelUp}`
                  : ui.activityDone}{/if}
            </h2>
            <button
              class="text-[var(--text-faint)] hover:text-[var(--text)]"
              onclick={closeClaim}
              aria-label="Close">✕</button
            >
          </div>

          {#if r.questFailed}
            <div
              class="mt-3 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 p-3 text-sm"
            >
              <p class="font-semibold text-[var(--danger)]">❌ {ui.defeated}</p>
              <p class="mt-1 text-[var(--text-dim)]">{ui.defeatedMsg}</p>
            </div>
          {:else}
            <div
              class="mt-3 rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 p-3 text-sm"
            >
              {#if r.offlineDurationSec > 60}
                <p class="mb-1 text-xs text-[var(--text-faint)]">
                  🌙 {ui.offlineFor}
                  {formatOffline(r.offlineDurationSec)}
                </p>
              {/if}
              <p class="font-semibold text-[var(--success)]">
                {ui.gained}: +{r.reward.xp} XP, +{r.reward.gold} g
              </p>
              {#if r.items.length > 0}
                <div class="mt-1 flex flex-wrap items-center gap-2 text-[var(--text-dim)]">
                  <span>🎁</span>
                  {#each r.items as id, ii (ii)}
                    {@const meta = itemIconMetaById(id)}
                    {@const def = ITEMS[id as keyof typeof ITEMS]}
                    <span class="inline-flex items-center gap-1">
                      {#if meta}
                        <PixelItemIcon
                          slot={meta.slot}
                          rarity={meta.rarity}
                          armorClass={meta.armorClass}
                          size={20}
                        />
                      {/if}
                      <span
                        style={`color:${def ? (RARITY_COLOR[def.rarity] ?? 'inherit') : 'inherit'}`}
                        >{def?.name ?? id}</span
                      >
                    </span>
                  {/each}
                </div>
              {/if}
              {#if r.leveledUp}<p class="mt-1 text-[var(--gold-bright)]">
                  ⭐ {ui.levelUp}
                  {r.levelBefore} → {r.levelAfter}
                </p>{/if}
              {#if r.reputation && r.reputation.length > 0}
                {#each r.reputation as rep, ri (ri)}
                  <p class="mt-1 text-[var(--text-dim)]">
                    🏅 <span class="text-[var(--gold)]">{rep.name}</span>
                    +{rep.gained}
                    <span class="text-[var(--text-faint)]">· {rep.tierName}</span>
                  </p>
                {/each}
              {/if}
            </div>
          {/if}

          {#if r.questLog && r.questLog.length > 0}
            <div
              class="mt-3 max-h-[50vh] space-y-2 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm"
            >
              <p class="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                {ui.questStory}
              </p>
              {#each r.questLog as step, i (i)}
                {#if step.kind === 'narrative'}
                  <p class="italic leading-relaxed text-[var(--text-dim)]">{step.text}</p>
                {:else}
                  <div
                    class="rounded-md border border-[var(--border)]/60 bg-[var(--surface)]/50 p-2"
                  >
                    <p class="leading-relaxed text-[var(--text-dim)]">{step.text}</p>
                    <details class="mt-1">
                      <summary
                        class="cursor-pointer text-xs hover:text-[var(--gold)]"
                        class:text-[var(--danger)]={step.defeated}
                        class:text-[var(--text-faint)]={!step.defeated}
                      >
                        {step.defeated ? '💀' : '⚔️'}
                        {step.enemyName}
                        {#if step.defeated}<span class="ml-1 text-[var(--danger)]"
                            >· {ui.defeated}</span
                          >{:else if step.playerHpPct !== undefined}<span
                            class="ml-1 text-[var(--text-faint)]"
                            >· {ui.hpLeft} {step.playerHpPct}%</span
                          >{/if}
                      </summary>
                      <ul class="mt-1 space-y-0.5 font-mono text-xs text-[var(--text-faint)]">
                        {#each step.events ?? [] as ev (ev.t + ev.message)}
                          <li
                            class:text-[var(--success)]={ev.type === 'enemy_defeated'}
                            class:text-[var(--danger)]={ev.type === 'player_defeated'}
                            class:text-[var(--gold-bright)]={ev.crit}
                          >
                            {ev.message}
                          </li>
                        {/each}
                      </ul>
                    </details>
                  </div>
                {/if}
              {/each}
            </div>
          {/if}

          <button class="btn btn-primary mt-4 w-full" onclick={closeClaim}>OK</button>
        </div>
      </div>
    </div>
  {/if}
{/if}
