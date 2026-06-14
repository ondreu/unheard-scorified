<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { ApiError } from '$lib/api';
  import type { ItemDef, EquipmentSlot, ItemRarity } from '@game/shared';

  // Game-facing UI strings (English; kept separate from logic for future i18n).
  const ui = {
    title: 'Inventory & Equipment',
    back: '← Back to character',
    inventory: 'Inventory',
    equipment: 'Equipment',
    noItems: 'Your inventory is empty.',
    equip: 'Equip',
    unequip: 'Unequip',
    equippping: 'Equipping…',
    unequipping: 'Unequipping…',
    stats: 'Equipment Stats',
    empty: 'Empty',
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

  const RARITY_COLORS: Record<ItemRarity, string> = {
    common: 'text-gray-300',
    uncommon: 'text-green-400',
    rare: 'text-blue-400',
    epic: 'text-purple-400',
    legendary: 'text-orange-400',
  };

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
    // Grab token from localStorage (same as $lib/auth)
    try {
      const raw = localStorage.getItem('tokens');
      if (!raw) return {};
      const tokens = JSON.parse(raw) as { accessToken?: string };
      return tokens.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {};
    } catch {
      return {};
    }
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

<main class="mx-auto max-w-4xl px-6 py-12">
  <a href={`/characters/${characterId}`} class="text-sm text-amber-300 underline">{ui.back}</a>
  <h1 class="mt-4 text-3xl font-bold text-amber-200">{ui.title}</h1>

  {#if error}
    <p class="mt-4 text-red-400">{error}</p>
  {/if}

  {#if loading}
    <p class="mt-6 text-amber-100/50">Loading…</p>
  {:else}
    <div class="mt-6 grid gap-6 lg:grid-cols-2">
      <!-- Equipment Slots -->
      <section>
        <h2 class="mb-3 text-xl font-semibold text-amber-200">{ui.equipment}</h2>
        <div class="space-y-2">
          {#each ALL_SLOTS as slot (slot)}
            {@const entry = getEquippedInSlot(slot)}
            <div class="flex items-center justify-between rounded border border-amber-900/40 bg-black/20 px-3 py-2">
              <div class="min-w-0">
                <span class="text-xs text-amber-100/50">{SLOT_LABELS[slot] ?? slot}</span>
                {#if entry}
                  <p class="truncate text-sm font-medium {RARITY_COLORS[entry.item.rarity as ItemRarity]}">
                    {entry.item.name}
                    <span class="ml-1 text-xs text-amber-100/40">{ui.ilvl} {entry.item.itemLevel}</span>
                  </p>
                {:else}
                  <p class="text-sm text-amber-100/30">{ui.empty}</p>
                {/if}
              </div>
              {#if entry}
                <button
                  onclick={() => doUnequip(slot)}
                  disabled={pendingSlot !== null}
                  class="ml-3 shrink-0 rounded border border-red-800/60 px-2 py-1 text-xs text-red-400 hover:border-red-600/60 disabled:opacity-40"
                >
                  {pendingSlot === slot ? ui.unequipping : ui.unequip}
                </button>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Equipment Stats Summary -->
        {#if Object.keys(equipment.equipmentStats).length > 0}
          <div class="mt-4 rounded border border-amber-900/40 bg-black/20 p-4">
            <h3 class="mb-2 text-sm font-semibold text-amber-300">{ui.stats}</h3>
            <dl class="grid grid-cols-2 gap-1 text-xs">
              {#each Object.entries(equipment.equipmentStats) as [key, val] (key)}
                <div class="flex justify-between">
                  <dt class="text-amber-100/60">{statLabel(key)}</dt>
                  <dd class="text-amber-200">+{val}</dd>
                </div>
              {/each}
            </dl>
          </div>
        {/if}
      </section>

      <!-- Inventory -->
      <section>
        <h2 class="mb-3 text-xl font-semibold text-amber-200">{ui.inventory}</h2>
        {#if inventory.length === 0}
          <p class="text-amber-100/60">{ui.noItems}</p>
        {:else}
          <div class="space-y-2">
            {#each inventory as inv (inv.itemId)}
              <div
                class="rounded border border-amber-900/40 bg-black/20 p-3 {selectedItem?.itemId === inv.itemId ? 'border-amber-500/60' : ''}"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium {RARITY_COLORS[inv.item.rarity as ItemRarity]}">
                      {inv.item.name}
                      {#if inv.quantity > 1}
                        <span class="ml-1 text-amber-100/50">{ui.qty}{inv.quantity}</span>
                      {/if}
                    </p>
                    <p class="text-xs text-amber-100/40">
                      {inv.item.slot} · {ui.ilvl} {inv.item.itemLevel} · {ui.vendorGold} {inv.item.vendorGold}{ui.gold}
                    </p>
                    <p class="mt-1 text-xs text-amber-100/50">
                      {Object.entries(inv.item.stats).map(([k, v]) => `+${v} ${statLabel(k)}`).join(', ')}
                    </p>
                  </div>
                  <button
                    onclick={() => { selectedItem = selectedItem?.itemId === inv.itemId ? null : inv; equipTargetSlot = null; }}
                    class="shrink-0 rounded bg-amber-700/60 px-2 py-1 text-xs font-medium hover:bg-amber-600/60"
                  >
                    {ui.equip}
                  </button>
                </div>

                <!-- Slot picker when this item is selected -->
                {#if selectedItem?.itemId === inv.itemId}
                  {@const itemSlotType = inv.item.slot}
                  {@const validSlots = ALL_SLOTS.filter((s) => {
                    const mapping: Record<string, string> = {
                      head: 'head', neck: 'neck', shoulder: 'shoulder', chest: 'chest',
                      waist: 'waist', legs: 'legs', feet: 'feet', wrist: 'wrist',
                      hands: 'hands', back: 'back', main_hand: 'main_hand', off_hand: 'off_hand',
                      finger1: 'finger', finger2: 'finger', trinket1: 'trinket', trinket2: 'trinket',
                    };
                    return mapping[s] === itemSlotType;
                  })}
                  <div class="mt-2 flex flex-wrap gap-2">
                    {#each validSlots as vslot (vslot)}
                      <button
                        onclick={() => doEquip(inv.itemId, vslot)}
                        disabled={pendingSlot !== null}
                        class="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-black hover:bg-amber-500 disabled:opacity-50"
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
</main>
