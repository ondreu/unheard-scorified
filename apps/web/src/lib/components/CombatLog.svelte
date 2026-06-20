<script lang="ts" module>
  /** Strana aktéra v boji — řídí barvu jména i levý okraj řádku. */
  export type ActorSide = 'player' | 'ally' | 'enemy';
  /**
   * Metadata aktéra pro log. `id` (characterId) zpřístupní klik na profil
   * u hráče/spojence; enemy se klikne na NPC kartu jen když je v bestiáři.
   */
  export interface ActorMeta {
    side: ActorSide;
    id?: string;
  }
</script>

<script lang="ts">
  /**
   * Sdílený combat log (dungeon/raid/aréna/gauntlet). Vykresluje předpočítanou
   * timeline a **rozlišuje strany** (hráč / spojenec / nepřítel) barvou jména a
   * barevným levým okrajem řádku podle jednajícího aktéra (`source`). Jména NPC
   * a ability jsou klikatelné (→ detail karta), jména hráčů/spojenců s `id` →
   * profil.
   *
   * Stranu bere primárně z mapy `actors` (jméno → {side, id}), kterou dodá
   * volající z dat běhu (zná svou partu i nepřátele). Bez `actors` spadne na
   * heuristiku: `players` (jméno → characterId) = hráč, `findEnemyByName` =
   * nepřítel, zbytek neutrální.
   *
   * Tokenizace: pro každý řádek bereme strukturovaná pole `source`/`target`
   * (max 2 jména) + `ability`, najdeme jejich výskyt v hotové zprávě a obalíme
   * je segmentem. Zbytek zůstává plain text → robustní vůči formátu zprávy.
   */
  import { findAbilityByName, findEnemyByName } from '@game/shared';
  import type { CombatEvent } from '$lib/api';
  import { openAbility, openNpc, openProfile } from '$lib/ui-stores';
  import PixelAbilityIcon from './PixelAbilityIcon.svelte';

  let {
    events,
    players = {},
    actors = {},
  }: {
    events: CombatEvent[];
    players?: Record<string, string>;
    actors?: Record<string, ActorMeta>;
  } = $props();

  type Seg =
    | { kind: 'text'; text: string }
    | { kind: 'actor'; text: string; side: ActorSide; id?: string }
    | { kind: 'ability'; text: string };

  /** Určí stranu a klikatelnost jména: nejdřív `actors`, pak heuristika. */
  function classify(name: string): Seg | null {
    const meta = actors[name];
    if (meta) return { kind: 'actor', text: name, side: meta.side, id: meta.id };
    if (players[name]) return { kind: 'actor', text: name, side: 'player', id: players[name] };
    if (findEnemyByName(name)) return { kind: 'actor', text: name, side: 'enemy' };
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

  const SIDE_COLOR: Record<ActorSide, string> = {
    player: 'var(--accent)',
    ally: 'var(--info)',
    enemy: 'var(--danger)',
  };

  /**
   * Lze na jméno kliknout? Aktér s `id` (hráč i PVP soupeř) → profil; enemy bez
   * id, který je v bestiáři → NPC karta.
   */
  function actorClickable(seg: Extract<Seg, { kind: 'actor' }>): boolean {
    if (seg.id) return true;
    return seg.side === 'enemy' && !!findEnemyByName(seg.text);
  }

  function activate(seg: Seg): void {
    if (seg.kind === 'ability') {
      openAbility(seg.text);
    } else if (seg.kind === 'actor') {
      if (seg.id) openProfile(seg.id, seg.text);
      else if (seg.side === 'enemy') openNpc(seg.text);
    }
  }

  /** Strana jednajícího aktéra → barva levého okraje řádku. */
  function lineSide(e: CombatEvent): ActorSide | null {
    if (!e.source) return null;
    const meta = actors[e.source];
    if (meta) return meta.side;
    if (players[e.source]) return 'player';
    if (findEnemyByName(e.source)) return 'enemy';
    return null;
  }

  /** Barva textu řádku podle typu eventu (verby/čísla/výsledkové hlášky). */
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

  function lineStyle(e: CombatEvent): string {
    const side = lineSide(e);
    const border = side
      ? `border-left:2px solid ${SIDE_COLOR[side]};padding-left:0.4rem`
      : 'border-left:2px solid transparent;padding-left:0.4rem';
    return `${eventStyle(e)};${border}`;
  }
</script>

<section class="panel panel-pad">
  <ul class="space-y-1 font-mono text-xs">
    {#each [...events].reverse() as e, i (events.length - 1 - i)}
      <li style={lineStyle(e)}>
        <span class="text-[var(--text-faint)]">{e.t.toFixed(1)}s</span>
        {#each segments(e) as seg, si (si)}{#if seg.kind === 'text'}{seg.text}{:else if seg.kind === 'ability'}<PixelAbilityIcon
              name={seg.text}
              size={12}
            /><button
              class="underline decoration-dotted underline-offset-2 hover:decoration-solid"
              onclick={() => activate(seg)}>{seg.text}</button
            >{:else if actorClickable(seg)}<button
              class="font-semibold underline decoration-dotted underline-offset-2 hover:decoration-solid"
              style={`color:${SIDE_COLOR[seg.side]}`}
              onclick={() => activate(seg)}>{seg.text}</button
            >{:else}<span class="font-semibold" style={`color:${SIDE_COLOR[seg.side]}`}
              >{seg.text}</span
            >{/if}{/each}
      </li>
    {/each}
  </ul>
</section>
