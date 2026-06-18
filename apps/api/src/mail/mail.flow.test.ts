import { resolve } from 'node:path';
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
import { InventoryRepository } from '../inventory/inventory.repository';
import { MailRepository } from './mail.repository';
import { makeGrant } from '../inventory/test-grant';
import { MailService } from './mail.service';

/**
 * Integrační test pošty (M9) nad pglite. Pokrývá odeslání s přílohami (item +
 * zlato) → escrow ze sendera → vyzvednutí příjemcem.
 */
describe('M9 flow: mail', () => {
  let auth: AuthService;
  let characters: CharacterService;
  let charRepo: CharacterRepository;
  let invRepo: InventoryRepository;
  let mail: MailService;
  let seq = 0;

  beforeAll(async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

    auth = new AuthService(db, new JwtService());
    charRepo = new CharacterRepository(db);
    characters = new CharacterService(charRepo);
    invRepo = new InventoryRepository(db);
    mail = new MailService(charRepo, invRepo, makeGrant(db, invRepo), new MailRepository(db));
  });

  async function player(name: string): Promise<{ accountId: string; id: string; name: string }> {
    seq += 1;
    const tokens = await auth.register(`mail_${name}_${seq}`, 'password123');
    const accountId = auth.verifyAccessToken(tokens.accessToken).sub;
    const char = await characters.create(accountId, { name, race: 'half_orc', class: 'fighter' });
    return { accountId, id: char.id, name: char.name };
  }

  it('odeslání s přílohou (item + zlato) → escrow → vyzvednutí', async () => {
    const sender = await player('Sender');
    const recipient = await player('Postal');
    await charRepo.addRewards(sender.id, 0, 500); // 500 zlata
    await invRepo.addItem(sender.id, 'iron_shortsword');

    await mail.send(sender.accountId, sender.id, recipient.name, 'Hello', 'A gift', [
      { itemId: 'iron_shortsword', quantity: 1 },
    ], 100);

    // Escrow: senderovi ubylo zlato i item.
    expect((await charRepo.findById(sender.id))!.gold).toBe(400);
    expect(await invRepo.getQuantity(sender.id, 'iron_shortsword')).toBe(0);

    // Příjemce má zprávu s přílohami.
    const box = await mail.getMailbox(recipient.accountId, recipient.id);
    expect(box.mail).toHaveLength(1);
    expect(box.unread).toBe(1);
    const m = box.mail[0]!;
    expect(m.subject).toBe('Hello');
    expect(m.gold).toBe(100);
    expect(m.hasAttachments).toBe(true);

    // Vyzvednutí → item + zlato do inventáře/zůstatku.
    await mail.claim(recipient.accountId, recipient.id, m.id);
    expect((await charRepo.findById(recipient.id))!.gold).toBe(100);
    expect(await invRepo.getQuantity(recipient.id, 'iron_shortsword')).toBe(1);

    // Po vyzvednutí už nemá přílohy → lze smazat.
    const after = await mail.getMailbox(recipient.accountId, recipient.id);
    expect(after.mail[0]!.hasAttachments).toBe(false);
    const removed = await mail.remove(recipient.accountId, recipient.id, m.id);
    expect(removed.mail).toHaveLength(0);
  });

  it('nelze poslat sám sobě ani neznámému; chybí-li zlato, odmítne', async () => {
    const a = await player('Solo');
    await expect(mail.send(a.accountId, a.id, a.name, 'Hi', '', [], 0)).rejects.toThrow();
    await expect(mail.send(a.accountId, a.id, 'Nobody', 'Hi', '', [], 0)).rejects.toThrow();
    const b = await player('Other');
    await expect(mail.send(a.accountId, a.id, b.name, 'Hi', '', [], 9999)).rejects.toThrow();
  });
});
