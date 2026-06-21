<script lang="ts">
  /**
   * Grafická karta kouzla/techniky (Spell UI, Slice 3) — nahrazuje „AI-slop" textová
   * tlačítka skutečnou kartou: název, ikona, typ, poškození **jako kostky i číselný
   * rozptyl** (8d6 → 8–48), cooldown, slot cost, save DC, AoE/DoT/upcast.
   *
   * Renderuje sdílený struct `SpellCardInfo` (`buildSpellCard` z @game/shared) →
   * jediný zdroj pravdy, zobrazení se nerozejde s enginem. Použito v inspect modalu
   * i jako hover/tap tooltip nad combat tlačítky.
   */
  import { buildSpellCard, type SignatureAbility } from '@game/shared';
  import Badge from './Badge.svelte';
  import PixelAbilityIcon from './PixelAbilityIcon.svelte';

  let {
    ability,
    level = 1,
    slotTier = null,
    spellSaveDc,
    compact = false,
  }: {
    ability: SignatureAbility;
    level?: number;
    slotTier?: number | null;
    spellSaveDc?: number;
    compact?: boolean;
  } = $props();

  const KIND_META: Record<string, { label: string; color: string; icon: string }> = {
    strike: { label: 'Strike', color: 'var(--info)', icon: '⚔️' },
    drain: { label: 'Drain', color: 'var(--success)', icon: '🩸' },
    dot: { label: 'Damage over time', color: 'var(--gold-bright)', icon: '🔥' },
    heal: { label: 'Heal', color: 'var(--success)', icon: '✨' },
    shield: { label: 'Shield', color: 'var(--info)', icon: '🛡️' },
    mitigation: { label: 'Mitigation', color: 'var(--info)', icon: '🛡️' },
    buff: { label: 'Concentration', color: 'var(--gold-bright)', icon: '🔮' },
  };

  const ABILITY_NUM = { dexterity: 'DEX', strength: 'STR', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA' } as Record<string, string>;

  // Damage typy (D&D 5e) — ikona + barva pro čitelný element chip na kartě. Jediné
  // místo, kde se mapuje vzhled typu poškození v UI (fire/cold/force/…).
  const DTYPE_META: Record<string, { icon: string; color: string }> = {
    slashing: { icon: '⚔️', color: '#b9c2cc' },
    piercing: { icon: '🗡️', color: '#b9c2cc' },
    bludgeoning: { icon: '🔨', color: '#b9c2cc' },
    fire: { icon: '🔥', color: '#ff7043' },
    cold: { icon: '❄️', color: '#4fc3f7' },
    lightning: { icon: '⚡', color: '#ffd54f' },
    thunder: { icon: '💥', color: '#9fa8da' },
    acid: { icon: '🧪', color: '#9ccc65' },
    poison: { icon: '☠️', color: '#7cb342' },
    necrotic: { icon: '💀', color: '#8e7cc3' },
    radiant: { icon: '✨', color: '#ffe082' },
    force: { icon: '🌀', color: '#ce93d8' },
    psychic: { icon: '🧠', color: '#f06292' },
  };

  const card = $derived(buildSpellCard(ability, { level, slotTier, spellSaveDc }));
  const meta = $derived(KIND_META[card.kind] ?? { label: card.kind, color: 'var(--text-dim)', icon: '✨' });
  const dtype = $derived(card.damageType ? DTYPE_META[card.damageType] : undefined);

  function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function slotLabel(c: typeof card): string {
    if (c.isMartial) return 'Technique';
    if (c.isCantrip) return 'Cantrip · at-will';
    return `Level ${c.spellTier} · 1 slot`;
  }
</script>

<div class="spell-card" class:compact>
  <div class="head">
    <PixelAbilityIcon name={ability.name} kind={ability.kind} size={compact ? 26 : 32} dim={16} />
    <div class="min-w-0 flex-1">
      <div class="name">{card.name}</div>
      <div class="sub">{slotLabel(card)}{#if card.actionCost === 'bonus'} · Bonus action{/if}</div>
    </div>
    <div class="head-badges">
      {#if card.damageType && dtype}
        <span class="dtype-chip" style={`--dtype:${dtype.color}`} title={`${cap(card.damageType)} damage`}>
          {dtype.icon} {cap(card.damageType)}
        </span>
      {/if}
      <Badge color={meta.color} icon={meta.icon}>{meta.label}</Badge>
    </div>
  </div>

  {#if card.description && !compact}
    <p class="desc">{card.description}</p>
  {/if}

  <dl class="stats">
    {#if card.damage}
      <div class="row">
        <dt>{card.kind === 'heal' ? 'Healing' : 'Damage'}</dt>
        <dd>
          <span class="dice">{card.damage.notation}</span>
          <span class="range">({card.damage.range})</span>
        </dd>
      </div>
    {/if}
    {#if card.bonusDamage}
      <div class="row">
        <dt>Bonus</dt>
        <dd><span class="dice">+{card.bonusDamage.notation}</span> <span class="range">({card.bonusDamage.range})</span> on hit</dd>
      </div>
    {/if}
    {#if card.rider}
      <div class="row">
        <dt>Per hit</dt>
        <dd><span class="dice">+{card.rider.notation}</span> <span class="range">({card.rider.range})</span></dd>
      </div>
    {/if}
    {#if card.dot}
      <div class="row">
        <dt>Over time</dt>
        <dd>
          {#if card.dot.perTick}<span class="dice">{card.dot.perTick.notation}</span> / tick{/if}
          {#if card.dot.ticks && card.dot.durationSec}<span class="range"> · {card.dot.ticks}× / {card.dot.durationSec}s</span>{/if}
        </dd>
      </div>
    {/if}
    {#if card.save}
      <div class="row">
        <dt>Save</dt>
        <dd>{ABILITY_NUM[card.save.ability] ?? card.save.ability}{#if card.save.dc} DC {card.save.dc}{/if} <span class="range">({card.save.effect === 'half' ? 'half' : 'negates'})</span></dd>
      </div>
    {/if}
    {#if card.drainHealFraction}
      <div class="row"><dt>Heals for</dt><dd>{Math.round(card.drainHealFraction * 100)}% of damage</dd></div>
    {/if}
    {#if card.mitigation}
      <div class="row"><dt>Damage reduced</dt><dd>{Math.round(card.mitigation.pct * 100)}%{#if card.mitigation.durationSec} / {card.mitigation.durationSec}s{/if}</dd></div>
    {/if}
    {#if card.validTargetTypes && card.validTargetTypes.length > 0}
      <div class="row"><dt>Targets</dt><dd class="capitalize">{card.validTargetTypes.join(', ')} only</dd></div>
    {/if}
    <div class="row">
      <dt>Cooldown</dt>
      <dd>{card.cooldownSec > 0 ? `${card.cooldownSec}s` : '—'}</dd>
    </div>
    {#if card.kiCost}
      <div class="row"><dt>Ki</dt><dd>🌀 {card.kiCost}</dd></div>
    {/if}
  </dl>

  {#if card.upcastPerSlot || card.aoe || card.autoHit || card.advantage || card.oncePerCombat}
    <div class="tags">
      {#if card.aoe}<span class="tag">AoE</span>{/if}
      {#if card.autoHit}<span class="tag">Auto-hit</span>{/if}
      {#if card.advantage}<span class="tag">Advantage</span>{/if}
      {#if card.oncePerCombat}<span class="tag">1× / combat</span>{/if}
      {#if card.upcastPerSlot}<span class="tag">Upcast +{card.upcastPerSlot}d / slot</span>{/if}
    </div>
  {/if}
</div>

<style>
  .spell-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
    max-width: 20rem;
    padding: 0.75rem;
    border-radius: 0.75rem;
    border: 1px solid var(--border, #444);
    background: var(--surface, #1a1a22);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  }
  .spell-card.compact {
    gap: 0.35rem;
    padding: 0.55rem;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .head-badges {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.25rem;
  }
  .dtype-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    color: var(--dtype);
    border: 1px solid color-mix(in srgb, var(--dtype) 45%, transparent);
    background: color-mix(in srgb, var(--dtype) 14%, transparent);
    white-space: nowrap;
  }
  .name {
    font-weight: 700;
    color: var(--gold-bright, #e8c66a);
    line-height: 1.1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    font-size: 0.68rem;
    color: var(--text-dim, #9aa);
  }
  .desc {
    font-size: 0.78rem;
    font-style: italic;
    line-height: 1.4;
    color: var(--text-dim, #9aa);
    margin: 0;
  }
  .stats {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.8rem;
    margin: 0;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .row dt {
    color: var(--text-dim, #9aa);
  }
  .row dd {
    margin: 0;
    text-align: right;
  }
  .dice {
    font-weight: 700;
    color: var(--text, #eee);
  }
  .range {
    color: var(--text-dim, #9aa);
    font-size: 0.74rem;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .tag {
    font-size: 0.64rem;
    font-weight: 600;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    color: var(--accent, #7db4e0);
    border: 1px solid color-mix(in srgb, var(--accent, #7db4e0) 35%, transparent);
  }
</style>
