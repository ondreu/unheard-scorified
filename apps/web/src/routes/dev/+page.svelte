<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import {
    devVerifyAuth,
    devListAccounts,
    devBanAccount,
    devUnbanAccount,
    devDeleteAccount,
    devSearchCharacters,
    devInspectCharacter,
    devDeleteCharacter,
    devListItems,
    devListProfessions,
    devGetState,
    devSetLevel,
    devAddGold,
    devAddItem,
    devCompleteActivity,
    devTimeWarp,
    devSetProfession,
    devResetCharacter,
    type DevAccountView,
    type DevCharacterInspect,
    type DevCharacterState,
    type DevItemDef,
    type DevProfessionDef,
    type DevCharacterSearchResult,
  } from '$lib/api';

  // ── Auth ────────────────────────────────────────────────────────────────────
  let authed: boolean = $state(false);
  let secretInput: string = $state('');
  let loginError: string | null = $state(null);
  let loginBusy: boolean = $state(false);

  onMount(() => {
    const saved = sessionStorage.getItem('dev_secret');
    if (saved) {
      secretInput = saved;
      tryLogin(saved);
    }
  });

  async function tryLogin(secret: string) {
    loginBusy = true;
    loginError = null;
    try {
      const res = await devVerifyAuth(secret);
      if (res.ok) {
        sessionStorage.setItem('dev_secret', secret);
        authed = true;
        await loadAll();
      } else {
        loginError = 'Wrong password';
      }
    } catch {
      loginError = 'Server unreachable';
    } finally {
      loginBusy = false;
    }
  }

  function logout() {
    sessionStorage.removeItem('dev_secret');
    authed = false;
    secretInput = '';
  }

  // ── Tabs ────────────────────────────────────────────────────────────────────
  type Tab = 'devtools' | 'moderation';
  let activeTab: Tab = $state('devtools');

  // ── Shared state ─────────────────────────────────────────────────────────────
  let feedback: string | null = $state(null);
  let busy: boolean = $state(false);

  async function act<T>(fn: () => Promise<T>, msg: (r: T) => string | Promise<string>) {
    if (busy) return;
    busy = true;
    feedback = null;
    try {
      const r = await fn();
      feedback = '✓ ' + (await msg(r));
    } catch (e) {
      feedback = '✗ ' + (e instanceof Error ? e.message : String(e));
    } finally {
      busy = false;
    }
  }

  // ── Dev Tools tab ───────────────────────────────────────────────────────────
  let charSearch: string = $state('');
  let charResults: DevCharacterSearchResult[] = $state([]);
  let selectedChar: DevCharacterSearchResult | null = $state(null);
  let charState: DevCharacterState | null = $state(null);
  let items: DevItemDef[] = $state([]);
  let professions: DevProfessionDef[] = $state([]);

  let levelInput: number = $state(1);
  let goldInput: number = $state(1000);
  let selectedItem: string = $state('');
  let itemQty: number = $state(1);
  let warpHours: number = $state(1);
  let selectedProf: string = $state('');
  let profSkill: number = $state(150);

  async function loadAll() {
    const [i, p] = await Promise.all([
      devListItems('_'),   // characterId is irrelevant for catalog endpoints
      devListProfessions('_'),
    ]);
    items = i.sort((a, b) => a.itemLevel - b.itemLevel);
    professions = p;
    if (items[0]) selectedItem = items[0].id;
    if (professions[0]) selectedProf = professions[0].id;
  }

  async function searchChars() {
    if (!charSearch.trim()) return;
    charResults = await devSearchCharacters(charSearch.trim());
  }

  async function selectChar(c: DevCharacterSearchResult) {
    selectedChar = c;
    charState = await devGetState(c.id);
    levelInput = charState.level;
    feedback = null;
  }

  function charAct<T>(fn: (id: string) => Promise<T>, msg: (r: T) => string) {
    if (!selectedChar) return;
    const id = selectedChar.id;
    act(() => fn(id), async (r) => {
      charState = await devGetState(id);
      levelInput = charState.level;
      return msg(r);
    });
  }

  // ── Moderation tab ──────────────────────────────────────────────────────────
  let accounts: DevAccountView[] = $state([]);
  let inspected: DevCharacterInspect | null = $state(null);
  let inspectSearch: string = $state('');
  let inspectResults: DevCharacterSearchResult[] = $state([]);

  async function loadAccounts() {
    accounts = await devListAccounts();
  }

  async function searchInspect() {
    if (!inspectSearch.trim()) return;
    inspectResults = await devSearchCharacters(inspectSearch.trim());
  }

  async function inspect(id: string) {
    inspected = await devInspectCharacter(id);
  }
