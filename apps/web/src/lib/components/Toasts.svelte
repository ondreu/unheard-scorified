<script lang="ts">
  import { fly } from 'svelte/transition';
  import { notifications, type AppNotification } from '$lib/ui-stores';

  // Show the most recent notifications briefly as floating toasts.
  let visible = $state<AppNotification[]>([]);
  let seen = new Set<string>();

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
      visible = [n, ...visible].slice(0, 4);
      setTimeout(() => {
        visible = visible.filter((v) => v.id !== n.id);
      }, 4500);
    }
  });
</script>

<div class="pointer-events-none fixed left-1/2 top-4 z-[70] flex w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-2">
  {#each visible as n (n.id)}
    <div class="panel pointer-events-auto flex gap-2 px-3 py-2" transition:fly={{ y: -20, duration: 200 }}>
      <span aria-hidden="true">{ICON[n.kind]}</span>
      <div class="min-w-0">
        <p class="text-sm font-medium text-[var(--text)]">{n.title}</p>
        {#if n.body}<p class="text-xs text-[var(--text-dim)]">{n.body}</p>{/if}
      </div>
    </div>
  {/each}
</div>
