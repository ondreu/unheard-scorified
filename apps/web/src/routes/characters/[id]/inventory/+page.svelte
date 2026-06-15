<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { ApiError } from '$lib/api';
  import { currentTokens } from '$lib/auth';
  import { RARITY_COLOR } from '$lib/cosmetics';
  import type { ItemDef, EquipmentSlot } from '@game/shared';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Inventory & Equipment',
    inventory: 'Inventory',
    equipment: 'Equipment',
    noItems: 'Your inventory is empty.',
    equip: 'Equip',
    unequip: 'Unequip',
    equippping: 'Equipping…',
    unequipping: 'Unequipping…',
    stats: 'Equipment Stats',
    empty: 'Empty',
    dragHint: 'Drag an item onto a matching slot to equip — or drag equipped gear here to unequip.',
    dropHere: 'Drop to equip',
    qty: 'x',
    vendorGold: 'Vendor:',
    gold: 'g',
    ilvl: 'iLvl',
  };

  type InventoryItem = { itemId: string; quantity: number; item: ItemDef };
  type EquipmentEntry = { slot: string; itemId: string; item: ItemDef };
  type EquipmentSlotsView = { equipped: EquipmentEntry[]; equipmentStats: Record<string, number> };

  const SLOT_LABELS: Record<string, string> = {
    head: 'Head', neck: 'Neck', shoulder: 'Shoulders', chest: 'Chest',
    waist: 'Waist', legs: 'Legs', feet: 'Feet', wrist: 'Wrist',
    hands: 'Hands', back: 'Back', main_hand: 'Main Hand', off_hand: 'Off Hand',
    finger1: 'Ring 1', finger2: 'Ring 2', trinket1: 'Trinket 1', trinket2: 'Trinket 2',
  };

  const ALL_SLOTS: EquipmentSlot[] = [
    'head', 'neck', 'shoulder', 'chest', 'waist', 'legs', 'feet', 'wrist',
    'hands', 'back', 'main_hand', 'off_hand', 'finger1', 'finger2', 'trinket1', 'trinket2',
  ];

  // Physical slot → item slot type (rings/trinkets share a type across two slots).
  const SLOT_TYPE_MAP: Record<string, string> = {
    head: 'head', neck: 'neck', shoulder: 'shoulder', chest: 'chest',
    waist: 'waist', legs: 'legs', feet: 'feet', wrist: 'wrist',
    hands: 'hands', back: 'back', main_hand: 'main_hand', off_hand: 'off_hand',
    finger1: 'finger', finger2: 'finger', trinket1: 'trinket', trinket2: 'trinket',
  };

  // Drag & drop equip: drag an inventory item onto a matching slot; drag an
  // equipped item back onto the inventory to unequip.
  let draggedItem = $state<InventoryItem | null>(null);
  let draggedFromSlot = $state<string | null>(null);
  let dragOverSlot = $state<string | null>(null);

  function slotAccepts(slot: string, item: ItemDef | null | undefined): boolean {
    return !!item && SLOT_TYPE_MAP[slot] === item.slot;
  }
  function clearDrag(): void {
    draggedItem = null;
    draggedFromSlot = null;
    dragOverSlot = null;
  }
  function onSlotDrop(slot: string): void {
    const item = draggedItem;
    if (item && slotAccepts(slot, item.item)) {
      const id = item.itemId;
      clearDrag();
      void doEquip(id, slot);
    } else {
      clearDrag();
    }
  }
  function onInventoryDrop(): void {
    const slot = draggedFromSlot;
    clearDrag();
    if (slot) void doUnequip(slot);
  }

  let inventory = $state<InventoryItem[]>([]);
  let equipment = $state<EquipmentSlotsView>({ equipped: [], equipmentStats: {} });
  let loading = $state(true);
  let error = $state<string | null>(null);
  let pendingSlot = $state<string | null>(null);
  let selectedItem = $state<InventoryItem | null>(null);
  let equipTargetSlot = $state<string | null>(null);

  const characterId = $derived($page.params.id ?? '');

  onMount(load);

  async function load(): Promise<void> {
    loading = true;
    try {
      const [inv, eq] = await Promise.all([
        fetchInventory(characterId),
        fetchEquipment(characterId),
      ]);
      inventory = inv;
      equipment = eq;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await goto('/login');
        return;
      }
      error = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  async function fetchInventory(id: string): Promise<InventoryItem[]> {
    const res = await fetch(`/api/characters/${id}/inventory`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<InventoryItem[]>;
  }

  async function fetchEquipment(id: string): Promise<EquipmentSlotsView> {
    const res = await fetch(`/api/characters/${id}/equipment`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<EquipmentSlotsView>;
  }

  function authHeaders(): Record<string, string> {
    // Single source of truth for tokens (see $lib/auth).
    const token = currentTokens()?.accessToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function doEquip(itemId: string, slot: string): Promise<void> {
    pendingSlot = slot;
    error = null;
    try {
      const res = await fetch(`/api/characters/${characterId}/equipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ itemId, slot }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      equipment = (await res.json()) as EquipmentSlotsView;
      selectedItem = null;
      equipTargetSlot = null;
      // Refresh inventory
      inventory = await fetchInventory(characterId);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      pendingSlot = null;
    }
  }

  async function doUnequip(slot: string): Promise<void> {
    pendingSlot = slot;
    error = null;
    try {
      const res = await fetch(`/api/characters/${characterId}/equipment/${slot}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      equipment = (await res.json()) as EquipmentSlotsView;
      inventory = await fetchInventory(characterId);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      pendingSlot = null;
    }
  }

  function getEquippedInSlot(slot: string): EquipmentEntry | undefined {
    return equipment.equipped.find((e) => e.slot === slot);
  }

  function statLabel(key: string): string {
    const labels: Record<string, string> = {
      strength: 'Strength', agility: 'Agility', stamina: 'Stamina',
      intellect: 'Intellect', spirit: 'Spirit', armor: 'Armor',
      attack_power: 'Attack Power', spell_power: 'Spell Power',
      crit_rating: 'Crit Rating', dodge_rating: 'Dodge Rating',
    };
    return labels[key] ?? key;
  }
</script>

<div class="space-y-6">
  <h1 class="font-display text-2xl font-bold text-[var(--gold-bright)]">{ui.title}</h1>

  {#if error}
    <p class="text-[var(--danger)]">{error}</p>
  {/if}

  {#if loading}
    <p class="text-[var(--text-dim)]">Loading…</p>
  {:else}
    <div class="grid gap-6 lg:grid-cols-2">
      <!-- Equipment Slots -->
      <section class="panel panel-pad">
        <h2 class="panel-title">{ui.equipment}</h2>
        <p class="mt-1 text-xs text-[var(--text-faint)]">{ui.dragHint}</p>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          {#each ALL_SLOTS as slot (slot)}
            {@const entry = getEquippedInSlot(slot)}
            {@const candidate = !!draggedItem && slotAccepts(slot, draggedItem.item)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="flex items-center justify-between gap-2 rounded-lg border bg-[var(--surface-2)] px-3 py-2 transition-colors"
              class:cursor-grab={!!entry}
              style={`border-color:${dragOverSlot === slot && candidate ? 'var(--gold-bright)' : candidate ? 'var(--border-strong)' : 'var(--border)'}`}
              draggable={!!entry}
              ondragstart={() => entry && (draggedFromSlot = slot)}
              ondragend={clearDrag}
              ondragover={(e) => {
                if (candidate) {
                  e.preventDefault();
                  dragOverSlot = slot;
                }
              }}
              ondragleave={() => dragOverSlot === slot && (dragOverSlot = null)}
              ondrop={(e) => {
                e.preventDefault();
                onSlotDrop(slot);
              }}
            >
              <div class="min-w-0">
                <span class="text-xs text-[var(--text-faint)]">{SLOT_LABELS[slot] ?? slot}</span>
                {#if entry}
                  <p class="truncate text-sm font-medium" style={`color:${RARITY_COLOR[entry.item.rarity] ?? 'var(--text)'}`}>
                    {entry.item.name}
                    <span class="ml-1 text-xs text-[var(--text-faint)]">{ui.ilvl} {entry.item.itemLevel}</span>
                  </p>
                {:else}
                  <p class="text-sm text-[var(--text-faint)]">{candidate ? ui.dropHere : ui.empty}</p>
                {/if}
              </div>
              {#if entry}
                <button
                  onclick={() => doUnequip(slot)}
                  disabled={pendingSlot !== null}
                  class="btn btn-danger btn-sm shrink-0"
                >
                  {pendingSlot === slot ? ui.unequipping : ui.unequip}
                </button>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Equipment Stats Summary -->
        {#if Object.keys(equipment.equipmentStats).length > 0}
          <div class="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <h3 class="panel-title text-sm">{ui.stats}</h3>
            <dl class="mt-2 grid grid-cols-2 gap-1 text-xs">
              {#each Object.entries(equipment.equipmentStats) as [key, val] (key)}
                <div class="flex justify-between">
                  <dt class="text-[var(--text-dim)]">{statLabel(key)}</dt>
                  <dd class="text-[var(--gold-bright)]">+{val}</dd>
                </div>
              {/each}
            </dl>
          </div>
        {/if}
      </section>

      <!-- Inventory -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <section
        class="panel panel-pad transition-colors"
        style={draggedFromSlot ? 'border-color:var(--border-strong)' : ''}
        ondragover={(e) => draggedFromSlot && e.preventDefault()}
        ondrop={(e) => {
          e.preventDefault();
          onInventoryDrop();
        }}
      >
        <h2 class="panel-title">{ui.inventory}</h2>
        {#if draggedFromSlot}<p class="mt-1 text-xs text-[var(--gold-bright)]">{ui.unequip} — drop here</p>{/if}
        {#if inventory.length === 0}
          <p class="mt-2 text-[var(--text-dim)]">{ui.noItems}</p>
        {:else}
          <div class="mt-3 space-y-2">
            {#each inventory as inv (inv.itemId)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="cursor-grab rounded-lg border bg-[var(--surface-2)] p-3 {selectedItem?.itemId === inv.itemId ? 'border-[var(--border-strong)]' : 'border-[var(--border)]'}"
                draggable="true"
                ondragstart={() => {
                  draggedItem = inv;
                  draggedFromSlot = null;
                }}
                ondragend={clearDrag}
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium" style={`color:${RARITY_COLOR[inv.item.rarity] ?? 'var(--text)'}`}>
                      {inv.item.name}
                      {#if inv.quantity > 1}
                        <span class="ml-1 text-[var(--text-faint)]">{ui.qty}{inv.quantity}</span>
                      {/if}
                    </p>
                    <p class="text-xs text-[var(--text-faint)]">
                      {inv.item.slot}{inv.item.armorClass ? ` · ${inv.item.armorClass}` : ''} · {ui.ilvl} {inv.item.itemLevel} · {ui.vendorGold} {inv.item.vendorGold}{ui.gold}
                    </p>
                    <p class="mt-1 text-xs text-[var(--text-dim)]">
                      {Object.entries(inv.item.stats).map(([k, v]) => `+${v} ${statLabel(k)}`).join(', ')}
                    </p>
                  </div>
                  <button
                    onclick={() => { selectedItem = selectedItem?.itemId === inv.itemId ? null : inv; equipTargetSlot = null; }}
                    class="btn btn-sm shrink-0"
                  >
                    {ui.equip}
                  </button>
                </div>

                <!-- Slot picker when this item is selected -->
                {#if selectedItem?.itemId === inv.itemId}
                  {@const validSlots = ALL_SLOTS.filter((s) => SLOT_TYPE_MAP[s] === inv.item.slot)}
                  <div class="mt-2 flex flex-wrap gap-2">
                    {#each validSlots as vslot (vslot)}
                      <button
                        onclick={() => doEquip(inv.itemId, vslot)}
                        disabled={pendingSlot !== null}
                        class="btn btn-primary btn-sm"
                      >
                        {pendingSlot === vslot ? ui.equippping : `→ ${SLOT_LABELS[vslot]}`}
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  {/if}
</div>
