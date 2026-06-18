<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    inspectCharacter,
    inviteToGroup,
    inviteToGuild,
    requestGroupJoin,
    sendFriendRequest,
    startTrade,
    type InspectView,
    type RaidRole,
  } from '$lib/api';
  import { RACES, CLASSES, type Faction } from '@game/shared';
  import {
    CLASS_COLOR,
    FACTION_COLOR,
    RARITY_COLOR,
    ROLE_META,
    factionLabel,
    raceName,
    className,
  } from '$lib/cosmetics';
  import { inspectTarget, notifications, startWhisper } from '$lib/ui-stores';
  import { itemIconMetaById } from '$lib/pixelart/items';
  import PortraitShowcase from './PortraitShowcase.svelte';
  import PixelItemIcon from './PixelItemIcon.svelte';
  import Badge from './Badge.svelte';

  // Game-facing UI strings (English; separate from logic for future i18n).
  const ui = {
    inspect: 'Inspect',
    itemLevel: 'Item level',
    equipped: 'Equipped gear',
    noGear: 'No gear equipped.',
    stats: 'Stats',
    whisper: 'Whisper',
    mail: 'Send mail',
    friend: 'Add friend',
    group: 'Invite to group',
    requestGroup: 'Request to join',
    trade: 'Invite to trade',
    guild: 'Invite to guild',
    close: 'Close',
    self: 'This is you.',
  };

  let { viewerId, viewerInGroup = false }: { viewerId: string; viewerInGroup?: boolean } = $props();

  let data = $state<InspectView | null>(null);

  // When I'm not in a group and the target is, the action becomes "request to join".
  const requestMode = $derived(!viewerInGroup && (data?.inGroup ?? false));
  let loading = $state(false);
  let error = $state<string | null>(null);
  let actionBusy = $state(false);
  let inviteRole = $state<RaidRole>('dps');

  const target = $derived($inspectTarget);
  const isSelf = $derived(target?.characterId === viewerId);

  $effect(() => {
    const t = $inspectTarget;
    if (!t) {
      data = null;
      error = null;
      return;
    }
    void load(t.characterId);
  });

  async function load(id: string): Promise<void> {
    loading = true;
    error = null;
    data = null;
    try {
      data = await inspectCharacter(id);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  function close(): void {
    inspectTarget.set(null);
  }

  async function act(fn: () => Promise<void>, ok: string): Promise<void> {
    if (actionBusy || !data) return;
    actionBusy = true;
    error = null;
    try {
      await fn();
      notifications.push('success', ok);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      actionBusy = false;
    }
  }

  function whisper(): void {
    if (!data) return;
    startWhisper(data.id, data.name);
    close();
  }

  async function mail(): Promise<void> {
    if (!data) return;
    const name = data.name;
    close();
    await goto(`/characters/${viewerId}/mail?to=${encodeURIComponent(name)}`);
  }

  function doGroup(): void {
    if (!data) return;
    if (requestMode) {
      void act(
        () => requestGroupJoin(viewerId, data!.name).then(() => undefined),
        `Requested to join ${data.name}'s group.`,
      );
    } else {
      void act(
        () => inviteToGroup(viewerId, data!.name, inviteRole).then(() => undefined),
        `Invited ${data.name} to your group.`,
      );
    }
  }

  function doGuild(): void {
    if (!data) return;
    void act(
      () => inviteToGuild(viewerId, data!.name).then(() => undefined),
      `Invited ${data.name} to your guild.`,
    );
  }

  function doFriend(): void {
    if (!data) return;
    void act(
      () => sendFriendRequest(viewerId, data!.name).then(() => undefined),
      `Friend request sent to ${data.name}.`,
    );
  }

  async function doTrade(): Promise<void> {
    if (!data || actionBusy) return;
    actionBusy = true;
    error = null;
    try {
      await startTrade(viewerId, data.name);
      const name = data.name;
      close();
      await goto(`/characters/${viewerId}/trade?with=${encodeURIComponent(name)}`);
    } catch (err) {
      error = (err as Error).message;
      actionBusy = false;
    }
  }

  const statRows: { key: string; label: string }[] = [
    { key: 'strength', label: 'Strength' },
    { key: 'dexterity', label: 'Dexterity' },
    { key: 'constitution', label: 'Constitution' },
    { key: 'intelligence', label: 'Intelligence' },
    { key: 'wisdom', label: 'Wisdom' },
    { key: 'charisma', label: 'Charisma' },
  ];

  function primaryWithGear(d: InspectView, key: string): number {
    const base = (d.sheet.primary as Record<string, number>)[key] ?? 0;
    const gear = (d.sheet.equipmentStats as Record<string, number>)[key] ?? 0;
    return base + gear;
  }
</script>

{#if target}
  <div
    class="overlay"
    role="button"
    tabindex="0"
    onclick={close}
    onkeydown={(e) => e.key === 'Escape' && close()}
  >
    <div
      class="panel w-full max-w-md"
      role="dialog"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
    >
      <div class="panel-pad">
        {#if loading}
          <p class="text-[var(--text-dim)]">Loading…</p>
        {:else if error && !data}
          <p class="text-[var(--danger)]">{error}</p>
          <button class="btn btn-sm mt-3" onclick={close}>{ui.close}</button>
        {:else if data}
          {@const d = data}
          <div class="flex items-start gap-4">
            <PortraitShowcase
              name={d.name}
              race={d.race}
              klass={d.class}
              faction={(d.faction === 'horde' ? 'horde' : 'alliance') as Faction}
              size={84}
            />
            <div class="min-w-0 flex-1">
              <h2 class="truncate text-2xl font-bold text-[var(--gold-bright)]">{d.name}</h2>
              <p class="mt-0.5 text-sm text-[var(--text-dim)]">
                Level {d.sheet.level} · {raceName(d.race)}
                <span style={`color:${CLASS_COLOR[d.class] ?? 'inherit'}`}
                  >{className(d.class)}</span
                >
              </p>
              {#if d.guild}
                <p class="mt-0.5 text-sm text-[var(--text-dim)]">
                  🏰 &lt;{d.guild.name}&gt;
                  <span class="capitalize text-[var(--text-faint)]">· {d.guild.rank}</span>
                </p>
              {/if}
              <div class="mt-2 flex flex-wrap gap-1.5">
                <Badge color={FACTION_COLOR[d.faction as 'alliance' | 'horde'] ?? 'var(--gold)'}>
                  {factionLabel(d.faction)}
                </Badge>
                <Badge color="var(--gold-bright)" icon="🛡️">{ui.itemLevel} {d.itemLevel}</Badge>
              </div>
            </div>
          </div>

          <hr class="divider my-4" />

          <!-- Stats -->
          <h3 class="panel-title text-sm">{ui.stats}</h3>
          <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div class="flex justify-between">
              <dt class="text-[var(--text-dim)]">Health</dt>
              <dd>{d.sheet.derived.health}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-[var(--text-dim)] capitalize">{d.sheet.derived.resource.type}</dt>
              <dd>{d.sheet.derived.resource.max}</dd>
            </div>
            {#each statRows as s (s.key)}
              <div class="flex justify-between">
                <dt class="text-[var(--text-dim)]">{s.label}</dt>
                <dd>{primaryWithGear(d, s.key)}</dd>
              </div>
            {/each}
          </dl>

          <!-- Equipment -->
          <h3 class="panel-title mt-4 text-sm">{ui.equipped}</h3>
          {#if d.equipment.length === 0}
            <p class="mt-1 text-sm text-[var(--text-faint)]">{ui.noGear}</p>
          {:else}
            <ul class="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              {#each d.equipment as e (e.slot)}
                {@const meta = itemIconMetaById(e.itemId)}
                <li class="flex items-center justify-between gap-2 rounded bg-black/20 px-2 py-1">
                  <span class="flex min-w-0 items-center gap-1.5">
                    {#if meta}
                      <PixelItemIcon
                        slot={meta.slot}
                        rarity={meta.rarity}
                        armorClass={meta.armorClass}
                        size={20}
                      />
                    {/if}
                    <span class="truncate" style={`color:${RARITY_COLOR[e.rarity] ?? 'inherit'}`}
                      >{e.name}</span
                    >
                  </span>
                  <span class="shrink-0 text-xs text-[var(--text-faint)]">i{e.itemLevel}</span>
                </li>
              {/each}
            </ul>
          {/if}

          <hr class="divider my-4" />

          {#if isSelf}
            <p class="text-center text-sm text-[var(--text-faint)]">{ui.self}</p>
          {:else}
            <div class="grid grid-cols-2 gap-2">
              <button class="btn btn-sm" onclick={whisper} disabled={actionBusy}>
                💬 {ui.whisper}
              </button>
              <button class="btn btn-sm" onclick={mail} disabled={actionBusy}>
                ✉️ {ui.mail}
              </button>
              <button class="btn btn-sm" onclick={doFriend} disabled={actionBusy}>
                ➕ {ui.friend}
              </button>
              <button class="btn btn-sm" onclick={doTrade} disabled={actionBusy}>
                🤝 {ui.trade}
              </button>
              <button class="btn btn-sm" onclick={doGuild} disabled={actionBusy}>
                🏰 {ui.guild}
              </button>
              {#if requestMode}
                <button class="btn btn-sm" onclick={doGroup} disabled={actionBusy}>
                  ✋ {ui.requestGroup}
                </button>
              {:else}
                <div class="flex gap-1">
                  <select class="input btn-sm flex-1 px-1 py-0" bind:value={inviteRole}>
                    {#each Object.entries(ROLE_META) as [r, meta] (r)}
                      <option value={r}>{meta.label}</option>
                    {/each}
                  </select>
                  <button class="btn btn-sm flex-1" onclick={doGroup} disabled={actionBusy}>
                    ➕ {ui.group}
                  </button>
                </div>
              {/if}
            </div>
          {/if}

          {#if error}<p class="mt-3 text-sm text-[var(--danger)]">{error}</p>{/if}

          <button class="btn btn-sm mt-4 w-full" onclick={close}>{ui.close}</button>
        {/if}
      </div>
    </div>
  </div>
{/if}
