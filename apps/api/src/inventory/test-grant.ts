import type { Database } from '../db/db.module';
import { MailRepository } from '../mail/mail.repository';
import { BagRepository } from './bag.repository';
import { InventoryGrantService } from './inventory-grant.service';
import { InventoryRepository } from './inventory.repository';

/**
 * Sestaví `InventoryGrantService` pro integrační testy (pglite). Sdílené, aby se
 * každý flow test nemusel ručně skládat z BagRepository + MailRepository.
 */
export function makeGrant(db: Database, invRepo = new InventoryRepository(db)): InventoryGrantService {
  return new InventoryGrantService(invRepo, new BagRepository(db), new MailRepository(db));
}
