<script lang="ts">
  import { goto } from '$app/navigation';
  import { login } from '$lib/api';
  import { setTokens } from '$lib/auth';

  let username = $state('');
  let password = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    busy = true;
    try {
      setTokens(await login(username, password));
      await goto('/characters');
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-16">
  <div class="mb-6 text-center">
    <div class="text-4xl" aria-hidden="true">⚔️</div>
    <h1 class="mt-2 font-display text-3xl font-bold text-[var(--gold-bright)]">Welcome back</h1>
    <p class="mt-1 text-sm text-[var(--text-dim)]">Log in to continue your journey.</p>
  </div>

  <form class="panel panel-pad space-y-4" onsubmit={submit}>
    <label class="block">
      <span class="field-label">Username</span>
      <input bind:value={username} required class="input mt-1" />
    </label>
    <label class="block">
      <span class="field-label">Password</span>
      <input type="password" bind:value={password} required class="input mt-1" />
    </label>
    {#if error}<p class="text-sm text-[var(--danger)]">{error}</p>{/if}
    <button disabled={busy} class="btn btn-primary w-full">
      {busy ? 'Logging in…' : 'Log in'}
    </button>
  </form>

  <p class="mt-4 text-center text-sm text-[var(--text-dim)]">
    No account? <a href="/register" class="text-[var(--gold)] hover:underline">Register</a>
  </p>
</main>
