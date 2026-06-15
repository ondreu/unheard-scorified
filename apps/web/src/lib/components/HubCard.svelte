<script lang="ts">
  let {
    href,
    icon,
    title,
    sub = '',
    accent = 'var(--gold)',
  }: {
    href: string;
    icon: string;
    title: string;
    sub?: string;
    accent?: string;
  } = $props();
</script>

<a {href} class="card">
  <span
    class="card-icon"
    style={`color:${accent};border-color:color-mix(in srgb, ${accent} 35%, var(--border))`}
    aria-hidden="true">{icon}</span
  >
  <span class="min-w-0">
    <span class="card-title block truncate">{title}</span>
    {#if sub}<span class="card-sub block truncate">{sub}</span>{/if}
  </span>
</a>
