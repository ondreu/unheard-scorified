# Sociální systém — friends & chat (M9)

> Viz ADR `docs/adr/0016-social-friends-and-chat.md`. Sociální základ M9, který
> odemyká odložené M8.5-C (týmové arény), M8.5-B (raid lobby) a M8.5-D (P2P trade).

## Friends

Přátelství je **per-postava** (vanilla-WoW styl), uložené jako jeden řádek
(`friendships`: requester ↔ addressee + stav `pending`/`accepted`). Odmítnutí
žádosti = smazání řádku. Limit `MAX_FRIENDS` (100).

### Tok

1. **Žádost** — `POST /characters/:id/social/requests` `{ name }`. Server najde
   cílovou postavu podle (globálně unikátního) jména a založí `pending`. Pokud
   protistrana už žádala mě, žádost se **rovnou potvrdí** (mutual → `accepted`).
2. **Odpověď** — `POST /characters/:id/social/requests/:requestId/respond`
   `{ accept }`. Jen addressee žádosti; `accept=true` → `accepted`, `false` →
   smazání.
3. **Zrušení / odvolání** — `DELETE /characters/:id/social/friends/:otherId`.
   Funguje na přátelství i na vlastní odeslanou (pending) žádost.
4. **Přehled** — `GET /characters/:id/social` → `{ friends, incoming, outgoing }`
   (protistrany s jménem, levelem, classou, rasou, frakcí).

### Realtime (best-effort)

Cílová postava dostane přes WS `social:friend_request` (nová žádost) a
`social:friend_accepted` (potvrzení), do room `char:<characterId>`. REST je
autoritativní — UI funguje i bez socketu.

## Chat

> Přidáno samostatným přírůstkem (stejný `SocialModule`). Kanály + guild chat +
> presence viz **ADR 0026** (chat overhaul).

**Kanály** (`CHAT_CHANNELS`): `global` (všichni) a `guild` (jen členové).
Whisper **není kanál** — je 1:1, neperzistovaný (online-only, viz níže).
Zprávy se persistují (posledních `CHAT_HISTORY_LIMIT` = 50 do historie) a
rozesílají realtime přes socket.io + Redis pub/sub adaptér z M7 (multi-instance).
Normalizace (`sanitizeChatMessage`: trim + sjednocení bílých znaků + ořez na
`MAX_CHAT_MESSAGE_LENGTH` = 256) je sdílená čistá funkce v `@game/shared`.

### Guild chat (scoped)

Guild kanál je **vázaný na guildu** (`isScopedChannel('guild') === true`).
`chat_messages.scope_id` = guildId pro `guild`, `NULL` pro `global` (migrace
`0029`). `ChatService` při guild kanálu ověří členství (`GuildRepository.
membershipOf`) — non-member → `Forbidden`. Realtime fan-out jen do room dané
guildy (`SocialEventsRelay.guildChatRoom(guildId)`), takže cizí guildy guild
chat nevidí. Historie i odeslání mají REST fallback (`GET/POST .../chat?channel=guild`).

### Whisper (online-only 1:1)

Soukromá zpráva přes WS (`whisper:send`), doručená **jen pokud je příjemce
online** (`fetchSockets` napříč instancemi přes Redis adaptér). Bez perzistence;
offline doručení řeší **Mail**. Ack vrací `delivered`.

## Presence (online stav)

Online stav postav (otevřená appka = aktivní WS) drží `PresenceStore`
(`presence.store.ts`) — abstrakce `RedisPresenceStore` (produkce, multi-instance)
+ `InMemoryPresenceStore` (testy), stejný vzor jako `MatchmakingQueue`.

- **Refcount** `presence:char:<id>`: `join`/`leave` (na `social:subscribe` /
  disconnect) inkrementují/dekrementují; online = čítač > 0. Vrací přechod
  (0→1 / 1→0) → broadcast přátelům `social:presence` jen při reálné změně.
