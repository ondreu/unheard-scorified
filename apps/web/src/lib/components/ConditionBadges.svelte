<script lang="ts">
  /**
   * Zobrazení aktivních conditionů (status efektů) na kartě aktéra (Slice 2d UI).
   * Pro každou condition ukáže ikonu + zbývající počet tahů. Metadata (ikona/štítek)
   * táhne ze sdíleného `CONDITION_META` (jediný zdroj pravdy) — žádné hardcoded
   * stringy v UI. Data jsou `ActiveCondition[]` z combat API (enemy/player/member).
   */
  import { CONDITION_META, type ActiveCondition } from '@game/shared';

  let { conditions = [] }: { conditions?: ActiveCondition[] } = $props();

  const active = $derived((conditions ?? []).filter((c) => c.turns > 0));
</script>

{#if active.length > 0}
  <span class="conds" aria-label="Active conditions">
    {#each active as c (c.type)}
      {@const meta = CONDITION_META[c.type]}
      <span class="cond" title={`${meta.label} (${c.turns} turn${c.turns === 1 ? '' : 's'})`}>
        <span class="icon">{meta.icon}</span>
        <span class="turns">{c.turns}</span>
      </span>
    {/each}
  </span>
{/if}

<style>
  .conds {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    align-items: center;
  }
  .cond {
    display: inline-flex;
    align-items: center;
    gap: 0.1rem;
    padding: 0.05rem 0.3rem;
    border-radius: 0.4rem;
    background: color-mix(in srgb, var(--danger) 18%, transparent);
    border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent);
    font-size: 0.7rem;
    line-height: 1;
  }
  .icon {
    font-size: 0.8rem;
  }
  .turns {
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
</style>
