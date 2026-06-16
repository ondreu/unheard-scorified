<script lang="ts">
  import type { CombatEvent } from '$lib/api';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  let { events = [], names }: { events?: CombatEvent[]; names?: string[] } = $props();

  interface MeterRow {
    name: string;
    damage: number;
    healing: number;
    dps: number;
    hps: number;
  }

  // Délka okna = poslední odhalená událost (živý reveal) → DPS/HPS odpovídá tomu,
  // co je vidět v logu. Deterministické, počítané jen z událostí (žádný stav).
  const window = $derived(Math.max(1, ...events.map((e) => e.t)));

  const rows = $derived.by((): MeterRow[] => {
    const dmg = new Map<string, number>();
    const heal = new Map<string, number>();
    for (const e of events) {
      if (!e.source || typeof e.amount !== 'number') continue;
      if (e.type === 'heal') heal.set(e.source, (heal.get(e.source) ?? 0) + e.amount);
      else if (e.type === 'attack' || e.type === 'ability' || e.type === 'dot' || e.type === 'drain')
        dmg.set(e.source, (dmg.get(e.source) ?? 0) + e.amount);
    }
    const keys = names ?? [...new Set([...dmg.keys(), ...heal.keys()])];
    return keys
      .map((name) => {
        const damage = dmg.get(name) ?? 0;
        const healing = heal.get(name) ?? 0;
        return { name, damage, healing, dps: damage / window, hps: healing / window };
      })
      .filter((r) => r.damage > 0 || r.healing > 0)
      .sort((a, b) => b.damage + b.healing - (a.damage + a.healing));
  });

  function fmt(n: number): string {
    return Math.round(n).toLocaleString('en-US');
  }
  const topDps = $derived(Math.max(1, ...rows.map((r) => r.dps)));
  const topHps = $derived(Math.max(1, ...rows.map((r) => r.hps)));
</script>

{#if rows.length > 0}
  <details class="panel panel-pad text-sm">
    <summary class="cursor-pointer select-none font-semibold text-[var(--text)]">
      📊 Damage &amp; Healing meters
    </summary>
    <table class="mt-3 w-full text-xs">
      <thead class="text-[var(--text-faint)]">
        <tr>
          <th class="text-left font-normal">Name</th>
          <th class="text-right font-normal">DPS</th>
          <th class="text-right font-normal">Damage</th>
          <th class="text-right font-normal">HPS</th>
          <th class="text-right font-normal">Healing</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.name)}
          <tr class="border-t border-[var(--border)]/40">
            <td class="py-1 text-[var(--text)]">{r.name}</td>
            <td class="py-1 text-right">
              <span class="text-[var(--gold-bright)]">{fmt(r.dps)}</span>
              <span class="ml-1 inline-block h-1 w-10 align-middle bg-[var(--bg-elev)]">
                <span class="block h-1 bg-[var(--gold)]" style={`width:${(100 * r.dps) / topDps}%`}></span>
              </span>
            </td>
            <td class="py-1 text-right text-[var(--text-dim)]">{fmt(r.damage)}</td>
            <td class="py-1 text-right">
              {#if r.healing > 0}
                <span class="text-[var(--success)]">{fmt(r.hps)}</span>
                <span class="ml-1 inline-block h-1 w-10 align-middle bg-[var(--bg-elev)]">
                  <span class="block h-1 bg-[var(--success)]" style={`width:${(100 * r.hps) / topHps}%`}></span>
                </span>
              {:else}<span class="text-[var(--text-faint)]">—</span>{/if}
            </td>
            <td class="py-1 text-right text-[var(--text-dim)]">{r.healing > 0 ? fmt(r.healing) : '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </details>
{/if}
