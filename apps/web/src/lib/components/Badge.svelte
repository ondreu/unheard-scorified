<script lang="ts">
  let {
    color = 'var(--text-dim)',
    icon = '',
    children,
  }: {
    color?: string;
    icon?: string;
    children?: import('svelte').Snippet;
  } = $props();
</script>

<span class="chip" style={`color:${color};border-color:color-mix(in srgb, ${color} 35%, transparent)`}>
  {#if icon}<span aria-hidden="true">{icon}</span>{/if}
  {@render children?.()}
</span>
