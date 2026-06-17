<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { updated } from '$app/stores';

  // Upozornění na novou verzi appky: SvelteKit periodicky kontroluje
  // `version.json` (viz svelte.config.js → kit.version.pollInterval) a při
  // novém nasazení nastaví `$updated` na true. Service worker (M3) si nový
  // build precachuje; reload načte aktuální klienta.
  const ui = {
    title: 'A new version is available',
    body: 'Reload to get the latest update.',
    reload: 'Reload now',
  };

  function reload(): void {
    if (browser) location.reload();
  }

  onMount(() => {
    // Při návratu na záložku zkontroluj verzi hned (nečekej na poll interval).
    const onFocus = (): void => {
      void updated.check();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  });
</script>

{#if $updated}
  <div
    class="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-3 border-b border-[var(--gold)]/40 bg-[var(--gold)]/15 px-4 py-2 text-sm backdrop-blur"
    role="alert"
  >
    <span aria-hidden="true">✨</span>
    <span class="min-w-0">
      <span class="font-semibold text-[var(--gold-bright)]">{ui.title}.</span>
      <span class="hidden text-[var(--text-dim)] sm:inline">{ui.body}</span>
    </span>
    <button class="btn btn-sm btn-primary shrink-0" onclick={reload}>{ui.reload}</button>
  </div>
{/if}
