import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthService } from '../auth/auth.service';
import type { Database } from '../db/db.module';
import * as schema from '../db/schema';
import { CharacterRepository } from '../character/character.repository';
import { CharacterService } from '../character/character.service';
import { SpellService } from './spell.service';

/**
 * Integrační test MR-4 (spell sloty) nad in-memory Postgresem (pglite). Ověřuje
 * spellbook + stav slotů (max/available/rested), spotřebu (spent round-trip přes
 * DB) a Long Rest reset — vše bez běžícího Dockeru.
 */
describe('MR-4 flow: spell sloty + spellbook', () => {
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let spells: SpellService;

  beforeAll(async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    spells = new SpellService(charRepo);
  });

  async function registerAndGetId(username: string): Promise<string> {
    const tokens = await auth.register(username, 'password123');
    return auth.verifyAccessToken(tokens.accessToken).sub;
  }

  it('full caster (wizard) has D&D slots, a spellbook and starts rested', async () => {
    const accountId = await registerAndGetId('mage');
    const char = await characters.create(accountId, { name: 'Khadgar', race: 'human', class: 'wizard' });

    const view = await spells.getSpells(accountId, char.id);
    expect(view.casterType).toBe('full');
    expect(view.spellcastingAbility).toBe('intelligence');
    // lvl 1 full caster = dva sloty 1. tieru
    expect(view.slots).toEqual([{ tier: 1, max: 2, available: 2 }]);
    expect(view.totalMax).toBe(2);
    expect(view.totalAvailable).toBe(2);
    expect(view.rested).toBe(true);
    expect(view.spellbook.cantrips.map((c) => c.id)).toContain('wiz_fire_bolt');
  });

  it('non-caster (fighter) has no slots and an empty spellbook', async () => {
    const accountId = await registerAndGetId('warrior');
    const char = await characters.create(accountId, { name: 'Bolvar', race: 'human', class: 'fighter' });

    const view = await spells.getSpells(accountId, char.id);
    expect(view.casterType).toBe('none');
    expect(view.spellcastingAbility).toBeNull();
    expect(view.slots).toEqual([]);
    expect(view.totalMax).toBe(0);
    expect(view.spellbook.cantrips).toEqual([]);
    expect(view.spellbook.spellsByTier).toEqual([]);
  });

  it('spent slots reduce availability (round-trips through DB)', async () => {
    const accountId = await registerAndGetId('caster2');
    const char = await characters.create(accountId, { name: 'Jaina', race: 'human', class: 'cleric' });

    // simulace spotřeby aktivitou: 1 vyčerpaný slot 1. tieru
    await charRepo.setSpentSpellSlots(char.id, { 1: 1 });

    const view = await spells.getSpells(accountId, char.id);
    const tier1 = view.slots.find((s) => s.tier === 1)!;
    expect(tier1.max).toBe(2);
    expect(tier1.available).toBe(1);
    expect(view.rested).toBe(false);
    expect(view.totalAvailable).toBe(view.totalMax - 1);
  });

  it('long rest fully restores spell slots', async () => {
    const accountId = await registerAndGetId('caster3');
    const char = await characters.create(accountId, { name: 'Medivh', race: 'human', class: 'sorcerer' });
    await charRepo.setSpentSpellSlots(char.id, { 1: 2 });

    const before = await spells.getSpells(accountId, char.id);
    expect(before.rested).toBe(false);

    const after = await spells.longRest(accountId, char.id);
    expect(after.rested).toBe(true);
    expect(after.totalAvailable).toBe(after.totalMax);
  });

  it('prepared: default (no explicit choice) = legacy baseline, preparedExplicit false', async () => {
    const accountId = await registerAndGetId('prep-default');
    const char = await characters.create(accountId, { name: 'Aegwynn', race: 'human', class: 'wizard' });
    const view = await spells.getSpells(accountId, char.id);
    expect(view.preparedExplicit).toBe(false);
    expect(view.prepared.length).toBeGreaterThan(0);
    expect(view.pool.cantrips.length + view.pool.leveled.length).toBeGreaterThan(view.prepared.length);
    expect(view.canEdit).toBe(true); // rested
  });

  it('prepared: saving a valid selection (rested) persists and reflects in view', async () => {
    const accountId = await registerAndGetId('prep-save');
    const char = await characters.create(accountId, { name: 'Rhonin', race: 'human', class: 'wizard' });
    const before = await spells.getSpells(accountId, char.id);
    const chosen = [
      ...before.pool.cantrips.slice(0, before.limits.cantrips).map((s) => s.id),
      ...before.pool.leveled.slice(0, before.limits.leveled).map((s) => s.id),
    ];
    const after = await spells.setPrepared(accountId, char.id, chosen);
    expect(after.preparedExplicit).toBe(true);
    expect([...after.prepared].sort()).toEqual([...chosen].sort());
    // round-trip přes DB
    const reloaded = await spells.getSpells(accountId, char.id);
    expect([...reloaded.prepared].sort()).toEqual([...chosen].sort());
  });

  it('prepared: rejects over-limit / unknown selections', async () => {
    const accountId = await registerAndGetId('prep-bad');
    const char = await characters.create(accountId, { name: 'Arugal', race: 'human', class: 'wizard' });
    const view = await spells.getSpells(accountId, char.id);
    // víc cantripů než limit
    const tooManyCantrips = view.pool.cantrips.slice(0, view.limits.cantrips + 1).map((s) => s.id);
    if (tooManyCantrips.length > view.limits.cantrips) {
      await expect(spells.setPrepared(accountId, char.id, tooManyCantrips)).rejects.toThrow();
    }
    await expect(spells.setPrepared(accountId, char.id, ['not_a_spell'])).rejects.toThrow();
  });

  it('prepared: blocked while not rested (Long Rest gate)', async () => {
    const accountId = await registerAndGetId('prep-rest');
    const char = await characters.create(accountId, { name: 'Kel', race: 'human', class: 'wizard' });
    await charRepo.setSpentSpellSlots(char.id, { 1: 1 });
    const view = await spells.getSpells(accountId, char.id);
    expect(view.canEdit).toBe(false);
    await expect(spells.setPrepared(accountId, char.id, [])).rejects.toThrow('Long Rest');
  });

  it('prepared: non-caster rejects preparing spells', async () => {
    const accountId = await registerAndGetId('prep-martial');
    const char = await characters.create(accountId, { name: 'Garrosh', race: 'human', class: 'fighter' });
    await expect(spells.setPrepared(accountId, char.id, [])).rejects.toThrow('does not prepare');
  });

  it('rejects access to a character the account does not own', async () => {
    const a = await registerAndGetId('owner-a');
    const b = await registerAndGetId('owner-b');
    const char = await characters.create(a, { name: 'Antonidas', race: 'human', class: 'wizard' });
    await expect(spells.getSpells(b, char.id)).rejects.toThrow('Character not found');
  });
});
