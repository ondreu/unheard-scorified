<script lang="ts">
  import { goto } from '$app/navigation';
  import { register } from '$lib/api';
  import { setTokens } from '$lib/auth';

  let username = $state('');
  let password = $state('');
  let email = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    busy = true;
    try {
      setTokens(await register(username, password, email));
      await goto('/characters');
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<main class="mx-auto max-w-sm px-6 py-16">
  <h1 class="text-2xl font-bold text-amber-200">Register</h1>
  <form class="mt-6 space-y-4" onsubmit={submit}>
    <label class="block">
      <span class="text-sm text-amber-100/70">Username</span>
      <input
        bind:value={username}
        required
        class="mt-1 w-full rounded border border-amber-900/40 bg-black/30 px-3 py-2"
      />
    </label>
    <label class="block">
      <span class="text-sm text-amber-100/70">Password (min. 8 characters)</span>
      <input
        type="password"
        bind:value={password}
        required
        class="mt-1 w-full rounded border border-amber-900/40 bg-black/30 px-3 py-2"
      />
    </label>
    <label class="block">
      <span class="text-sm text-amber-100/70">Email (optional)</span>
      <input
        type="email"
        bind:value={email}
        class="mt-1 w-full rounded border border-amber-900/40 bg-black/30 px-3 py-2"
      />
    </label>
    {#if error}<p class="text-sm text-red-400">{error}</p>{/if}
    <button
      disabled={busy}
      class="w-full rounded bg-amber-700 px-4 py-2 font-semibold text-amber-50 hover:bg-amber-600 disabled:opacity-50"
    >
      {busy ? 'Creating…' : 'Create account'}
    </button>
  </form>
  <p class="mt-4 text-sm text-amber-100/60">
    Already have an account? <a href="/login" class="text-amber-300 underline">Log in</a>
  </p>
</main>
