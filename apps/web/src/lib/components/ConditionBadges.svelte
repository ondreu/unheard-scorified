<script lang="ts">
  /**
   * Zobrazení aktivních conditionů (status efektů) na kartě aktéra (Slice 2d UI).
   * Pro každou condition ukáže ikonu + zbývající počet tahů a po hoveru (desktop) /
   * tapu (mobil) **popisek efektu** (Slowed = bez bonus akce + disadvantage, …).
   * Metadata (ikona/štítek/popis) táhne ze sdíleného `CONDITION_META` (jediný zdroj
   * pravdy) — žádné hardcoded stringy v UI. Data jsou `ActiveCondition[]` z combat
   * API (enemy/player/member).
   */
  import { CONDITION_META, type ActiveCondition } from '@game/shared';

  let { conditions = [] }: { conditions?: ActiveCondition[] } = $props();

  const active = $derived((conditions ?? []).filter((c) => c.turns > 0));

  // Tap-pin pro mobil/touch (na desktopu stačí hover). Jen jeden otevřený naráz.
  let pinned = $state<string | null>(null);

  function toggle(type: string, e: MouseEvent): void {
    e.stopPropagation();
    pinned = pinned === type ? null : type;
  }
</script>

{#if active.length > 0}
  <span class="conds" aria-label="Active conditions">
    {#each active as c (c.type)}
      {@const meta = CONDITION_META[c.type]}
      <span class="cond-wrap">
        <button
          type="button"
          class="cond"
          aria-label={`${meta.label}: ${meta.description}`}
          onclick={(e) => toggle(c.type, e)}
          onmouseleave={() => (pinned = null)}
        >
          <span class="icon">{meta.icon}</span>
          <span class="turns">{c.turns}</span>
        </button>
        <span class="tip" class:pinned={pinned === c.type} role="tooltip">
          <span class="tip-title">{meta.icon} {meta.label}</span>
          <span class="tip-body">{meta.description}</span>
          <span class="tip-turns"
            >{c.turns} turn{c.turns === 1 ? '' : 's'} left</span
          >
        </span>
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
  .cond-wrap {
    position: relative;
    display: inline-flex;
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
    cursor: help;
  }
  .icon {
    font-size: 0.8rem;
  }
  .turns {
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .tip {
    position: absolute;
    bottom: calc(100% + 0.35rem);
    left: 0;
    z-index: 30;
    width: max-content;
    max-width: 14rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.45rem 0.55rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border, #555);
    background: var(--bg-panel, #1a1410);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    opacity: 0;
    pointer-events: none;
    transform: translateY(0.2rem);
    transition:
      opacity 0.12s ease,
      transform 0.12s ease;
  }
  .tip-title {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--gold-bright, #f8b700);
  }
  .tip-body {
    font-size: 0.7rem;
    color: var(--text, #ddd);
    line-height: 1.25;
  }
  .tip-turns {
    font-size: 0.65rem;
    color: var(--text-faint, #888);
  }
  /* Desktop hover (jemné pointer zařízení) */
  @media (hover: hover) and (pointer: fine) {
    .cond-wrap:hover .tip {
      opacity: 1;
      transform: translateY(0);
    }
  }
  /* Tap-pin (mobil i desktop) */
  .tip.pinned {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
</style>