</script>

<main class="admin-root">
  <header class="admin-header">
    <span class="admin-logo">⚙ AFK to 60 — Admin</span>
    {#if authed}
      <div class="admin-tabs">
        <button class="tab-btn" class:active={activeTab === 'devtools'} onclick={() => { activeTab = 'devtools'; }}>Dev Tools</button>
        <button class="tab-btn" class:active={activeTab === 'moderation'} onclick={() => { activeTab = 'moderation'; loadAccounts(); }}>Moderation</button>
      </div>
      <button class="logout-btn" onclick={logout}>Logout</button>
    {/if}
  </header>

  {#if !authed}
    <!-- Login form -->
    <div class="login-wrap">
      <div class="login-box">
        <h1>Admin Access</h1>
        <p class="login-hint">Enter the dev panel password.</p>
        {#if loginError}
          <div class="login-error">{loginError}</div>
        {/if}
        <form onsubmit={(e) => { e.preventDefault(); tryLogin(secretInput); }}>
          <input
            type="password"
            placeholder="Password"
            bind:value={secretInput}
            class="login-input"
          />
          <button type="submit" class="login-btn" disabled={loginBusy}>
            {loginBusy ? 'Verifying…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>

  {:else if activeTab === 'devtools'}
    <!-- Dev Tools -->
    <div class="panel">
      {#if feedback}
        <div class="feedback" class:ok={feedback.startsWith('✓')} class:err={feedback.startsWith('✗')}>
          {feedback}
        </div>
      {/if}

      <!-- Character search -->
      <section class="card">
        <h2>Character</h2>
        <div class="row">
          <input placeholder="Search by name…" bind:value={charSearch} class="field" onkeydown={(e) => e.key === 'Enter' && searchChars()} />
          <button class="btn" onclick={searchChars}>Search</button>
        </div>
        {#if charResults.length}
          <div class="results">
            {#each charResults as c}
              <button class="result-row" class:selected={selectedChar?.id === c.id} onclick={() => selectChar(c)}>
                <strong>{c.name}</strong> — Lv{c.level} {c.race} {c.class}
              </button>
            {/each}
          </div>
        {/if}
        {#if charState && selectedChar}
          <div class="char-badge">
            Selected: <strong>{charState.name}</strong> · Lv{charState.level} · {charState.gold.toLocaleString()}g · {charState.totalXp.toLocaleString()} XP
          </div>
        {/if}
      </section>

      {#if selectedChar}
        <div class="tools-grid">
          <!-- Level -->
          <section class="card">
            <h2>Level</h2>
            <div class="row">
              <input type="number" min="1" max="60" bind:value={levelInput} class="field field--sm" />
              <button class="btn" disabled={busy} onclick={() => charAct((id) => devSetLevel(id, levelInput), (r) => `Level → ${r.level}`)}>Set</button>
            </div>
          </section>

          <!-- Gold -->
          <section class="card">
            <h2>Gold</h2>
            <div class="row">
              <input type="number" min="1" max="10000000" bind:value={goldInput} class="field field--sm" />
              <button class="btn" disabled={busy} onclick={() => charAct((id) => devAddGold(id, goldInput), (r) => `Gold → ${r.gold.toLocaleString()}`)}>Add</button>
            </div>
          </section>

          <!-- Items -->
          <section class="card card--wide">
            <h2>Add Item</h2>
            <div class="row">
              <select bind:value={selectedItem} class="field">
                {#each items as item}
                  <option value={item.id}>[{item.rarity}] {item.name} (iLvl {item.itemLevel})</option>
                {/each}
              </select>
              <input type="number" min="1" max="200" bind:value={itemQty} class="field field--xs" />
              <button class="btn" disabled={busy || !selectedItem} onclick={() => charAct((id) => devAddItem(id, selectedItem, itemQty), (r) => `Added ${r.quantity}× ${r.name}`)}>Add</button>
            </div>
          </section>

          <!-- Activity -->
          <section class="card">
            <h2>Activity</h2>
            <div class="col">
              <button class="btn" disabled={busy} onclick={() => charAct((id) => devCompleteActivity(id), (r) => r.message)}>Complete Activity</button>
              <div class="row">
                <input type="number" min="1" max="720" bind:value={warpHours} class="field field--xs" />
                <span class="unit">h</span>
                <button class="btn" disabled={busy} onclick={() => charAct((id) => devTimeWarp(id, warpHours), (r) => r.message)}>Time Warp</button>
              </div>
            </div>
          </section>

          <!-- Profession -->
          <section class="card">
            <h2>Profession</h2>
            <div class="row">
              <select bind:value={selectedProf} class="field field--sm">
                {#each professions as p}
                  <option value={p.id}>{p.name}</option>
                {/each}
              </select>
              <input type="number" min="1" max="150" bind:value={profSkill} class="field field--xs" />
              <button class="btn" disabled={busy || !selectedProf} onclick={() => charAct((id) => devSetProfession(id, selectedProf, profSkill), (r) => `${r.professionId} → ${r.skill}`)}>Set</button>
            </div>
          </section>

          <!-- Reset -->
          <section class="card card--danger">
            <h2>Danger Zone</h2>
            <button class="btn btn--danger" disabled={busy} onclick={() => {
              if (confirm(`Reset ${selectedChar?.name}? Clears XP, gold, inventory, equipment and talents.`)) {
                charAct((id) => devResetCharacter(id), () => 'Character reset to level 1');
              }
            }}>Reset Character</button>
            <button class="btn btn--danger" disabled={busy} onclick={() => {
              if (confirm(`Delete character ${selectedChar?.name}? This is permanent.`)) {
                act(() => devDeleteCharacter(selectedChar!.id), () => {
                  selectedChar = null; charState = null; charResults = [];
                  return 'Character deleted';
                });
              }
            }}>Delete Character</button>
          </section>
        </div>
      {/if}
    </div>

  {:else}
    <!-- Moderation -->
    <div class="panel">
      {#if feedback}
        <div class="feedback" class:ok={feedback.startsWith('✓')} class:err={feedback.startsWith('✗')}>
          {feedback}
        </div>
      {/if}

      <div class="mod-layout">
        <!-- Accounts list -->
        <section class="card mod-accounts">
          <h2>Accounts ({accounts.length})</h2>
          <div class="account-list">
            {#each accounts as acc}
              <div class="account-row" class:banned={!!acc.bannedAt}>
                <div class="account-info">
                  <strong>{acc.username}</strong>
                  <span class="muted">{acc.characterCount} chars · {new Date(acc.createdAt).toLocaleDateString()}</span>
                  {#if acc.bannedAt}<span class="ban-badge">BANNED</span>{/if}
                </div>
                <div class="account-actions">
                  {#if acc.bannedAt}
                    <button class="btn btn--sm btn--green" onclick={() => act(() => devUnbanAccount(acc.id), () => { accounts = accounts.map(a => a.id === acc.id ? { ...a, bannedAt: null } : a); return `${acc.username} unbanned`; })}>Unban</button>
                  {:else}
                    <button class="btn btn--sm btn--warn" onclick={() => { if (confirm(`Ban ${acc.username}?`)) act(() => devBanAccount(acc.id), () => { accounts = accounts.map(a => a.id === acc.id ? { ...a, bannedAt: new Date().toISOString() } : a); return `${acc.username} banned`; }); }}>Ban</button>
                  {/if}
                  <button class="btn btn--sm btn--danger" onclick={() => { if (confirm(`Delete account ${acc.username} and ALL their data?`)) act(() => devDeleteAccount(acc.id), () => { accounts = accounts.filter(a => a.id !== acc.id); return `${acc.username} deleted`; }); }}>Delete</button>
                </div>
              </div>
            {/each}
          </div>
        </section>

        <!-- Character inspector -->
        <section class="card mod-inspect">
          <h2>Character Inspector</h2>
          <div class="row">
            <input placeholder="Search character name…" bind:value={inspectSearch} class="field" onkeydown={(e) => e.key === 'Enter' && searchInspect()} />
            <button class="btn" onclick={searchInspect}>Search</button>
          </div>
          {#if inspectResults.length}
            <div class="results">
              {#each inspectResults as c}
                <button class="result-row" onclick={() => inspect(c.id)}>
                  <strong>{c.name}</strong> — Lv{c.level} {c.race} {c.class}
                </button>
              {/each}
            </div>
          {/if}
          {#if inspected}
            <div class="inspect-card">
              <div class="inspect-title">
                <strong>{inspected.name}</strong>
                <span class="muted">Lv{inspected.level} {inspected.race} {inspected.class} · {inspected.faction}</span>
              </div>
              <div class="inspect-stats">
                <span>{inspected.gold.toLocaleString()} gold</span>
                <span>{inspected.totalXp.toLocaleString()} XP</span>
                {#if inspected.activity}
                  <span class="active-activity">▶ {inspected.activity.type}</span>
                {:else}
                  <span class="muted">Idle</span>
                {/if}
              </div>
              {#if inspected.inventory.length}
                <div class="inspect-section">
                  <h4>Inventory ({inspected.inventory.length} items)</h4>
                  <div class="item-list">
                    {#each inspected.inventory as i}
                      <span class="item-tag">{i.name} ×{i.quantity}</span>
                    {/each}
                  </div>
                </div>
              {/if}
              {#if inspected.equipment.length}
                <div class="inspect-section">
                  <h4>Equipment</h4>
                  <div class="item-list">
                    {#each inspected.equipment as e}
                      <span class="item-tag">{e.slot}: {e.name}</span>
                    {/each}
                  </div>
                </div>
              {/if}
              {#if inspected.professions.length}
                <div class="inspect-section">
                  <h4>Professions</h4>
                  <div class="item-list">
                    {#each inspected.professions as p}
                      <span class="item-tag">{p.professionId} {p.skill}</span>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </section>
      </div>
    </div>
  {/if}
</main>

<style>
  :global(body) { margin: 0; background: #0d0d1a; color: #e5e5e5; font-family: monospace; font-size: 0.85rem; }

  .admin-root { min-height: 100vh; display: flex; flex-direction: column; }

  .admin-header {
    display: flex; align-items: center; gap: 1rem;
    padding: 0.6rem 1.5rem;
    background: #111128; border-bottom: 1px solid #f59e0b;
  }
  .admin-logo { font-weight: 700; color: #f59e0b; font-size: 0.9rem; margin-right: auto; }

  .admin-tabs { display: flex; gap: 0.25rem; }
  .tab-btn {
    background: none; border: 1px solid #333366; border-radius: 4px;
    color: #aaa; padding: 0.3rem 0.8rem; cursor: pointer; font-family: monospace;
  }
  .tab-btn:hover { color: #e5e5e5; }
  .tab-btn.active { background: #2a2a6e; border-color: #f59e0b; color: #f59e0b; }

  .logout-btn { background: none; border: 1px solid #444; border-radius: 4px; color: #888; padding: 0.3rem 0.7rem; cursor: pointer; font-family: monospace; }
  .logout-btn:hover { color: #e5e5e5; }

  /* Login */
  .login-wrap { flex: 1; display: flex; align-items: center; justify-content: center; }
  .login-box { background: #111128; border: 1px solid #333366; border-radius: 8px; padding: 2rem; width: 320px; }
  .login-box h1 { margin: 0 0 0.5rem; color: #f59e0b; font-size: 1.1rem; }
  .login-hint { margin: 0 0 1rem; color: #888; font-size: 0.8rem; }
  .login-error { background: #3a1010; border: 1px solid #aa2222; border-radius: 4px; padding: 0.4rem 0.6rem; color: #ffaaaa; margin-bottom: 0.75rem; font-size: 0.8rem; }
  .login-input { width: 100%; box-sizing: border-box; background: #0d0d1a; border: 1px solid #333366; border-radius: 4px; color: #e5e5e5; padding: 0.5rem; font-family: monospace; font-size: 0.85rem; margin-bottom: 0.75rem; }
  .login-btn { width: 100%; background: #2a2a6e; border: 1px solid #4444aa; border-radius: 4px; color: #c8c8ff; padding: 0.5rem; cursor: pointer; font-family: monospace; font-size: 0.85rem; }
  .login-btn:hover:not(:disabled) { background: #3a3a8e; }
  .login-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Panel */
  .panel { flex: 1; padding: 1rem 1.5rem; }
  .feedback { padding: 0.4rem 0.8rem; border-radius: 4px; margin-bottom: 1rem; font-size: 0.8rem; }
  .feedback.ok { background: #0d2a1a; border: 1px solid #1e5c35; color: #4ade80; }
  .feedback.err { background: #2a0d0d; border: 1px solid #5c1e1e; color: #f87171; }

  /* Cards */
  .card { background: #111128; border: 1px solid #222244; border-radius: 6px; padding: 1rem; }
  .card--wide { grid-column: span 2; }
  .card--danger { background: #180808; border-color: #3a1010; }
  .card h2 { margin: 0 0 0.75rem; color: #f59e0b; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; }

  .tools-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 0.75rem; }

  /* Form elements */
  .row { display: flex; align-items: center; gap: 0.5rem; }
  .col { display: flex; flex-direction: column; gap: 0.5rem; }
  .field { flex: 1; background: #0d0d1a; border: 1px solid #333366; border-radius: 3px; color: #e5e5e5; padding: 0.3rem 0.5rem; font-family: monospace; font-size: 0.8rem; min-width: 0; }
  .field--sm { flex: 0 0 80px; }
  .field--xs { flex: 0 0 55px; }
  .unit { color: #888; font-size: 0.75rem; }
  .btn { background: #2a2a6e; border: 1px solid #4444aa; border-radius: 3px; color: #c8c8ff; padding: 0.3rem 0.7rem; cursor: pointer; font-family: monospace; font-size: 0.78rem; white-space: nowrap; }
  .btn:hover:not(:disabled) { background: #3a3a8e; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn--sm { padding: 0.2rem 0.5rem; font-size: 0.72rem; }
  .btn--danger { background: #6e1515; border-color: #aa2222; color: #ffaaaa; }
  .btn--danger:hover:not(:disabled) { background: #8e2020; }
  .btn--warn { background: #5a4400; border-color: #aa7700; color: #ffd060; }
  .btn--warn:hover:not(:disabled) { background: #7a5a00; }
  .btn--green { background: #0d3a1a; border-color: #1e6e35; color: #4ade80; }
  .btn--green:hover:not(:disabled) { background: #0d5a25; }

  /* Search results */
  .results { margin-top: 0.5rem; display: flex; flex-direction: column; gap: 2px; }
  .result-row { background: #0d0d1a; border: 1px solid #222244; border-radius: 3px; padding: 0.3rem 0.6rem; cursor: pointer; text-align: left; color: #e5e5e5; font-family: monospace; font-size: 0.78rem; }
  .result-row:hover { background: #1a1a3e; }
  .result-row.selected { border-color: #f59e0b; background: #1a1510; }

  .char-badge { margin-top: 0.5rem; padding: 0.3rem 0.6rem; background: #0d2010; border: 1px solid #1a4020; border-radius: 3px; font-size: 0.78rem; color: #4ade80; }

  /* Moderation */
  .mod-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .mod-accounts { max-height: 80vh; overflow-y: auto; }

  .account-list { display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.5rem; }
  .account-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.6rem; background: #0d0d1a; border: 1px solid #222244; border-radius: 3px; }
  .account-row.banned { background: #1a0808; border-color: #3a1010; }
  .account-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .account-actions { display: flex; gap: 0.3rem; }
  .muted { color: #666; font-size: 0.72rem; }
  .ban-badge { background: #3a1010; color: #f87171; font-size: 0.65rem; padding: 1px 5px; border-radius: 3px; letter-spacing: 0.05em; }

  /* Inspector */
  .inspect-card { margin-top: 0.75rem; background: #0d0d1a; border: 1px solid #222244; border-radius: 4px; padding: 0.75rem; }
  .inspect-title { display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.5rem; }
  .inspect-stats { display: flex; gap: 1rem; margin-bottom: 0.5rem; font-size: 0.8rem; }
  .active-activity { color: #60a5fa; }
  .inspect-section { margin-top: 0.5rem; }
  .inspect-section h4 { margin: 0 0 0.3rem; font-size: 0.7rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
  .item-list { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .item-tag { background: #1a1a3e; border: 1px solid #333366; border-radius: 3px; padding: 2px 6px; font-size: 0.72rem; color: #c8c8ff; }
</style>
