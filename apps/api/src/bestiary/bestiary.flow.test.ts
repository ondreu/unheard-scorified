import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BESTIARY_IDS, DUNGEONS, dungeonTemplateCounts, type CombatActor } from '@game/shared';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import type { Database } from '../db/db.module';
import type { RotationService } from '../rotation/rotation.service';
import * as schema from '../db/schema';
import { BestiaryRepository } from './bestiary.repository';
import { BestiaryService } from './bestiary.service';

/**
 * Lehký stub bojového profilu (duel nepotřebuje plný RotationService) — vrátí
 * silnou postavu, aby duel proti běžnému foe spolehlivě skončil rozhodnutě.
 */
const rotationStub = {
  buildCombatProfile: async (character: { name: string }, level: number): Promise<CombatActor> => ({
    name: character.name,
    level,
    maxHealth: 2000,
    attackPower: 400,
    swingInterval: 2,
    critChance: 0.1,
    critMultiplier: 2,
    armor: 0,
    lifesteal: 0,
    shield: 0,
    armorClass: 18,
    attackBonus: 10,
    spellSaveDc: 15,
    damageType: 'slashing',
    signatureAbilities: [],
  }),
} as unknown as RotationService;

/**
 * Integrační test bestiáře nad pglite: odemčení/kill counter z dokončeného
 * obsahu + sestavení view (neobjevené = zašedlé, kills 0).
 */
describe('flow: bestiary', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let service: BestiaryService;
  let seq = 0;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    service = new BestiaryService(charRepo, new BestiaryRepository(db), rotationStub);
  });

  beforeEach(() => {
    seq += 1;
  });

  async function player(name: string): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(`bs_${name}_${seq}`, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'human', class: 'fighter' });
    return { accountId, id: char.id };
  }

  it('nový hráč: všechny záznamy viditelné, žádný objevený', async () => {
    const a = await player('Fresh');
    const view = await service.getBestiary(a.accountId, a.id);
    expect(view.totalCount).toBeGreaterThan(0);
    expect(view.discoveredCount).toBe(0);
    expect(view.totalKills).toBe(0);
    expect(view.entries.every((e) => !e.discovered && e.kills === 0)).toBe(true);
  });

  it('clear dungeonu odemkne jeho nepřátele + napočítá killy', async () => {
    const a = await player('Slayer');
    const dungeonId = Object.keys(DUNGEONS)[0]!;
    const counts = dungeonTemplateCounts(dungeonId);
    const templateIds = Object.keys(counts);
    expect(templateIds.length).toBeGreaterThan(0);

    await service.recordDungeonClear(a.id, dungeonId);

    const view = await service.getBestiary(a.accountId, a.id);
    for (const tid of templateIds) {
      const entry = view.entries.find((e) => e.templateId === tid)!;
      expect(entry.discovered).toBe(true);
      expect(entry.kills).toBe(counts[tid]);
    }
    // Nepřítel, který v dungeonu není, zůstává neobjevený.
    const others = view.entries.filter((e) => !templateIds.includes(e.templateId));
    expect(others.every((e) => !e.discovered)).toBe(true);
  });

  it('opakovaný clear inkrementuje kill counter', async () => {
    const a = await player('Grinder');
    const dungeonId = Object.keys(DUNGEONS)[0]!;
    const counts = dungeonTemplateCounts(dungeonId);
    const [tid] = Object.keys(counts);

    await service.recordDungeonClear(a.id, dungeonId);
    await service.recordDungeonClear(a.id, dungeonId);

    const view = await service.getBestiary(a.accountId, a.id);
    expect(view.entries.find((e) => e.templateId === tid)!.kills).toBe(counts[tid!]! * 2);
  });

  it('recordKills (procedurální obsah, např. Gauntlet) napočítá zadané šablony', async () => {
    const a = await player('Survivor');
    const dungeonId = Object.keys(DUNGEONS)[0]!;
    const tid = Object.keys(dungeonTemplateCounts(dungeonId))[0]!;

    await service.recordKills(a.id, { [tid]: 5 });
    let view = await service.getBestiary(a.accountId, a.id);
    expect(view.entries.find((e) => e.templateId === tid)!.kills).toBe(5);

    // Prázdná mapa = no-op (žádný pád, žádné objevení).
    await service.recordKills(a.id, {});
    view = await service.getBestiary(a.accountId, a.id);
    expect(view.discoveredCount).toBe(1);
  });

  it('nově objevené: clear značí NEW, markSeen je vynuluje pro příští návštěvu', async () => {
    const a = await player('Scout');
    const dungeonId = Object.keys(DUNGEONS)[0]!;
    await service.recordDungeonClear(a.id, dungeonId);

    // První pohled: objevené záznamy jsou „nové" (seenAt = null).
    let view = await service.getBestiary(a.accountId, a.id);
    expect(view.newCount).toBeGreaterThan(0);
    expect(view.entries.some((e) => e.isNew)).toBe(true);

    // markSeen → příští view už nic nového neukáže.
    await service.markSeen(a.accountId, a.id);
    view = await service.getBestiary(a.accountId, a.id);
    expect(view.newCount).toBe(0);
    expect(view.entries.every((e) => !e.isNew)).toBe(true);
  });

  it('duel: vrátí log + výsledek, ale NEpřipíše žádné odměny ani killy', async () => {
    const a = await player('Duelist');
    const tid = BESTIARY_IDS[0]!;
    const res = await service.duel(a.accountId, a.id, tid);
    expect(res.events.length).toBeGreaterThan(0);
    expect(typeof res.victory).toBe('boolean');
    expect(res.enemyName.length).toBeGreaterThan(0);
    // Bez odměn: bestiář se duelem nezmění (žádné objevení ani kill counter).
    const view = await service.getBestiary(a.accountId, a.id);
    expect(view.totalKills).toBe(0);
    expect(view.discoveredCount).toBe(0);
  });

  it('duel na neznámého nepřítele hází', async () => {
    const a = await player('BadDuelist');
    await expect(service.duel(a.accountId, a.id, 'nope_not_real')).rejects.toThrow();
  });

  it('getBestiary cizí postavy hází 404', async () => {
    const a = await player('Owner');
    const b = await player('Intruder');
    await expect(service.getBestiary(b.accountId, a.id)).rejects.toThrow();
  });
});
