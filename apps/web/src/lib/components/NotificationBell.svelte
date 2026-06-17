<script lang="ts">
  import { notifications, type AppNotification } from '$lib/ui-stores';

  const ui = {
    title: 'Notifications',
    empty: 'Nothing new.',
    clear: 'Clear all',
  };

  let open = $state(false);

  const list = $derived($notifications);
  const unread = $derived(list.filter((n) => !n.read).length);

  const ICON: Record<AppNotification['kind'], string> = {
    info: 'ℹ️',
    success: '✅',
    social: '👥',
    reward: '🎁',
  };

  function toggle(): void {
    open = !open;
    if (open) notifications.markAllRead();
  }

  function ago(at: number): string {
    const s = Math.floor((Date.now() - at) / 1000);
    if (s < 60) return 'now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h`;
  }
</script>

<div class="relative">
  <button
    class="relative grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-lg hover:border-[var(--border-strong)]"
    onclick={toggle}
    aria-label={ui.title}
    title={ui.title}
  >
    🔔
    {#if unread > 0}
      <span
        class="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--danger)] px-1 text-xs font-bold text-white"
        >{unread > 9 ? '9+' : unread}</span
      >
    {/if}
  </button>

  {#if open}
    <div class="overlay !block !bg-transparent !backdrop-blur-0" onclick={() => (open = false)} role="presentation"></div>
    <div class="panel absolute right-0 top-12 z-[61] w-72 max-w-[calc(100vw-2rem)]">
      <div class="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <span class="panel-title text-sm">{ui.title}</span>
        {#if list.length > 0}
          <button class="text-xs text-[var(--text-faint)] hover:text-[var(--text)]" onclick={() => notifications.clear()}>
            {ui.clear}
          </button>
        {/if}
      </div>
      <ul class="max-h-80 overflow-y-auto">
        {#each list as n (n.id)}
          <li class="flex gap-2 border-b border-[var(--border)]/40 px-3 py-2 last:border-0">
            <span aria-hidden="true">{ICON[n.kind]}</span>
            <div class="min-w-0 flex-1">
              <p class="text-sm text-[var(--text)]">{n.title}</p>
              {#if n.body}<p class="text-xs text-[var(--text-dim)]">{n.body}</p>{/if}
            </div>
            <span class="shrink-0 text-xs text-[var(--text-faint)]">{ago(n.at)}</span>
          </li>
        {/each}
        {#if list.length === 0}
          <li class="px-3 py-4 text-center text-sm text-[var(--text-faint)]">{ui.empty}</li>
        {/if}
      </ul>
    </div>
  {/if}
</div>
