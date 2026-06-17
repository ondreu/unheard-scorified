<script lang="ts">
  import { onMount } from 'svelte';
  import {
    devAddGold,
    devAddItem,
    devClearLockouts,
    devCompleteActivity,
    devCompleteQuest,
    devGetState,
    devGrantMounts,
    devListItems,
    devListProfessions,
    devListQuests,
    devResetCharacter,
    devSetArenaRating,
    devSetLevel,
    devSetProfession,
    devSetReputation,
    devTimeWarp,
    type DevCharacterState,
    type DevItemDef,
    type DevProfessionDef,
    type DevQuestDef,
  } from './api';

  let { characterId }: { characterId: string } = $props();

  let open: boolean = $state(false);
  let charState: DevCharacterState | null = $state(null);
  let items: DevItemDef[] = $state([]);
  let professions: DevProfessionDef[] = $state([]);
  let quests: DevQuestDef[] = $state([]);
  let feedback: string | null = $state(null);
  let busy: boolean = $state(false);

  // Form values
  let levelInput: number = $state(1);
  let goldInput: number = $state(1000);
  let selectedItem: string = $state('');
  let itemQty: number = $state(1);
  let warpHours: number = $state(1);
  let selectedProfession: string = $state('');
  let profSkill: number = $state(150);
  let arenaBracket: string = $state('1v1');
  let arenaRating: number = $state(1500);
  let selectedFaction: string = $state('miners_league');
  let repStanding: number = $state(3000);
  let selectedQuest: string = $state('');

  onMount(async () => {
    const [s, i, p, q] = await Promise.all([
      devGetState(characterId),
      devListItems(characterId),
      devListProfessions(characterId),
      devListQuests(characterId),
    ]);
    charState = s;
    items = i.sort((a, b) => a.itemLevel - b.itemLevel);
    professions = p;
    quests = q;
    levelInput = s.level;
    if (i[0]) selectedItem = i[0].id;
    if (p[0]) selectedProfession = p[0].id;
    if (q[0]) selectedQuest = q[0].id;
  });

  async function run<T>(fn: () => Promise<T>, msg: (r: T) => string) {
    if (busy) return;
    busy = true;
    feedback = null;
    try {
      const result = await fn();
      feedback = msg(result);
      charState = await devGetState(characterId);
    } catch (e) {
      feedback = `Error: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      busy = false;
    }
  }
</script>

{#if import.meta.env.DEV}
  <!-- Floating trigger button -->
  <button
    class="dev-toggle"
    onclick={() => { open = !open; }}
    title="Toggle dev tools"
  >
    DEV
  </button>

  {#if open}
    <div class="dev-panel">
      <div class="dev-header">
        <span>Dev Tools</span>
        {#if charState}
          <span class="dev-state">Lv{charState.level} · {charState.gold.toLocaleString()}g · {charState.totalXp.toLocaleString()} XP</span>
        {/if}
        <button class="dev-close" onclick={() => { open = false; }}>✕</button>
      </div>

      {#if feedback}
        <div class="dev-feedback">{feedback}</div>
      {/if}

      <div class="dev-sections">
        <!-- Level -->
        <section class="dev-section">
          <h3>Level</h3>
          <div class="dev-row">
            <input type="number" min="1" max="60" bind:value={levelInput} class="dev-input" />
            <button
              class="dev-btn"
              disabled={busy}
              onclick={() => run(() => devSetLevel(characterId, levelInput), (r) => `Level set to ${r.level}`)}
            >
              Set Level
            </button>
          </div>
        </section>

        <!-- Gold -->
        <section class="dev-section">
          <h3>Gold</h3>
          <div class="dev-row">
            <input type="number" min="1" max="10000000" bind:value={goldInput} class="dev-input" />
            <button
              class="dev-btn"
              disabled={busy}
              onclick={() => run(() => devAddGold(characterId, goldInput), (r) => `Gold: ${r.gold.toLocaleString()}`)}
            >
              Add Gold
            </button>
          </div>
        </section>

        <!-- Item -->
        <section class="dev-section">
          <h3>Add Item</h3>
          <div class="dev-row">
            <select bind:value={selectedItem} class="dev-select">
              {#each items as item}
                <option value={item.id}>[{item.rarity}] {item.name} (iLvl {item.itemLevel})</option>
              {/each}
            </select>
          </div>
          <div class="dev-row">
            <span class="dev-label">Qty</span>
            <input type="number" min="1" max="200" bind:value={itemQty} class="dev-input dev-input--sm" />
            <button
              class="dev-btn"
              disabled={busy || !selectedItem}
              onclick={() => run(() => devAddItem(characterId, selectedItem, itemQty), (r) => `Added ${r.quantity}× ${r.name}`)}
            >
              Add
            </button>
          </div>
        </section>

        <!-- Activity -->
        <section class="dev-section">
          <h3>Activity</h3>
          <div class="dev-row">
            <button
              class="dev-btn"
              disabled={busy}
              onclick={() => run(() => devCompleteActivity(characterId), (r) => r.message)}
            >
              Complete Activity
            </button>
          </div>
          <div class="dev-row">
            <span class="dev-label">Warp</span>
            <input type="number" min="1" max="720" bind:value={warpHours} class="dev-input dev-input--sm" />
            <span class="dev-label">h</span>
            <button
              class="dev-btn"
              disabled={busy}
              onclick={() => run(() => devTimeWarp(characterId, warpHours), (r) => r.message)}
            >
              Time Warp
            </button>
          </div>
        </section>

        <!-- Profession -->
        <section class="dev-section">
          <h3>Profession Skill</h3>
          <div class="dev-row">
            <select bind:value={selectedProfession} class="dev-select dev-select--sm">
              {#each professions as prof}
                <option value={prof.id}>{prof.name}</option>
              {/each}
            </select>
            <input type="number" min="1" max="150" bind:value={profSkill} class="dev-input dev-input--sm" />
            <button
              class="dev-btn"
              disabled={busy || !selectedProfession}
              onclick={() => run(() => devSetProfession(characterId, selectedProfession, profSkill), (r) => `${r.professionId} skill → ${r.skill}`)}
            >
              Set
            </button>
          </div>
        </section>

        <!-- Arena Rating -->
        <section class="dev-section">
          <h3>Arena Rating</h3>
          <div class="dev-row">
            <select bind:value={arenaBracket} class="dev-select dev-select--sm">
              <option value="1v1">1v1</option>
              <option value="3v3">3v3</option>
              <option value="5v5">5v5</option>
            </select>
            <input type="number" min="0" max="3500" bind:value={arenaRating} class="dev-input dev-input--sm" />
            <button
              class="dev-btn"
              disabled={busy}
              onclick={() => run(() => devSetArenaRating(characterId, arenaBracket, arenaRating), (r) => `${r.bracket} rating → ${r.rating} (${r.seasonId})`)}
            >
              Set
            </button>
          </div>
        </section>

        <!-- Reputation -->
        <section class="dev-section">
          <h3>Reputation</h3>
          <div class="dev-row">
            <select bind:value={selectedFaction} class="dev-select dev-select--sm">
              <option value="miners_league">Miners' League</option>
              <option value="herbalist_circle">Herbalist Circle</option>
              <option value="explorers_guild">Explorers' Guild</option>
            </select>
            <input type="number" min="0" max="6000" bind:value={repStanding} class="dev-input dev-input--sm" />
            <button
              class="dev-btn"
              disabled={busy}
              onclick={() => run(() => devSetReputation(characterId, selectedFaction, repStanding), (r) => `${r.factionId} → ${r.standing}`)}
            >
              Set
            </button>
          </div>
        </section>

        <!-- Complete Quest -->
        <section class="dev-section">
          <h3>Complete Quest</h3>
          <div class="dev-row">
            <select bind:value={selectedQuest} class="dev-select">
              {#each quests as q}
                <option value={q.id}>[{q.faction}/{q.zone}] {q.name}</option>
              {/each}
            </select>
          </div>
          <div class="dev-row">
            <button
              class="dev-btn"
              disabled={busy || !selectedQuest}
              onclick={() => run(() => devCompleteQuest(characterId, selectedQuest), (r) => r.alreadyDone ? `${r.questId} already done` : `Quest completed: ${r.questId}`)}
            >
              Complete
            </button>
          </div>
        </section>

        <!-- Mounts & Lockouts -->
        <section class="dev-section">
          <h3>Mounts & Lockouts</h3>
          <div class="dev-row">
            <button
              class="dev-btn"
              disabled={busy}
              onclick={() => run(() => devGrantMounts(characterId), () => 'All mounts granted')}
            >
              Grant All Mounts
            </button>
            <button
              class="dev-btn"
              disabled={busy}
              onclick={() => run(() => devClearLockouts(characterId), (r) => `Cleared ${r.cleared} lockout(s)`)}
            >
              Clear Lockouts
            </button>
          </div>
        </section>

        <!-- Reset -->
        <section class="dev-section dev-section--danger">
          <h3>Danger Zone</h3>
          <div class="dev-row">
            <button
              class="dev-btn dev-btn--danger"
              disabled={busy}
              onclick={() => {
                if (confirm('Reset character? This clears XP, gold, inventory, equipment and talents.')) {
                  run(() => devResetCharacter(characterId), () => 'Character reset to level 1');
                }
              }}
            >
              Reset Character
            </button>
          </div>
        </section>
      </div>
    </div>
  {/if}
{/if}

<style>
  .dev-toggle {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    z-index: 9999;
    background: #f59e0b;
    color: #000;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    padding: 0.3rem 0.5rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    opacity: 0.8;
    font-family: monospace;
  }
  .dev-toggle:hover { opacity: 1; }

  .dev-panel {
    position: fixed;
    bottom: 3rem;
    right: 1rem;
    z-index: 9998;
    width: 340px;
    max-height: 80vh;
    overflow-y: auto;
    background: #1a1a2e;
    border: 1px solid #f59e0b;
    border-radius: 6px;
    font-family: monospace;
    font-size: 0.8rem;
    color: #e5e5e5;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  }

  .dev-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #f59e0b;
    color: #000;
    font-weight: 700;
    font-size: 0.75rem;
  }
  .dev-state { flex: 1; font-size: 0.65rem; opacity: 0.8; }
  .dev-close {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.9rem;
    color: #000;
    padding: 0;
    line-height: 1;
  }

  .dev-feedback {
    padding: 0.4rem 0.75rem;
    background: #0d3320;
    color: #4ade80;
    font-size: 0.72rem;
    border-bottom: 1px solid #1e4d35;
  }

  .dev-sections { padding: 0.5rem 0; }

  .dev-section {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #2a2a4a;
  }
  .dev-section--danger { background: #200a0a; }
  .dev-section h3 {
    margin: 0 0 0.4rem;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #f59e0b;
  }

  .dev-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.35rem;
  }

  .dev-input {
    flex: 1;
    background: #0d0d1a;
    border: 1px solid #333366;
    border-radius: 3px;
    color: #e5e5e5;
    padding: 0.25rem 0.4rem;
    font-family: monospace;
    font-size: 0.78rem;
  }
  .dev-input--sm { flex: 0 0 60px; }

  .dev-select {
    flex: 1;
    background: #0d0d1a;
    border: 1px solid #333366;
    border-radius: 3px;
    color: #e5e5e5;
    padding: 0.25rem 0.4rem;
    font-family: monospace;
    font-size: 0.72rem;
    min-width: 0;
  }
  .dev-select--sm { flex: 0 1 110px; }

  span.dev-label { font-size: 0.7rem; color: #aaa; white-space: nowrap; }

  .dev-btn {
    background: #2a2a6e;
    border: 1px solid #4444aa;
    border-radius: 3px;
    color: #c8c8ff;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
    font-family: monospace;
    font-size: 0.75rem;
    white-space: nowrap;
  }
  .dev-btn:hover:not(:disabled) { background: #3a3a8e; }
  .dev-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .dev-btn--danger {
    background: #6e1515;
    border-color: #aa2222;
    color: #ffaaaa;
    width: 100%;
  }
  .dev-btn--danger:hover:not(:disabled) { background: #8e2020; }
</style>
