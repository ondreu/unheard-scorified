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

> Přidáno samostatným přírůstkem (stejný `SocialModule`).

Jednoduchý **globální kanál** (`global`). Zprávy se persistují (posledních
`CHAT_HISTORY_LIMIT` = 50 do historie) a rozesílají realtime přes socket.io +
Redis pub/sub adaptér z M7 (multi-instance). Normalizace (`sanitizeChatMessage`:
trim + sjednocení bílých znaků + ořez na `MAX_CHAT_MESSAGE_LENGTH` = 256) je
sdílená čistá funkce v `@game/shared`.

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

`/characters/[id]/social` — přidat přítele dle jména, příchozí žádosti
(accept/decline), seznam přátel (remove), odeslané žádosti (cancel). Odkaz
„Friends" na character page.
