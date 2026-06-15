<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import {
    ApiError,
    claimActivity,
    getActivity,
    getCharacter,
    type ActivityView,
    type CharacterView,
    type ClaimResult,
  } from '$lib/api';
  import { getPushState, isPushSupported, subscribePush, unsubscribePush } from '$lib/push';
  import { RACES, CLASSES, ITEMS } from '@game/shared';
  import DevPanel from '$lib/DevPanel.svelte';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    questing: 'Questing',
    onQuest: 'On a quest',
    finishesIn: 'Finishes in',
    completed: 'Quest complete!',
    claim: 'Claim rewards',
    claiming: 'Claiming…',
    goQuesting: 'Go questing →',
    idle: 'Idle — not on any activity.',
    gold: 'Gold',
    levelUp: 'Level up!',
    gained: 'Gained',
    notifications: 'Notifications',
    enableNotifications: 'Enable notifications',
    disableNotifications: 'Disable notifications',
    notificationsOn: 'Notifications enabled',
    notificationsDenied: 'Notifications blocked by browser',
    notificationsUnsupported: 'Push not supported in this browser',
    offlineFor: 'Away for',
  };

  let character = $state<CharacterView | null>(null);
  let activity = $state<ActivityView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let claiming = $state(false);
  let claimResult = $state<ClaimResult | null>(null);
  let now = $state(Date.now());

  // Push state
  let pushState = $state<'subscribed' | 'denied' | 'default' | 'unsupported'>('unsupported');
  let pushPending = $state(false);

  const characterId = $derived($page.params.id ?? '');

  let ticker: ReturnType<typeof setInterval> | undefined;

  onMount(async () => {
    await load();
    ticker = setInterval(() => (now = Date.now()), 1000);
    if (isPushSupported()) {
      pushState = await getPushState();
    }
  });

  onDestroy(() => clearInterval(ticker));

  async function load(): Promise<void> {
    loading = true;
    try {
      [character, activity] = await Promise.all([
        getCharacter(characterId),
        getActivity(characterId),
      ]);
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

  async function togglePush(): Promise<void> {
    pushPending = true;
    try {
      if (pushState === 'subscribed') {
        await unsubscribePush();
        pushState = 'default';
      } else {
        const result = await subscribePush();
        pushState = result === 'subscribed' ? 'subscribed' : result;
      }
    } catch (err) {
      error = (err as Error).message;
    } finally {
      pushPending = false;
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

  function formatOfflineDuration(sec: number): string {
    if (sec < 60) return `${sec}s`;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  const stats: { key: keyof CharacterView['sheet']['primary']; label: string }[] = [
    { key: 'strength', label: 'Strength' },
    { key: 'agility', label: 'Agility' },
    { key: 'stamina', label: 'Stamina' },
    { key: 'intellect', label: 'Intellect' },
    { key: 'spirit', label: 'Spirit' },
  ];

  // Extra UI strings for M4/M5/M6 links
  const uiM4 = {
    inventory: 'Inventory & Equipment',
    talents: 'Talents',
    dungeons: 'Dungeons',
    professions: 'Professions',
    arena: 'Arena (PVP)',
    raids: 'Raids (MP PVE)',
    group: 'Group',
    auctions: 'Auction House',
    social: 'Friends',
    guild: 'Guild',
    trade: 'Trade',
    achievements: 'Achievements',
    mounts: 'Mounts',
  };

  const isProfession = $derived(
    activity?.activityType === 'gather' || activity?.activityType === 'craft',
  );
  const activityLabel = $derived(isProfession ? '🔨 Working' : ui.onQuest);
  const completeLabel = $derived(isProfession ? 'Activity complete!' : ui.completed);
</script>

<main class="mx-auto max-w-lg px-6 py-12">
  <a href="/characters" class="text-sm text-amber-300 underline">← Back to characters</a>

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else if error && !character}
    <p class="mt-6 text-red-400">{error}</p>
  {:else if character}
    {@const c = character}
    <div class="mt-4 flex items-start justify-between">
      <div>
        <h1 class="text-3xl font-bold text-amber-200">{c.name}</h1>
        <p class="mt-1 text-amber-100/70">
          {RACES[c.race as keyof typeof RACES]?.name} ·
          {CLASSES[c.class as keyof typeof CLASSES]?.name} ·
          {c.faction === 'horde' ? 'Horde' : 'Alliance'}
        </p>
      </div>

      <!-- Push toggle -->
      {#if pushState !== 'unsupported'}
        <div class="mt-1 text-right">
          {#if pushState === 'denied'}
            <p class="text-xs text-amber-100/40">{ui.notificationsDenied}</p>
          {:else}
            <button
              onclick={togglePush}
              disabled={pushPending}
              class="rounded border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40
                {pushState === 'subscribed'
                ? 'border-emerald-700/60 text-emerald-400 hover:border-red-700/60 hover:text-red-400'
                : 'border-amber-700/60 text-amber-400 hover:border-emerald-700/60 hover:text-emerald-400'}"
            >
              {pushPending
                ? '…'
                : pushState === 'subscribed'
                  ? ui.notificationsOn
                  : ui.enableNotifications}
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <section class="mt-6 rounded-lg border border-amber-900/40 bg-black/20 p-5">
      <div class="flex items-center justify-between">
        <span class="text-lg font-semibold text-amber-200">Level {c.sheet.level}</span>
        <span class="text-sm text-amber-100/60">
          XP {c.sheet.xpIntoLevel}{c.sheet.xpForNext > 0 ? ` / ${c.sheet.xpForNext}` : ' (max)'}
        </span>
      </div>

      <dl class="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div class="flex justify-between">
          <dt class="text-amber-100/70">Health</dt>
          <dd>{c.sheet.derived.health}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-amber-100/70 capitalize">{c.sheet.derived.resource.type}</dt>
          <dd>{c.sheet.derived.resource.max}</dd>
        </div>
        {#each stats as s (s.key)}
          <div class="flex justify-between">
            <dt class="text-amber-100/70">{s.label}</dt>
            <dd>{c.sheet.primary[s.key]}</dd>
          </div>
        {/each}
        <div class="flex justify-between">
          <dt class="text-amber-100/70">{ui.gold}</dt>
          <dd class="text-amber-300">{c.gold}</dd>
        </div>
      </dl>
    </section>

    <!-- Reward / level-up banner after a claim -->
    {#if claimResult}
      {@const r = claimResult}
      <section class="mt-4 rounded-lg border border-emerald-700/50 bg-emerald-900/20 p-4">
        {#if r.offlineDurationSec > 60}
          <p class="mb-2 text-xs text-amber-100/50">
            🌙 {ui.offlineFor} {formatOfflineDuration(r.offlineDurationSec)}
          </p>
        {/if}
        <p class="font-semibold text-emerald-300">
          {ui.gained}: +{r.reward.xp} XP, +{r.reward.gold}
          {ui.gold}
        </p>
        {#if r.items.length > 0}
          <p class="mt-1 text-sm text-amber-200">
            🎁 Loot: {r.items
              .map((id) => ITEMS[id as keyof typeof ITEMS]?.name ?? id)
              .join(', ')}
          </p>
        {/if}
        {#if r.profession && r.profession.skillAfter > r.profession.skillBefore}
          <p class="mt-1 text-sm text-amber-200">
            🔨 {r.profession.name} skill {r.profession.skillBefore} → {r.profession.skillAfter}
          </p>
        {/if}
        {#if r.reputation && r.reputation.length > 0}
          <p class="mt-1 text-sm text-amber-200">
            🤝 {r.reputation.map((rep) => `+${rep.gained} ${rep.name} (${rep.tierName})`).join(', ')}
          </p>
        {/if}
        {#if r.leveledUp}
          <p class="mt-1 text-amber-300">
            ⭐ {ui.levelUp}
            {r.levelBefore} → {r.levelAfter}
          </p>
        {/if}
      </section>
    {/if}

    <!-- M4/M5/M6: feature links -->
    <div class="mt-4 flex flex-wrap gap-3">
      <a
        href={`/characters/${characterId}/inventory`}
        class="rounded bg-amber-800/40 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-700/50"
      >
        {uiM4.inventory}
      </a>
      <a
        href={`/characters/${characterId}/talents`}
        class="rounded bg-amber-800/40 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-700/50"
      >
        {uiM4.talents}
      </a>
      <a
        href={`/characters/${characterId}/dungeons`}
        class="rounded bg-amber-800/40 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-700/50"
      >
        {uiM4.dungeons}
      </a>
      <a
        href={`/characters/${characterId}/professions`}
        class="rounded bg-amber-800/40 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-700/50"
      >
        {uiM4.professions}
      </a>
      <a
        href={`/characters/${characterId}/arena`}
        class="rounded bg-red-800/40 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-700/50"
      >
        {uiM4.arena}
      </a>
      <a
        href={`/characters/${characterId}/raids`}
        class="rounded bg-red-800/40 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-700/50"
      >
        {uiM4.raids}
      </a>
      <a
        href={`/characters/${characterId}/group`}
        class="rounded bg-sky-800/40 px-4 py-2 text-sm font-medium text-sky-200 hover:bg-sky-700/50"
      >
        {uiM4.group}
      </a>
      <a
        href={`/characters/${characterId}/auctions`}
        class="rounded bg-amber-800/40 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-700/50"
      >
        {uiM4.auctions}
      </a>
      <a
        href={`/characters/${characterId}/social`}
        class="rounded bg-sky-800/40 px-4 py-2 text-sm font-medium text-sky-200 hover:bg-sky-700/50"
      >
        {uiM4.social}
      </a>
      <a
        href={`/characters/${characterId}/guild`}
        class="rounded bg-sky-800/40 px-4 py-2 text-sm font-medium text-sky-200 hover:bg-sky-700/50"
      >
        {uiM4.guild}
      </a>
      <a
        href={`/characters/${characterId}/trade`}
        class="rounded bg-sky-800/40 px-4 py-2 text-sm font-medium text-sky-200 hover:bg-sky-700/50"
      >
        {uiM4.trade}
      </a>
      <a
        href={`/characters/${characterId}/achievements`}
        class="rounded bg-amber-800/40 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-700/50"
      >
        {uiM4.achievements}
      </a>
      <a
        href={`/characters/${characterId}/mounts`}
        class="rounded bg-emerald-800/40 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-700/50"
      >
        {uiM4.mounts}
      </a>
    </div>

    <!-- Activity panel -->
    <section class="mt-4 rounded-lg border border-amber-900/40 bg-black/20 p-5">
      <h2 class="text-lg font-semibold text-amber-200">{ui.questing}</h2>
      {#if error && character}
        <p class="mt-2 text-red-400">{error}</p>
      {/if}

      {#if activity}
        {@const a = activity}
        <p class="mt-2 text-amber-100/80">
          {activityLabel}: <strong>{a.title}</strong>
        </p>
        <div class="mt-3 h-2 w-full overflow-hidden rounded bg-black/40">
          <div
            class="h-full bg-amber-500 transition-all"
            style={`width: ${Math.min(100, (1 - remainingMs / (a.durationSec * 1000)) * 100)}%`}
          ></div>
        </div>
        {#if completed}
          <p class="mt-3 font-medium text-emerald-300">
            {completeLabel}
          </p>
          <button
            onclick={claim}
            disabled={claiming}
            class="mt-3 rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-500 disabled:opacity-50"
          >
            {claiming ? ui.claiming : ui.claim}
          </button>
        {:else}
          <p class="mt-3 text-sm text-amber-100/60">
            {ui.finishesIn}:
            <span class="font-mono text-amber-200">{formatRemaining(remainingMs)}</span>
          </p>
        {/if}
      {:else}
        <p class="mt-2 text-amber-100/60">{ui.idle}</p>
        <a
          href={`/characters/${characterId}/quests`}
          class="mt-3 inline-block rounded bg-amber-600 px-4 py-2 text-sm font-medium text-black hover:bg-amber-500"
        >
          {ui.goQuesting}
        </a>
      {/if}
    </section>
  {/if}
</main>

<DevPanel {characterId} />
