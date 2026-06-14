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
  import { RACES, CLASSES } from '@game/shared';

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
  };

  let character = $state<CharacterView | null>(null);
  let activity = $state<ActivityView | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let claiming = $state(false);
  let claimResult = $state<ClaimResult | null>(null);
  let now = $state(Date.now());

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

  function formatRemaining(ms: number): string {
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number): string => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  const stats: { key: keyof CharacterView['sheet']['primary']; label: string }[] = [
    { key: 'strength', label: 'Síla' },
    { key: 'agility', label: 'Obratnost' },
    { key: 'stamina', label: 'Výdrž' },
    { key: 'intellect', label: 'Inteligence' },
    { key: 'spirit', label: 'Duch' },
  ];
</script>

<main class="mx-auto max-w-lg px-6 py-12">
  <a href="/characters" class="text-sm text-amber-300 underline">← Zpět na postavy</a>

  {#if loading}
    <p class="mt-6 text-amber-100/50">Načítám…</p>
  {:else if error && !character}
    <p class="mt-6 text-red-400">{error}</p>
  {:else if character}
    {@const c = character}
    <h1 class="mt-4 text-3xl font-bold text-amber-200">{c.name}</h1>
    <p class="mt-1 text-amber-100/70">
      {RACES[c.race as keyof typeof RACES]?.name} ·
      {CLASSES[c.class as keyof typeof CLASSES]?.name} ·
      {c.faction === 'horde' ? 'Horda' : 'Aliance'}
    </p>

    <section class="mt-6 rounded-lg border border-amber-900/40 bg-black/20 p-5">
      <div class="flex items-center justify-between">
        <span class="text-lg font-semibold text-amber-200">Level {c.sheet.level}</span>
        <span class="text-sm text-amber-100/60">
          XP {c.sheet.xpIntoLevel}{c.sheet.xpForNext > 0 ? ` / ${c.sheet.xpForNext}` : ' (max)'}
        </span>
      </div>

      <dl class="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div class="flex justify-between">
          <dt class="text-amber-100/70">Život</dt>
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
        <p class="font-semibold text-emerald-300">
          {ui.gained}: +{r.reward.xp} XP, +{r.reward.gold}
          {ui.gold}
        </p>
        {#if r.leveledUp}
          <p class="mt-1 text-amber-300">
            ⭐ {ui.levelUp}
            {r.levelBefore} → {r.levelAfter}
          </p>
        {/if}
      </section>
    {/if}

    <!-- Activity panel -->
    <section class="mt-4 rounded-lg border border-amber-900/40 bg-black/20 p-5">
      <h2 class="text-lg font-semibold text-amber-200">{ui.questing}</h2>
      {#if error && character}
        <p class="mt-2 text-red-400">{error}</p>
      {/if}

      {#if activity}
        {@const a = activity}
        <p class="mt-2 text-amber-100/80">{ui.onQuest}: <strong>{a.quest.name}</strong></p>
        <div class="mt-3 h-2 w-full overflow-hidden rounded bg-black/40">
          <div
            class="h-full bg-amber-500 transition-all"
            style={`width: ${Math.min(100, (1 - remainingMs / (a.durationSec * 1000)) * 100)}%`}
          ></div>
        </div>
        {#if completed}
          <p class="mt-3 font-medium text-emerald-300">{ui.completed}</p>
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
