<script lang="ts">
  /**
   * „Inspect" karta NPC (klik na jméno nepřítele v combat logu). Analogie
   * PlayerProfile, ale pro NPC — staty z `findEnemyByName` (statická herní data)
   * + případné boss ability. UI strings anglicky (game language = EN).
   */
  import { findEnemyByName } from '@game/shared';
  import { inspectNpc, openAbility } from '$lib/ui-stores';
  import Badge from './Badge.svelte';

  const ui = {
    boss: 'Boss',
    foundIn: 'Found in',
    stats: 'Stats',
    health: 'Health',
    attackPower: 'Attack power',
    swing: 'Swing interval',
    armor: 'Armor',
    abilities: 'Abilities',
    noData: 'No data for this enemy.',
    close: 'Close',
  };

  const name = $derived($inspectNpc);
  const npc = $derived(name ? findEnemyByName(name) : undefined);

  function close(): void {
    inspectNpc.set(null);
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
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="truncate text-xl font-bold text-[var(--gold-bright)]">{name}</h2>
            {#if npc}
              <p class="mt-0.5 text-sm text-[var(--text-dim)]">
                {ui.foundIn}: {npc.source}
              </p>
            {/if}
          </div>
          {#if npc?.isBoss}
            <Badge color="var(--danger)" icon="💀">{ui.boss}</Badge>
          {/if}
        </div>

        <hr class="divider my-4" />

        {#if npc}
          {@const n = npc}
          <h3 class="panel-title text-sm">{ui.stats}</h3>
          <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div class="flex justify-between">
              <dt class="text-[var(--text-dim)]">{ui.health}</dt>
              <dd>{n.maxHealth}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-[var(--text-dim)]">{ui.attackPower}</dt>
              <dd>{Math.round(n.attackPower)}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-[var(--text-dim)]">{ui.swing}</dt>
              <dd>{n.swingInterval}s</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-[var(--text-dim)]">{ui.armor}</dt>
              <dd>{n.armor}</dd>
            </div>
          </dl>

          {#if n.abilities.length > 0}
            <h3 class="panel-title mt-4 text-sm">{ui.abilities}</h3>
            <ul class="mt-2 space-y-1 text-sm">
              {#each n.abilities as a (a.name)}
                <li class="flex items-center justify-between gap-2 rounded bg-black/20 px-2 py-1">
                  <button
                    class="truncate text-left text-[var(--info)] hover:underline"
                    onclick={() => openAbility(a.name)}>{a.name}</button
                  >
                  <span class="shrink-0 text-xs text-[var(--text-faint)]">
                    {Math.round(a.damageMult * 100)}% · {a.cooldownSec}s
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        {:else}
          <p class="text-sm text-[var(--text-faint)]">{ui.noData}</p>
        {/if}

        <button class="btn btn-sm mt-4 w-full" onclick={close}>{ui.close}</button>
      </div>
    </div>
  </div>
{/if}
