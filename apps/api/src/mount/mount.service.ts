import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  isMountId,
  levelFromXp,
  MOUNT_LIST,
  MOUNTS,
  mountSpeedBonus,
  type MountTier,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import { MountRepository } from './mount.repository';

/** Jeden mount z pohledu postavy (vlastní/aktivní/dostupnost). */
export interface MountView {
  id: string;
  name: string;
  description: string;
  tier: MountTier;
  requiredLevel: number;
  cost: number;
  speedBonus: number;
  owned: boolean;
  /** Kosmeticky zvolený („active") mount postavy. */
  active: boolean;
  /** Postava splňuje level i má dost zlata (a ještě ho nevlastní). */
  affordable: boolean;
  meetsLevel: boolean;
}

export interface MountsView {
  characterLevel: number;
  gold: number;
  /** Efektivní speed bonus (0..1) z nejlepšího vlastněného mountu. */
  speedBonus: number;
  activeMountId: string | null;
  mounts: MountView[];
}

@Injectable()
export class MountService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly mounts: MountRepository,
  ) {}

  /** Stáj postavy: katalog mountů + stav vlastnictví/dostupnosti. */
  async listMounts(accountId: string, characterId: string): Promise<MountsView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');

    const ownedIds = await this.mounts.ownedIds(characterId);
    const ownedSet = new Set(ownedIds);
    const level = levelFromXp(character.totalXp);

    const mounts: MountView[] = MOUNT_LIST.map((m) => {
      const owned = ownedSet.has(m.id);
      const meetsLevel = level >= m.requiredLevel;
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        tier: m.tier,
        requiredLevel: m.requiredLevel,
        cost: m.cost,
        speedBonus: m.speedBonus,
        owned,
        active: character.activeMountId === m.id,
        meetsLevel,
        affordable: !owned && meetsLevel && character.gold >= m.cost,
      };
    });

    return {
      characterLevel: level,
      gold: character.gold,
      speedBonus: mountSpeedBonus(ownedIds),
      activeMountId: character.activeMountId,
      mounts,
    };
  }

  /** Koupí mount: ověří level + zlato, atomicky strhne cenu, zapíše vlastnictví. */
  async buy(accountId: string, characterId: string, mountId: string): Promise<MountsView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    if (!isMountId(mountId)) throw new BadRequestException('Unknown mount');

    const def = MOUNTS[mountId]!;
    if (await this.mounts.owns(characterId, mountId)) {
      throw new BadRequestException('Mount already owned');
    }
    const level = levelFromXp(character.totalXp);
    if (level < def.requiredLevel) {
      throw new BadRequestException(`Requires level ${def.requiredLevel}`);
    }

    const paid = await this.characters.spendGold(characterId, def.cost);
    if (!paid) throw new BadRequestException('Not enough gold');

    await this.mounts.add(characterId, mountId);
    // První koupený mount se rovnou nastaví jako aktivní (kosmeticky).
    if (!character.activeMountId) {
      await this.characters.setActiveMount(characterId, mountId);
    }

    return this.listMounts(accountId, characterId);
  }

  /** Nastaví kosmeticky zvolený („active") mount — musí být vlastněný. */
  async select(accountId: string, characterId: string, mountId: string): Promise<MountsView> {
    const character = await this.characters.findOwned(accountId, characterId);
    if (!character) throw new NotFoundException('Character not found');
    if (!isMountId(mountId)) throw new BadRequestException('Unknown mount');
    if (!(await this.mounts.owns(characterId, mountId))) {
      throw new BadRequestException('Mount not owned');
    }

    await this.characters.setActiveMount(characterId, mountId);
    return this.listMounts(accountId, characterId);
  }
}