- TTL pojistka (12 h, obnovovaná při `join`) proti leaknutí po pádu instance.
- `GET .../social` doplňuje `online` per přítel (jeden `filterOnline` dotaz) a
  řadí online první.

## Guild

> Viz ADR `docs/adr/0017-guild.md`. Per-postava členství (jako friends).

Guilda (`guilds`) má jméno (globálně unikátní) a vůdce. Členství (`guild_members`)
je **per-postava unikátní** → postava je nejvýše v jedné guildě. Ranky
`member` / `officer` / `leader` (oprávnění v `@game/shared/guild`).

### Tok

1. **Založení** — `POST /characters/:id/guild` `{ name }`. Zakladatel = `leader`.
2. **Pozvánka** — `POST .../guild/invites` `{ name }` (officer+). Cíl nesmí být
   v guildě. Příchozí pozvánky vidí postava v `GET .../guild` → `invites`.
3. **Odpověď** — `POST .../guild/invites/:inviteId/respond` `{ accept }`. Přijetí
   → členství (`member`), jinak smazání.
4. **Správa** — `DELETE .../guild/members/:target` (kick; officer+ a striktně
   vyšší rank), `POST .../guild/members/:target/rank` `{ rank }` (jen vůdce;
   member ↔ officer).
5. **Odchod** — `POST .../guild/leave`. Odchod vůdce **předá vedení** nejstaršímu
   zbývajícímu členovi (nejvyšší rank, pak nejdříve vstoupivší); poslední člen →
   guilda se rozpustí. `DELETE .../guild` rozpustí guildu (jen vůdce).
6. **MOTD (zpráva dne)** — `POST .../guild/motd` `{ motd }` (officer+,
   `canEditMotd`). Text se očistí (`sanitizeGuildMotd`: trim, sloučení bílých
   znaků, max `GUILD_MOTD_MAX_LENGTH` = 200), prázdný text MOTD zruší. Uloženo
   ve sloupci `guilds.motd` (migrace `0033`), vystaveno v `GuildView.motd`,
   zobrazeno všem členům na guild page.

### Realtime

Pozvaný dostane `guild:invite` do room `char:<characterId>` (přes `social:subscribe`).

## Sdílené helpery (`@game/shared/social.ts`)

- `friendCounterpart(self, requester, addressee)` — protistrana vztahu.
- `canBefriend(self, target)` — zákaz sám sebe.
- `MAX_FRIENDS`, `FRIEND_REQUEST_STATUSES`.
- `CHAT_CHANNELS`, `isChatChannel`, `sanitizeChatMessage`, `isValidChatMessage`,
  `MAX_CHAT_MESSAGE_LENGTH`, `CHAT_HISTORY_LIMIT`.

Guild (`@game/shared/guild.ts`): `GUILD_RANKS`, `rankAtLeast`, `canManageMember`,
`canInvite`, `MAX_GUILD_MEMBERS`, `isValidGuildName`.

## Architektura

`SocialModule` (NestJS): tenký controller → `SocialService` (logika, ownership) →
`SocialRepository` (Drizzle). Realtime přes `SocialEventsRelay` (drží socket.io
server, nastaví chat gateway v `afterInit`; bez serveru no-op) → žádný DI cyklus
service↔gateway. Vše stateless (Postgres/Redis).

## Web

`/characters/[id]/social` (design system) — přidat přítele dle jména, příchozí
žádosti (accept/decline), seznam přátel s **online tečkou** (živě přes
`social:presence`, online první) + whisper/inspect/remove, odeslané žádosti
(cancel), globální chat panel. Odkaz „Friends" na character page.

**Chat bublina** (`ChatBubble.svelte`, perzistentní shell) — záložky
**Global / Guild / Whispers** (guild jen pro člena), nepřečtené per-záložka +
souhrnný odznak; Whispers = seznam konverzací s reply oknem (offline → nabídne
Mail).
