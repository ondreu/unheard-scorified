import { Module } from '@nestjs/common';
import { RAID_QUEUE, RedisRaidQueue } from './raid.matchmaking';
import { RaidRepository } from './raid.repository';

/**
 * **Sdílená group-run infrastruktura** (legacy název `raid` — raidy jako herní
 * mód byly vyříznuty, ADR 0033). Zbyly jen znovupoužitelné kusy, na kterých stojí
 * **dungeony**: `RaidRepository` (tabulky `raid_runs`/`raid_run_participants`,
 * filtrované `content_type`) a `RAID_QUEUE` (Redis matchmaking fronta). Žádné
 * controllery/služby/gateway — ty patřily raidům a zmizely s nimi. Názvy `raid_*`
 * zůstávají jako interní legacy (minimální řez, ADR 0033).
 */
@Module({
  providers: [RaidRepository, { provide: RAID_QUEUE, useClass: RedisRaidQueue }],
  exports: [RaidRepository, RAID_QUEUE],
})
export class RaidModule {}
