import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BESTIARY, BESTIARY_IDS } from '@game/shared';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryService } from '../inventory/inventory.service';
import { BuffRepository } from '../buff/buff.repository';
import { LevelUpRepository } from '../levelup/levelup.repository';
import { RotationService } from '../rotation/rotation.service';
import { RotationRepository } from '../rotation/rotation.repository';
import { DuelService, type DuelRunView } from './duel.service';
import { DuelRepository } from './duel.repository';

/**
 * Integrační test tahového duelu (Duel v bestiáři, Slice 2) nad pglite. Ověřuje
 * stateful run + **že duel nedává žádné odměny** (XP postavy se nemění).
 */
describe('Slice 2 flow: turn-based duel', () => {
  let db: Database;
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let duel: DuelService;

  // Nejnižší-CR nepřítel = robustní výhra silné postavy.
  const lowCrId = [...BESTIARY_IDS].sort((a, b) => BESTIARY[a]!.cr - BESTIARY[b]!.cr)[0]!;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
  });

  beforeEach(() => {
    const invRepo = new InventoryRepository(db);
    const invService = new InventoryService(charRepo, invRepo, new BuffRepository(db));
    duel = new DuelService(
      charRepo,
      new RotationService(charRepo, new LevelUpRepository(db), new RotationRepository(db), invService),
      new DuelRepository(db),
    );
  });

  async function strongCharacter(username: string, name: string): Promise<{ accountId: string; id: string }> {
    const tokens = await auth.register(username, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'half_orc', class: 'fighter' });
    await charRepo.addRewards(char.id, 50_000_000, 0); // cap level
    await new InventoryRepository(db).addItem(char.id, 'crusader_blade');
    await new InventoryRepository(db).equip(char.id, 'main_hand', 'crusader_blade');
    return { accountId, id: char.id };
  }

  function target(run: DuelRunView): number {
    const alive = run.enemies.find((e) => e.currentHealth > 0);
    return alive?.idx ?? 0;
  }

  async function play(accountId: string, id: string, runId: string): Promise<DuelRunView> {
    let run = await duel.getRun(accountId, id, runId);
    let guard = 0;
    while (run.status === 'in_combat' && guard++ < 2000) {
      run = await duel.act(accountId, id, runId, 'basic_attack', target(run));
    }
    return run;
  }

  it('enter založí duel run (1 encounter, 1 nepřítel, plné HP)', async () => {
    const c = await strongCharacter('d1', 'Duelist');
    const run = await duel.enter(c.accountId, c.id, lowCrId);
    expect(run.templateId).toBe(lowCrId);
    expect(run.enemyName).toBe(BESTIARY[lowCrId]!.name);
    expect(run.status).toBe('in_combat');
    expect(run.enemies).toHaveLength(1);
    expect(run.victory).toBeNull();
    expect(run.player.currentHealth).toBe(run.player.maxHealth);
    expect(run.abilities.some((a) => a.id === 'basic_attack')).toBe(true);
  });

  it('jen jeden aktivní duel; druhý enter selže', async () => {
    const c = await strongCharacter('d2', 'Solo');
    await duel.enter(c.accountId, c.id, lowCrId);
    await expect(duel.enter(c.accountId, c.id, lowCrId)).rejects.toThrow();
  });

  it('duel proti neznámé šabloně selže', async () => {
    const c = await strongCharacter('d3', 'Picky');
    await expect(duel.enter(c.accountId, c.id, 'nope_not_real')).rejects.toThrow();
  });

  it('silná postava vyhraje duel tah po tahu — a NEDOSTANE žádné odměny', async () => {
    const c = await strongCharacter('d4', 'Champion');
    const before = (await charRepo.findById(c.id))!.totalXp;
    const started = await duel.enter(c.accountId, c.id, lowCrId);
    const done = await play(c.accountId, c.id, started.runId);

    expect(done.status).toBe('cleared');
    expect(done.victory).toBe(true);
    // Žádné odměny: XP postavy se duelem nezměnilo.
    expect((await charRepo.findById(c.id))!.totalXp).toBe(before);
    // Po dokončení lze začít nový duel.
    await expect(duel.enter(c.accountId, c.id, lowCrId)).resolves.toBeTruthy();
  });

  it('abandon ukončí duel (dead), bez odměn; pak lze začít znovu', async () => {
    const c = await strongCharacter('d5', 'Quitter');
    const started = await duel.enter(c.accountId, c.id, lowCrId);
    const done = await duel.abandon(c.accountId, c.id, started.runId);
    expect(done.status).toBe('dead');
    expect(done.victory).toBe(false);
    await expect(duel.enter(c.accountId, c.id, lowCrId)).resolves.toBeTruthy();
  });

  it('cizí účet nemůže číst/hrát cizí duel', async () => {
    const owner = await strongCharacter('d6a', 'Owner');
    const intruder = await strongCharacter('d6b', 'Intruder');
    const run = await duel.enter(owner.accountId, owner.id, lowCrId);
    await expect(duel.getRun(intruder.accountId, intruder.id, run.runId)).rejects.toThrow();
    await expect(duel.act(intruder.accountId, intruder.id, run.runId, 'basic_attack', 0)).rejects.toThrow();
  });
});
