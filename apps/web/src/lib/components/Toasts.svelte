<script lang="ts">
  import { fly } from 'svelte/transition';
  import { notifications, type AppNotification } from '$lib/ui-stores';

  // Show the most recent notifications briefly as floating toasts.
  let visible = $state<AppNotification[]>([]);
  let seen = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const ICON: Record<AppNotification['kind'], string> = {
    info: 'ℹ️',
    success: '✅',
    social: '👥',
    reward: '🎁',
  };

  $effect(() => {
    for (const n of $notifications) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      // Vyskočí jen opravdu nové, nepřečtené upozornění. Přečtené (otevřel se
      // zvonek) se znovu nezobrazuje — i kdyby ještě nebylo smazané. Stejně tak
      // perzistované/restorované notifikace (starý `at`) po reloadu/loginu.
      if (n.read) continue;
      if (Date.now() - n.at > 5000) continue;
      visible = [n, ...visible].slice(0, 4);
      timers.set(
        n.id,
        setTimeout(() => dismiss(n.id), 4500),
      );
    }
  });

  // Hráč může jednotlivou kartu zavřít ručně (zmizí z toastů, ve zvonku zůstane).
  function dismiss(id: string): void {
    const t = timers.get(id);
    if (t) {
      clearTimeout(t);
      timers.delete(id);
    }
    visible = visible.filter((v) => v.id !== id);
  }
</script>

<div class="pointer-events-none fixed left-1/2 top-4 z-[70] flex w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-2">
  {#each visible as n (n.id)}
    <div class="panel pointer-events-auto flex items-start gap-2 px-3 py-2" transition:fly={{ y: -20, duration: 200 }}>
      <span aria-hidden="true">{ICON[n.kind]}</span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-[var(--text)]">{n.title}</p>
        {#if n.body}<p class="text-xs text-[var(--text-dim)]">{n.body}</p>{/if}
      </div>
      <button
        class="-mr-1 -mt-0.5 shrink-0 text-sm text-[var(--text-faint)] hover:text-[var(--danger)]"
        onclick={() => dismiss(n.id)}
        aria-label="Dismiss"
        title="Dismiss">✕</button
      >
    </div>
  {/each}
</div>
