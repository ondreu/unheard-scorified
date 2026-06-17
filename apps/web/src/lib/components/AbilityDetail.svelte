<script lang="ts">
  /**
   * Detail combat ability (klik na jméno ability v logu). Data z
   * `findAbilityByName` (katalog `data/abilities.ts`). UI strings anglicky.
   */
  import { findAbilityByName } from '@game/shared';
  import { inspectAbility } from '$lib/ui-stores';
  import Badge from './Badge.svelte';
  import PixelAbilityIcon from './PixelAbilityIcon.svelte';

  const KIND_META: Record<string, { label: string; color: string; icon: string }> = {
    strike: { label: 'Strike', color: 'var(--info)', icon: '⚔️' },
    drain: { label: 'Drain', color: 'var(--success)', icon: '🩸' },
    dot: { label: 'Damage over time', color: 'var(--gold-bright)', icon: '🔥' },
    heal: { label: 'Heal', color: 'var(--success)', icon: '✨' },
    shield: { label: 'Shield', color: 'var(--info)', icon: '🛡️' },
    mitigation: { label: 'Mitigation', color: 'var(--info)', icon: '🛡️' },
  };

  const ui = {
    cooldown: 'Cooldown',
    damage: 'Damage',
    healing: 'Healing',
    overTime: 'Over time',
    drainHeal: 'Heals for',
    execute: 'Execute below',
    mitigation: 'Damage reduced',
    noData: 'No details available.',
    close: 'Close',
  };

  const name = $derived($inspectAbility);
  const ability = $derived(name ? findAbilityByName(name) : undefined);

  function close(): void {
    inspectAbility.set(null);
  }
</script>

{#if name}
  <div
    class="overlay"
    role="button"
    tabindex="0"
    onclick={close}
    onkeydown={(e) => e.key === 'Escape' && close()}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="panel w-full max-w-sm"
      role="dialog"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
    >
      <div class="panel-pad">
        {#if ability}
          {@const a = ability}
          {@const meta = KIND_META[a.kind] ?? { label: a.kind, color: 'var(--text-dim)', icon: '✨' }}
          <div class="flex items-start justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2">
              <PixelAbilityIcon name={a.name} kind={a.kind} size={32} dim={16} />
              <h2 class="truncate text-xl font-bold text-[var(--gold-bright)]">{a.name}</h2>
            </div>
            <Badge color={meta.color} icon={meta.icon}>{meta.label}</Badge>
          </div>

          {#if a.description}
            <p class="mt-2 text-sm italic leading-relaxed text-[var(--text-dim)]">{a.description}</p>
          {/if}

          <hr class="divider my-4" />

          <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div class="flex justify-between">
              <dt class="text-[var(--text-dim)]">{ui.cooldown}</dt>
              <dd>{a.cooldownSec}s</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-[var(--text-dim)]">{a.kind === 'heal' ? ui.healing : ui.damage}</dt>
              <dd>{Math.round(a.damageMult * 100)}%</dd>
            </div>
            {#if a.dotTicks && a.dotDurationSec}
              <div class="flex justify-between">
                <dt class="text-[var(--text-dim)]">{ui.overTime}</dt>
                <dd>{a.dotTicks} ticks / {a.dotDurationSec}s</dd>
              </div>
            {/if}
            {#if a.drainHealFraction}
              <div class="flex justify-between">
                <dt class="text-[var(--text-dim)]">{ui.drainHeal}</dt>
                <dd>{Math.round(a.drainHealFraction * 100)}%</dd>
              </div>
            {/if}
            {#if a.executeBelowPct}
              <div class="flex justify-between">
                <dt class="text-[var(--text-dim)]">{ui.execute}</dt>
                <dd>{Math.round(a.executeBelowPct * 100)}%</dd>
              </div>
            {/if}
            {#if a.mitigationPct}
              <div class="flex justify-between">
                <dt class="text-[var(--text-dim)]">{ui.mitigation}</dt>
                <dd>{Math.round(a.mitigationPct * 100)}% / {a.mitigationDurationSec}s</dd>
              </div>
            {/if}
          </dl>
        {:else}
          <h2 class="text-xl font-bold text-[var(--gold-bright)]">{name}</h2>
          <p class="mt-3 text-sm text-[var(--text-faint)]">{ui.noData}</p>
        {/if}

        <button class="btn btn-sm mt-4 w-full" onclick={close}>{ui.close}</button>
      </div>
    </div>
  </div>
{/if}
