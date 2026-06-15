import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { canTradeItem, itemDisplayName, tradeReady, type TradeSide } from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import type { Character, Trade } from '../db/schema';
import { TradeRepository } from './trade.repository';

export interface TradeOfferItem {
  itemId: string;
  name: string;
  quantity: number;
}

export interface TradeSideView {
  characterId: string;
  name: string;
  gold: number;
  confirmed: boolean;
  items: TradeOfferItem[];
}

export interface TradeView {
  id: string;
  status: string;
  mySide: TradeSide;
  me: TradeSideView;
  them: TradeSideView;
}

export interface TradeState {
  trade: TradeView | null;
}

/** Položka nabídky z requestu. */
export interface OfferItemInput {
  itemId: string;
  quantity: number;
}

/**
 * P2P trade (M8.5-D): přímá výměna itemů + zlata mezi dvěma postavami. Bez
 * escrow během vyjednávání — vlastnictví se ověří a převede atomicky až při
 * oboustranném potvrzení. Jakákoli změna nabídky resetuje potvrzení. Soulbound
 * (BoP) loot nelze běžně obchodovat (`canTradeItem`). Viz ADR 0019.
 */
@Injectable()
export class TradeService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly inventory: InventoryRepository,
    private readonly trades: TradeRepository,
  ) {}

  private async own(accountId: string, characterId: string): Promise<Character> {
    const char = await this.characters.findOwned(accountId, characterId);
    if (!char) throw new NotFoundException('Character not found');
    return char;
  }

  private sideOf(trade: Trade, characterId: string): TradeSide {
    return trade.initiatorCharacterId === characterId ? 'initiator' : 'partner';
  }

  /** Otevře trade s postavou dle jména. */
  async start(accountId: string, characterId: string, partnerName: string): Promise<TradeState> {
    await this.own(accountId, characterId);
    const partner = await this.characters.findByName(partnerName.trim());
    if (!partner) throw new NotFoundException('No character with that name');
    if (partner.id === characterId) throw new BadRequestException('Cannot trade with yourself');
    if (await this.trades.findOpenForCharacter(characterId)) {
      throw new BadRequestException('You are already in a trade');
    }
    if (await this.trades.findOpenForCharacter(partner.id)) {
      throw new BadRequestException('That character is already in a trade');
    }
    await this.trades.createTrade(characterId, partner.id);
    return this.stateFor(characterId);
  }

  async getState(accountId: string, characterId: string): Promise<TradeState> {
    await this.own(accountId, characterId);
    return this.stateFor(characterId);
  }

  private async stateFor(characterId: string): Promise<TradeState> {
    const trade = await this.trades.findOpenForCharacter(characterId);
    if (!trade) return { trade: null };
    return { trade: await this.buildView(trade, characterId) };
  }

  private async buildView(trade: Trade, viewerId: string): Promise<TradeView> {
    const items = await this.trades.listItems(trade.id);
    const [initChar, partnerChar] = await Promise.all([
      this.characters.findById(trade.initiatorCharacterId),
      this.characters.findById(trade.partnerCharacterId),
    ]);
    const sideView = (side: TradeSide, char: Character | undefined, gold: number, confirmed: boolean): TradeSideView => ({
      characterId: side === 'initiator' ? trade.initiatorCharacterId : trade.partnerCharacterId,
      name: char?.name ?? '?',
      gold,
      confirmed,
      items: items
        .filter((i) => i.side === side)
        .map((i) => ({ itemId: i.itemId, name: itemDisplayName(i.itemId), quantity: i.quantity })),
    });

    const initiator = sideView('initiator', initChar, trade.initiatorGold, trade.initiatorConfirmed === 1);
    const partner = sideView('partner', partnerChar, trade.partnerGold, trade.partnerConfirmed === 1);
    const mySide = this.sideOf(trade, viewerId);
    return {
      id: trade.id,
      status: trade.status,
      mySide,
      me: mySide === 'initiator' ? initiator : partner,
      them: mySide === 'initiator' ? partner : initiator,
    };
  }

  /** Nastaví celou nabídku volajícího (položky + zlato). Resetuje potvrzení obou. */
  async setOffer(
    accountId: string,
    characterId: string,
    items: OfferItemInput[],
    gold: number,
  ): Promise<TradeState> {
    const char = await this.own(accountId, characterId);
    const trade = await this.requireOpenTrade(characterId);
    const side = this.sideOf(trade, characterId);

    if (!Number.isInteger(gold) || gold < 0) throw new BadRequestException('Invalid gold amount');
    if (gold > char.gold) throw new BadRequestException('Not enough gold');

    // Slouč duplicity, validuj obchodovatelnost + vlastnictví.
    const merged = new Map<string, number>();
    for (const { itemId, quantity } of items) {
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new BadRequestException('Invalid item quantity');
      }
      if (!canTradeItem(itemId)) {
        throw new BadRequestException(`${itemDisplayName(itemId)} cannot be traded`);
      }
      merged.set(itemId, (merged.get(itemId) ?? 0) + quantity);
    }
    for (const [itemId, qty] of merged) {
      if ((await this.inventory.getQuantity(characterId, itemId)) < qty) {
        throw new BadRequestException(`Not enough ${itemDisplayName(itemId)}`);
      }
    }

    await this.trades.replaceItems(
      trade.id,
      side,
      [...merged].map(([itemId, quantity]) => ({ itemId, quantity })),
    );
    await this.trades.setGold(trade.id, side, gold);
    // Změna nabídky → obě strany musí znovu potvrdit.
    await this.trades.resetConfirmations(trade.id);
    return this.stateFor(characterId);
  }

  /** Potvrdí nabídku volajícího; když potvrdí obě strany, provede výměnu. */
  async confirm(accountId: string, characterId: string): Promise<TradeState> {
    await this.own(accountId, characterId);
    const trade = await this.requireOpenTrade(characterId);
    const side = this.sideOf(trade, characterId);
    await this.trades.setConfirmed(trade.id, side, true);

    const fresh = (await this.trades.findById(trade.id))!;
    if (tradeReady(fresh.initiatorConfirmed === 1, fresh.partnerConfirmed === 1)) {
      await this.execute(fresh);
    }
    return this.stateFor(characterId);
  }

  /** Zruší nabídku volajícího (odznačí potvrzení, nech trade otevřený). */
  async unconfirm(accountId: string, characterId: string): Promise<TradeState> {
    await this.own(accountId, characterId);
    const trade = await this.requireOpenTrade(characterId);
    await this.trades.setConfirmed(trade.id, this.sideOf(trade, characterId), false);
    return this.stateFor(characterId);
  }

  /** Zruší celý trade. */
  async cancel(accountId: string, characterId: string): Promise<TradeState> {
    await this.own(accountId, characterId);
    const trade = await this.trades.findOpenForCharacter(characterId);
    if (trade) await this.trades.setStatus(trade.id, 'cancelled');
    return { trade: null };
  }

  /**
   * Atomická výměna: ověří, že obě strany stále vlastní nabídnuté zlato i položky,
   * pak je převede. Při nesouladu (mezitím utracené/prodané) trade neselže tiše —
   * resetuje potvrzení a vyhodí chybu (hráči nabídku opraví).
   */
  private async execute(trade: Trade): Promise<void> {
    const items = await this.trades.listItems(trade.id);
    const initItems = items.filter((i) => i.side === 'initiator');
    const partnerItems = items.filter((i) => i.side === 'partner');

    const [initChar, partnerChar] = await Promise.all([
      this.characters.findById(trade.initiatorCharacterId),
      this.characters.findById(trade.partnerCharacterId),
    ]);
    if (!initChar || !partnerChar) {
      await this.trades.setStatus(trade.id, 'cancelled');
      throw new BadRequestException('A trader is no longer available');
    }

    // Ověř zlato i položky obou stran PŘED jakýmkoli převodem.
    const ok =
      initChar.gold >= trade.initiatorGold &&
      partnerChar.gold >= trade.partnerGold &&
      (await this.ownsAll(trade.initiatorCharacterId, initItems)) &&
      (await this.ownsAll(trade.partnerCharacterId, partnerItems));
    if (!ok) {
      await this.trades.resetConfirmations(trade.id);
      throw new BadRequestException('Trade failed: offered gold or items are no longer available');
    }

    // Zlato (spendGold je atomický; při souběhu vrať a přeruš).
    if (trade.initiatorGold > 0 && !(await this.characters.spendGold(trade.initiatorCharacterId, trade.initiatorGold))) {
      await this.trades.resetConfirmations(trade.id);
      throw new BadRequestException('Trade failed: insufficient gold');
    }
    if (trade.partnerGold > 0 && !(await this.characters.spendGold(trade.partnerCharacterId, trade.partnerGold))) {
      if (trade.initiatorGold > 0) await this.characters.addGold(trade.initiatorCharacterId, trade.initiatorGold);
      await this.trades.resetConfirmations(trade.id);
      throw new BadRequestException('Trade failed: insufficient gold');
    }
    await this.characters.addGold(trade.partnerCharacterId, trade.initiatorGold);
    await this.characters.addGold(trade.initiatorCharacterId, trade.partnerGold);

    // Položky.
    for (const it of initItems) {
      await this.inventory.consume(trade.initiatorCharacterId, it.itemId, it.quantity);
      await this.inventory.addItemQty(trade.partnerCharacterId, it.itemId, it.quantity);
    }
    for (const it of partnerItems) {
      await this.inventory.consume(trade.partnerCharacterId, it.itemId, it.quantity);
      await this.inventory.addItemQty(trade.initiatorCharacterId, it.itemId, it.quantity);
    }

    await this.trades.setStatus(trade.id, 'completed');
  }

  private async ownsAll(
    characterId: string,
    items: { itemId: string; quantity: number }[],
  ): Promise<boolean> {
    for (const it of items) {
      if ((await this.inventory.getQuantity(characterId, it.itemId)) < it.quantity) return false;
    }
    return true;
  }

  private async requireOpenTrade(characterId: string): Promise<Trade> {
    const trade = await this.trades.findOpenForCharacter(characterId);
    if (!trade) throw new BadRequestException('You are not in a trade');
    return trade;
  }
}
