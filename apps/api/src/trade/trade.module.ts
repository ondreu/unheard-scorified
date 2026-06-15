import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { TradeController } from './trade.controller';
import { TradeRepository } from './trade.repository';
import { TradeService } from './trade.service';

/**
 * P2P trade (M8.5-D, ruční výměna). Odemčeno M9 social. Přímá výměna itemů +
 * zlata mezi dvěma postavami s oboustranným potvrzením a atomickým provedením
 * (bez escrow). Soulbound (BoP) loot nelze běžně obchodovat. Viz ADR 0019.
 */
@Module({
  imports: [AuthModule, CharacterModule, InventoryModule],
  controllers: [TradeController],
  providers: [TradeService, TradeRepository],
})
export class TradeModule {}
