<script lang="ts">
  /**
   * Sdílený combat log (dungeon/raid/aréna). Vykresluje předpočítanou timeline
   * a dělá **jména NPC** a **ability klikatelné** (→ detail karta). Jména hráčů
   * jsou klikatelná, když volající dodá mapu `players` (jméno → characterId);
   * combat eventy samy nesou jen jména, ne id.
   *
   * Tokenizace: pro každý řádek bereme strukturovaná pole `source`/`target`
   * (max 2 jména) + `ability`, najdeme jejich výskyt v hotové zprávě a obalíme
   * je tlačítkem. Zbytek zůstává plain text → robustní vůči formátu zprávy.
   */
  import { findAbilityByName, findEnemyByName } from '@game/shared';
  import type { CombatEvent } from '$lib/api';
  import { openAbility, openNpc, openProfile } from '$lib/ui-stores';
  import PixelAbilityIcon from './PixelAbilityIcon.svelte';

  let {
    events,
    players = {},
  }: { events: CombatEvent[]; players?: Record<string, string> } = $props();

  type Seg =
    | { kind: 'text'; text: string }
    | { kind: 'player'; text: string; id: string }
    | { kind: 'npc'; text: string }
    | { kind: 'ability'; text: string };

  function classify(name: string): Seg | null {
    if (players[name]) return { kind: 'player', text: name, id: players[name] };
    if (findEnemyByName(name)) return { kind: 'npc', text: name };
    return null;
  }

  /** Posbírá klikatelné tokeny řádku (jména + ability), nejdelší první. */
  function tokensFor(e: CombatEvent): Seg[] {
    const map = new Map<string, Seg>();
    for (const n of [e.source, e.target]) {
      if (!n || map.has(n)) continue;
      const seg = classify(n);
      if (seg) map.set(n, seg);
    }
    if (e.ability && !map.has(e.ability) && findAbilityByName(e.ability)) {
      map.set(e.ability, { kind: 'ability', text: e.ability });
    }
    return [...map.values()].sort((a, b) => b.text.length - a.text.length);
  }

  /** Rozseká zprávu na plain a klikatelné segmenty (jeden průchod zleva). */
  function segments(e: CombatEvent): Seg[] {
    const tokens = tokensFor(e);
    if (tokens.length === 0) return [{ kind: 'text', text: e.message }];
    const out: Seg[] = [];
    const msg = e.message;
    let buf = '';
    let i = 0;
    outer: while (i < msg.length) {
      for (const tok of tokens) {
        if (msg.startsWith(tok.text, i)) {
          if (buf) {
            out.push({ kind: 'text', text: buf });
            buf = '';
          }
          out.push({ ...tok });
          i += tok.text.length;
          continue outer;
        }
      }
      buf += msg[i];
      i += 1;
    }
    if (buf) out.push({ kind: 'text', text: buf });
    return out;
  }

  function activate(seg: Seg): void {
    if (seg.kind === 'player') openProfile(seg.id, seg.text);
    else if (seg.kind === 'npc') openNpc(seg.text);
    else if (seg.kind === 'ability') openAbility(seg.text);
  }

  function eventStyle(e: CombatEvent): string {
    if (e.type === 'victory') return 'color:var(--success);font-weight:600';
    if (e.type === 'defeat' || e.type === 'player_defeated')
      return 'color:var(--danger);font-weight:600';
    if (e.type === 'encounter_start') return 'color:var(--gold-bright);font-weight:600';
    if (e.type === 'enemy_defeated') return 'color:var(--success)';
    if (e.type === 'heal') return 'color:var(--success)';
    if (e.type === 'drain') return 'color:var(--success);opacity:0.9';
    if (e.type === 'dot') return 'color:var(--gold-bright)';
    if (e.type === 'absorb') return 'color:var(--info);opacity:0.8';
    if (e.type === 'ability') return 'color:var(--info)';
    return 'color:var(--text-dim)';
  }
</script>

<section class="panel panel-pad">
  <ul class="space-y-1 font-mono text-xs">
    {#each [...events].reverse() as e, i (events.length - 1 - i)}
      <li style={eventStyle(e)}>
        <span class="text-[var(--text-faint)]">{e.t.toFixed(1)}s</span>
        {#each segments(e) as seg, si (si)}{#if seg.kind === 'text'}{seg.text}{:else if seg.kind === 'ability'}<PixelAbilityIcon
              name={seg.text}
              size={12}
            /><button
              class="underline decoration-dotted underline-offset-2 hover:decoration-solid"
              onclick={() => activate(seg)}>{seg.text}</button
            >{:else}<button
              class="underline decoration-dotted underline-offset-2 hover:decoration-solid"
              onclick={() => activate(seg)}>{seg.text}</button
            >{/if}{/each}
      </li>
    {/each}
  </ul>
</section>
