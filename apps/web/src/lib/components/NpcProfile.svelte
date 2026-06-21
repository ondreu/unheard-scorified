<script lang="ts">
  /**
   * „Inspect" karta NPC (klik na jméno nepřítele v combat logu / bojové kartě).
   * Staty z `findEnemyByName` (statická herní data) + když má NPC katalogovou
   * identitu, **stejný stat-block jako bestiář** (creature type, AC, resistance /
   * vulnerability / immunity, popsané ability). UI strings anglicky (game language).
   */
  import { findEnemyByName } from '@game/shared';
  import { inspectNpc, openAbility } from '$lib/ui-stores';
  import Badge from './Badge.svelte';

  const ui = {
    boss: 'Boss',
    foundIn: 'Found in',
    stats: 'Stats',
    health: 'Health',
    armorClass: 'Armor Class',
    attackPower: 'Attack power',
    swing: 'Swing interval',
    attack: 'Attack type',
    resist: 'Resists',
    vuln: 'Vulnerable',
    immune: 'Immune',
    abilities: 'Abilities',
    noData: 'No data for this enemy.',
    close: 'Close',
  };

  const name = $derived($inspectNpc);
  const npc = $derived(name ? findEnemyByName(name) : undefined);
  const bestiary = $derived(npc?.bestiary);

  function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

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
            <h2 class="truncate text-xl font-bold text-[var(--gold-bright)]">
              {#if bestiary}{bestiary.creatureTypeIcon} {/if}{name}
            </h2>
            {#if bestiary}
              <p class="mt-0.5 text-sm text-[var(--text-dim)]">
                CR {bestiary.crLabel} · {bestiary.creatureTypeLabel}
              </p>
            {/if}
            {#if npc}
              <p class="mt-0.5 text-xs text-[var(--text-faint)]">
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
          {#if bestiary?.description}
            <p class="mb-3 text-sm text-[var(--text-dim)]">{bestiary.description}</p>
          {/if}

          <h3 class="panel-title text-sm">{ui.stats}</h3>
          <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div class="flex justify-between">
              <dt class="text-[var(--text-dim)]">{ui.health}</dt>
              <dd>{n.maxHealth}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-[var(--text-dim)]">{ui.armorClass}</dt>
              <dd>{n.armorClass}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-[var(--text-dim)]">{ui.attackPower}</dt>
              <dd>{Math.round(n.attackPower)}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-[var(--text-dim)]">{ui.swing}</dt>
              <dd>{n.swingInterval}s</dd>
            </div>
          </dl>

          {#if bestiary}
            <div class="mt-3 flex flex-wrap gap-1 text-xs">
              <span class="npc-chip">{ui.attack}: {cap(bestiary.attackType)}</span>
              {#each bestiary.resistances as r (r)}
                <span class="npc-chip" style="color:var(--info)">{ui.resist}: {cap(r)}</span>
              {/each}
              {#each bestiary.vulnerabilities as v (v)}
                <span class="npc-chip" style="color:var(--danger)">{ui.vuln}: {cap(v)}</span>
              {/each}
              {#each bestiary.immunities as im (im)}
                <span class="npc-chip" style="color:var(--gold-bright)">{ui.immune}: {cap(im)}</span>
              {/each}
            </div>
          {/if}

          {#if bestiary && bestiary.abilities.length > 0}
            <h3 class="panel-title mt-4 text-sm">{ui.abilities}</h3>
            <ul class="mt-2 space-y-2">
              {#each bestiary.abilities as a (a.id)}
                <li class="rounded-lg border border-[var(--border)] p-2">
                  <button
                    class="text-left text-sm font-semibold text-[var(--info)] hover:underline"
                    onclick={() => openAbility(a.name)}>{a.name}</button
                  >
                  {#if a.condition}<span class="text-xs" style="color:var(--danger)">
                      · {cap(a.condition)}</span
                    >{/if}
                  <p class="text-xs text-[var(--text-dim)]">{a.description}</p>
                  <p class="text-[11px] text-[var(--text-faint)]">
                    {cap(a.damageType)} · cd {a.cooldownSec}s{#if a.saveAbility}
                      · {a.saveAbility.toUpperCase()} save{/if}
                  </p>
                </li>
              {/each}
            </ul>
          {:else if n.abilities.length > 0}
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

<style>
  .npc-chip {
    border: 1px solid var(--border);
    border-radius: 9999px;
    padding: 0.05rem 0.4rem;
    color: var(--text-dim);
  }
</style>
