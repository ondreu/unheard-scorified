# ADR 0016 — Sociální základ: friends & chat (M9)

- Status: Accepted
- Datum: 2026-06-15
- Kontext milníku: **M9 — Polish, balanc, pixel grafika, sociální**

## Kontext

M9 odemyká odložené části M8.5/M8.6, které potřebují **sociální základ**:

- **M8.5-C** — týmové arény 3v3/5v5 (ruční sestavení týmu).
- **M8.5-B** — raid leader + lobby (ruční formace, pozvánky).
- **M8.5-D** — P2P trade (výměna mezi hráči).

Všechny vyžadují, aby si hráč mohl najít a „uložit" jiné hráče (přátele) a
komunikovat s nimi. Tento ADR pokrývá první vertikální přírůstek M9 social:
**friends + jednoduchý globální chat**. Guild necháváme na později (friends jsou
nutný základ; guild je nadstavba).

## Rozhodnutí

### 1. Friends jsou per-postava (vanilla-WoW styl)

Přátelství spojuje **dvě postavy** (ne účty). Důvody:

- Celá architektura je character-centric (`/characters/:id/...`); arény, raidy,
  dungeony běží na úrovni postavy.
- Budoucí použití (M8.5-C/B) zve do týmu **konkrétní postavu** → friends-as-
  characters je přímý fit.
- Odpovídá vanilla WoW (friends list je per-postava).

Alty napříč účty jsou povolené (nelze přidat jen sám sebe — tutéž postavu).

### 2. Jedna tabulka `friendships` se stavem

```
friendships(id, requester_character_id, addressee_character_id,
            status: 'pending' | 'accepted', created_at, responded_at)
UNIQUE(requester_character_id, addressee_character_id)
```

Klasický single-row model přátelství:

- **`pending`** — `requester` poslal žádost, `addressee` zatím nepotvrdil.
- **`accepted`** — vzájemné přátelství.
- **Odmítnutí = smazání řádku** (žádný `declined` stav → čistý re-request).

Výpis přátel = řádky `accepted`, kde je postava na kterékoli straně; „protistrana"
se odvodí helperem `friendCounterpart` z `@game/shared`. Unique pár brání
duplicitní žádosti stejným směrem; **opačný směr řeší service**: pokud pošlu
žádost někomu, kdo už žádal mě (pending), rovnou se **auto-potvrdí** (mutual).

Limit `MAX_FRIENDS` (100) brání spamu a drží seznamy malé.

### 3. Chat: jednoduchý globální kanál, realtime přes existující WS vrstvu

- Zatím jediný kanál `global` (`ChatChannel` je datový atribut → frakční/guild
  kanály lze přidat bez refaktoru).
- Zprávy se **persistují** (posledních `CHAT_HISTORY_LIMIT` = 50 do historie) a
  **rozesílají realtime** přes socket.io + **Redis pub/sub adaptér z M7**
  (multi-instance fan-out, žádné sticky sessions). Žádná nová realtime infra.
- Normalizace zprávy (`sanitizeChatMessage`: trim + sjednocení bílých znaků +
  ořez na `MAX_CHAT_MESSAGE_LENGTH` = 256) je **čistá, sdílená** funkce v
  `@game/shared` (shodná validace BE i FE).

### 4. Stejné architektonické vzory jako arény/raidy (M7/M8)

- `SocialModule` (NestJS) = controller (tenký) + service (logika) + repository
  (Drizzle). Vše **stateless** (stav v Postgres/Redis, viz ADR 0003).
- Realtime fan-out přes `SocialEventsRelay` (drží socket.io `Server`, nastaví ho
  chat gateway v `afterInit`) → service nezávisí na gateway (**žádný DI cyklus**),
  bez serveru jsou emity no-op (testy/běh bez WS). Stejný vzor jako
  `ArenaEventsRelay`.
- Notifikace přátelství (`social:friend_request`, `social:friend_accepted`) jdou
  do room `char:<characterId>` (sdílená konvence s arénou; eventy jsou
  namespacované, takže nekolidují).

## Důsledky

- **Pozitivní**: friends odemykají M8.5-C/B/D-trade; realtime recykluje M7 vrstvu;
  čisté sdílené helpery testovatelné bez DB; model snadno rozšiřitelný (guild,
  více chat kanálů, online status).
- **Kompromisy**: friends per-postava (ne per-účet) znamená, že hráč s více
  postavami spravuje seznamy zvlášť — záměrné (matchuje WoW i character-centric
  architekturu). Online status zatím netrackujeme (přidá se s presence later).
- **REST je zdroj pravdy**, WS je best-effort vrstva navrch (jako u arén): UI
  funguje i bez socketu (reload).

## Testy

- `@game/shared` unit: `social.test.ts` (friendCounterpart, canBefriend, chat
  sanitizace/validace, kanály).
- API integrační: `social.flow.test.ts` (pglite) — žádost/accept/decline, mutual
  auto-accept, self-friend zákaz, ownership/forbidden, removeFriend.
