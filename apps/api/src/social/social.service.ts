import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  canBefriend,
  friendCounterpart,
  levelFromXp,
  MAX_FRIENDS,
  type ClassId,
  type Faction,
  type RaceId,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import type { Character, Friendship } from '../db/schema';
import { SocialEventsRelay } from './social.events';
import { SocialRepository } from './social.repository';

/** Postava (přítel) v sociálním přehledu. */
export interface FriendView {
  characterId: string;
  name: string;
  level: number;
  race: RaceId;
  class: ClassId;
  faction: Faction;
  /** Kdy přátelství vzniklo (ISO). */
  since: string;
}

/** Čekající žádost (příchozí nebo odeslaná). */
export interface FriendRequestView {
  requestId: string;
  /** Druhá strana žádosti. */
  characterId: string;
  name: string;
  level: number;
  race: RaceId;
  class: ClassId;
  faction: Faction;
  sentAt: string;
}

export interface SocialView {
  friends: FriendView[];
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
}

export interface FriendActionResult {
  /** True = žádost rovnou potvrzena (protistrana už žádala) → hned přátelé. */
  accepted: boolean;
  social: SocialView;
}

/**
 * Friends (M9 social). Vztahy jsou per-postava (vanilla-WoW styl). Vše
 * server-authoritative, stateless. Realtime notifikace přes `SocialEventsRelay`
 * (best-effort; REST je zdroj pravdy).
 */
@Injectable()
export class SocialService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly social: SocialRepository,
    private readonly relay: SocialEventsRelay,
  ) {}

  /** Ověří vlastnictví postavy účtem. */
  private async own(accountId: string, characterId: string): Promise<Character> {
    const char = await this.characters.findOwned(accountId, characterId);
    if (!char) throw new NotFoundException('Character not found');
    return char;
  }

  /** Sociální přehled postavy: přátelé + příchozí/odeslané žádosti. */
  async getSocial(accountId: string, characterId: string): Promise<SocialView> {
    await this.own(accountId, characterId);
    const [accepted, incoming, outgoing] = await Promise.all([
      this.social.listAccepted(characterId),
      this.social.listIncoming(characterId),
      this.social.listOutgoing(characterId),
    ]);

    // Načti všechny protistrany jedním dotazem.
    const counterpartIds = new Set<string>();
    for (const f of [...accepted, ...incoming, ...outgoing]) {
      const other = friendCounterpart(characterId, f.requesterCharacterId, f.addresseeCharacterId);
      if (other) counterpartIds.add(other);
    }
    const chars = await this.characters.findByIds([...counterpartIds]);
    const byId = new Map(chars.map((c) => [c.id, c]));

    const friends: FriendView[] = [];
    for (const f of accepted) {
      const otherId = friendCounterpart(
        characterId,
        f.requesterCharacterId,
        f.addresseeCharacterId,
      );
      const other = otherId ? byId.get(otherId) : undefined;
      if (!other) continue;
      friends.push({
        characterId: other.id,
        name: other.name,
        level: levelFromXp(other.totalXp),
        race: other.race,
        class: other.class,
        faction: other.faction,
        since: (f.respondedAt ?? f.createdAt).toISOString(),
      });
    }
    friends.sort((a, b) => a.name.localeCompare(b.name));

    const toRequest = (f: Friendship): FriendRequestView | null => {
      const otherId = friendCounterpart(
        characterId,
        f.requesterCharacterId,
        f.addresseeCharacterId,
      );
      const other = otherId ? byId.get(otherId) : undefined;
      if (!other) return null;
      return {
        requestId: f.id,
        characterId: other.id,
        name: other.name,
        level: levelFromXp(other.totalXp),
        race: other.race,
        class: other.class,
        faction: other.faction,
        sentAt: f.createdAt.toISOString(),
      };
    };

    return {
      friends,
      incoming: incoming.map(toRequest).filter((r): r is FriendRequestView => r !== null),
      outgoing: outgoing.map(toRequest).filter((r): r is FriendRequestView => r !== null),
    };
  }

  /**
   * Pošle žádost o přátelství postavě dle jména. Pokud protistrana už poslala
   * žádost mně (pending opačným směrem), rovnou potvrdí (vzájemné přátelství).
   */
  async sendRequest(
    accountId: string,
    characterId: string,
    targetName: string,
  ): Promise<FriendActionResult> {
    await this.own(accountId, characterId);

    const name = targetName.trim();
    if (!name) throw new BadRequestException('Target name required');

    const target = await this.characters.findByName(name);
    if (!target) throw new NotFoundException('No character with that name');
    if (!canBefriend(characterId, target.id)) {
      throw new BadRequestException('You cannot add yourself');
    }

    const existing = await this.social.findBetween(characterId, target.id);
    let accepted = false;
    if (existing) {
      if (existing.status === 'accepted') {
        throw new BadRequestException('Already friends');
      }
      // Pending existuje. Pokud ji poslala protistrana mně → potvrď (mutual).
      if (existing.addresseeCharacterId === characterId) {
        await this.social.accept(existing.id);
        accepted = true;
        this.relay.friendAccepted(target.id, (await this.own(accountId, characterId)).name);
      } else {
        throw new BadRequestException('Request already pending');
      }
    } else {
      if ((await this.social.countAccepted(characterId)) >= MAX_FRIENDS) {
        throw new BadRequestException('Friend list is full');
      }
      await this.social.create(characterId, target.id, 'pending');
      const self = await this.own(accountId, characterId);
      this.relay.friendRequest(target.id, self.name);
    }

    return { accepted, social: await this.getSocial(accountId, characterId) };
  }

  /** Potvrdí (accept) nebo odmítne (smaže) příchozí žádost. */
  async respond(
    accountId: string,
    characterId: string,
    requestId: string,
    accept: boolean,
  ): Promise<SocialView> {
    const self = await this.own(accountId, characterId);
    const req = await this.social.findById(requestId);
    if (!req || req.status !== 'pending') throw new NotFoundException('Request not found');
    if (req.addresseeCharacterId !== characterId) {
      throw new ForbiddenException('Not your request to answer');
    }

    if (accept) {
      if ((await this.social.countAccepted(characterId)) >= MAX_FRIENDS) {
        throw new BadRequestException('Friend list is full');
      }
      await this.social.accept(req.id);
      this.relay.friendAccepted(req.requesterCharacterId, self.name);
    } else {
      await this.social.deleteById(req.id);
    }
    return this.getSocial(accountId, characterId);
  }

  /** Zruší přátelství (nebo odvolá odeslanou žádost). */
  async removeFriend(
    accountId: string,
    characterId: string,
    otherCharacterId: string,
  ): Promise<SocialView> {
    await this.own(accountId, characterId);
    await this.social.deleteBetween(characterId, otherCharacterId);
    return this.getSocial(accountId, characterId);
  }
}
