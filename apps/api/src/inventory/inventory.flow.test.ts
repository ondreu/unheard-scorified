import { resolve } from 'node:path';
import { ITEMS } from '@game/shared';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { BuffRepository } from '../buff/buff.repository';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';

/**
 * Integrační testy M4 inventory systému nad in-memory Postgresem (pglite).
 * Testuje: přidání itemu, equip, unequip, validaci slotů.
 */
describe('M4 flow: inventory & equipment', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let invRepo: InventoryRepository;
  let invService: InventoryService;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    invRepo = new InventoryRepository(db);
    invService = new InventoryService(charRepo, invRepo, new BuffRepository(db));
  });

  async function newCharacter(
    username: string,
    name: string,
  ): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'human', class: 'warrior' });
    return { accountId, id: char.id };
  }

  it('prázdný inventář i equipment na startu', async () => {
    const { accountId, id } = await newCharacter('inv1', 'Garona');
    const inv = await invService.listInventory(accountId, id);
    expect(inv).toHaveLength(0);
    const eq = await invService.listEquipment(accountId, id);
    expect(eq.equipped).toHaveLength(0);
    expect(eq.equipmentStats).toEqual({});
  });

  it('addItem přidá item do inventáře, duplikát zvýší quantity', async () => {
    const { accountId, id } = await newCharacter('inv2', 'Thrall');
    await invRepo.addItem(id, 'iron_shortsword');
    await invRepo.addItem(id, 'iron_shortsword');

    const inv = await invService.listInventory(accountId, id);
    expect(inv).toHaveLength(1);
    expect(inv[0]?.itemId).toBe('iron_shortsword');
    expect(inv[0]?.quantity).toBe(2);
  });

  it('equip z inventáře funguje, unequip vrátí prázdný slot', async () => {
    const { accountId, id } = await newCharacter('inv3', 'Jaina');
    await invRepo.addItem(id, 'iron_shortsword');

    const after = await invService.equip(accountId, id, 'iron_shortsword', 'main_hand');
    expect(after.equipped).toHaveLength(1);
    expect(after.equipped[0]?.slot).toBe('main_hand');
    expect(after.equipped[0]?.itemId).toBe('iron_shortsword');
    expect(after.equipmentStats.strength).toBeGreaterThan(0);

    const unequipped = await invService.unequip(accountId, id, 'main_hand');
    expect(unequipped.equipped).toHaveLength(0);
  });

  it('equip do špatného slotu vyhodí chybu', async () => {
    const { accountId, id } = await newCharacter('inv4', 'Varian');
    await invRepo.addItem(id, 'iron_shortsword');

    // iron_shortsword jde jen do main_hand nebo off_hand, ne do head
    await expect(invService.equip(accountId, id, 'iron_shortsword', 'head')).rejects.toThrow();
  });

  it('equip itemu, který postava nevlastní, vyhodí chybu', async () => {
    const { accountId, id } = await newCharacter('inv5', 'Anduin');
    await expect(invService.equip(accountId, id, 'iron_shortsword', 'main_hand')).rejects.toThrow();
  });

  it('equipnutí nového itemu do obsazeného slotu nahradí starý', async () => {
    const { accountId, id } = await newCharacter('inv6', 'Sylvanas');
    await invRepo.addItem(id, 'iron_shortsword');
    await invRepo.addItem(id, 'stormfury_blade');

    await invService.equip(accountId, id, 'iron_shortsword', 'main_hand');
    const after = await invService.equip(accountId, id, 'stormfury_blade', 'main_hand');

    expect(after.equipped).toHaveLength(1);
    expect(after.equipped[0]?.itemId).toBe('stormfury_blade');
  });

  it('equip přesune item z inventáře (není vidět na dvou místech), unequip ho vrátí', async () => {
    const { accountId, id } = await newCharacter('inv8', 'Tyrande');
    await invRepo.addItem(id, 'iron_shortsword');

    await invService.equip(accountId, id, 'iron_shortsword', 'main_hand');
    let inv = await invService.listInventory(accountId, id);
    expect(inv).toHaveLength(0); // item už je jen ve slotu, ne v inventáři

    await invService.unequip(accountId, id, 'main_hand');
    inv = await invService.listInventory(accountId, id);
    expect(inv).toHaveLength(1);
    expect(inv[0]?.itemId).toBe('iron_shortsword');
    expect(inv[0]?.quantity).toBe(1);
  });

  it('jeden prsten nelze nasadit do dvou slotů zároveň', async () => {
    const { accountId, id } = await newCharacter('inv9', 'Malfurion');
    // Najdi libovolný prsten (slot finger) v katalogu.
    const ringId = Object.values(ITEMS).find((it) => it.slot === 'finger')?.id;
    expect(ringId).toBeDefined();
    await invRepo.addItem(id, ringId!);

    await invService.equip(accountId, id, ringId!, 'finger1');
    // Druhý slot už nemá co nasadit — kus byl spotřebován z inventáře.
    await expect(invService.equip(accountId, id, ringId!, 'finger2')).rejects.toThrow();

    const eq = await invService.listEquipment(accountId, id);
    expect(eq.equipped).toHaveLength(1);
  });

  it('dva kusy téhož prstenu lze nasadit do obou slotů', async () => {
    const { accountId, id } = await newCharacter('inv10', 'Illidan');
    const ringId = Object.values(ITEMS).find((it) => it.slot === 'finger')?.id;
    await invRepo.addItem(id, ringId!);
    await invRepo.addItem(id, ringId!);

    await invService.equip(accountId, id, ringId!, 'finger1');
    const after = await invService.equip(accountId, id, ringId!, 'finger2');
    expect(after.equipped).toHaveLength(2);
    const inv = await invService.listInventory(accountId, id);
    expect(inv).toHaveLength(0);
  });

  it('swap obsazeného slotu vrátí starý item do inventáře', async () => {
    const { accountId, id } = await newCharacter('inv11', 'Maiev');
    await invRepo.addItem(id, 'iron_shortsword');
    await invRepo.addItem(id, 'stormfury_blade');

    await invService.equip(accountId, id, 'iron_shortsword', 'main_hand');
    await invService.equip(accountId, id, 'stormfury_blade', 'main_hand');

    const inv = await invService.listInventory(accountId, id);
    // iron_shortsword se vrátil do inventáře, stormfury_blade je ve slotu
    expect(inv).toHaveLength(1);
    expect(inv[0]?.itemId).toBe('iron_shortsword');
    expect(inv[0]?.quantity).toBe(1);
  });

  it('armor proficiency: mage nemůže nasadit plate, ale cloth ano', async () => {
    const tokens = await auth.register('inv_mage', 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const mage = await characters.create(accountId, { name: 'Khadgar', race: 'human', class: 'mage' });

    await invRepo.addItem(mage.id, 'warlord_plate'); // plate chest
    await invRepo.addItem(mage.id, 'arcane_robes'); // cloth chest

    await expect(invService.equip(accountId, mage.id, 'warlord_plate', 'chest')).rejects.toThrow();

    const after = await invService.equip(accountId, mage.id, 'arcane_robes', 'chest');
    expect(after.equipped[0]?.itemId).toBe('arcane_robes');
  });

  it('warrior unese plate i cloth', async () => {
    const { accountId, id } = await newCharacter('inv_war', 'Bolvar');
    await invRepo.addItem(id, 'warlord_plate');
    const after = await invService.equip(accountId, id, 'warlord_plate', 'chest');
    expect(after.equipped[0]?.itemId).toBe('warlord_plate');
  });

  it('cizí účet nemůže spravovat inventář postavy', async () => {
    const owner = await newCharacter('inv7a', 'Arthas');
    const other = await newCharacter('inv7b', 'Uther');
    await invRepo.addItem(owner.id, 'iron_shortsword');

    await expect(
      invService.listInventory(other.accountId, owner.id),
    ).rejects.toThrow();
  });
});
