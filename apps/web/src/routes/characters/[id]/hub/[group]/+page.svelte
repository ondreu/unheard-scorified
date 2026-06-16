<script lang="ts">
  import { page } from '$app/stores';
  import { categoryByGroup, sectionsInGroup, type NavGroup } from '$lib/nav';
  import HubCard from '$lib/components/HubCard.svelte';

  const characterId = $derived($page.params.id ?? '');
  const groupParam = $derived($page.params.group ?? '');
  const category = $derived(categoryByGroup(groupParam));
  const sections = $derived(category ? sectionsInGroup(category.group as NavGroup) : []);
</script>

{#if category}
  <header class="mb-4 flex items-center gap-3">
    <span class="text-3xl" style={`color:${category.accent}`} aria-hidden="true"
      >{category.icon}</span
    >
    <div>
      <h1 class="text-xl font-bold text-[var(--gold-bright)]">{category.title}</h1>
      <p class="text-sm text-[var(--text-dim)]">{category.sub}</p>
    </div>
  </header>

  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {#each sections as s (s.path)}
      <HubCard
        href={`/characters/${characterId}/${s.path}`}
        icon={s.icon}
        title={s.title}
        sub={s.sub}
        accent={s.accent}
      />
    {/each}
  </div>
{:else}
  <p class="text-[var(--text-dim)]">Unknown section.</p>
  <a href={`/characters/${characterId}`} class="btn mt-3 inline-flex">← Overview</a>
{/if}
