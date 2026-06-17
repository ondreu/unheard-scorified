# ADR 0026 — Chat & Friends overhaul (kanály, guild chat, presence)

Status: Accepted · Datum: 2026-06-17

## Kontext

Sociální vrstva z M9 (ADR 0016/0017) dodala friends, globální chat, whisper a
guildy, ale komunikační UX zaostávalo za zbytkem hry:

- **Jen jeden chat kanál** (`global`). Žádný guild kanál, přestože guildy
  existují od M9.
- **Žádný online stav přátel.** Whisper sice ad-hoc ověřoval doručení (online =
  má socket), ale friends list neukazoval, kdo je online → nešlo poznat, koho má
  smysl whisperovat / pozvat do party.
- **Chat bublina míchala global chat a whispery** do jednoho proudu bez záložek a
  bez konverzací; nepřečtené byly jeden čítač.
- **Stránka `/social`** zůstala ve starém amber stylu (nebyla převedená na design
  system při M9 UI refreshi).

PM zařadil „Overhaul chatovací karty (Friends & chat)" do backlogu a schválil
**plný rozsah** (kanály vč. guild chatu, presence, redesign bubliny i `/social`).

## Rozhodnutí

### Kanály (`@game/shared/social.ts`)

`CHAT_CHANNELS` rozšířeno z `['global']` na `['global', 'guild']`. Whisper
**záměrně NENÍ kanál** — je 1:1, neperzistovaný (online-only přes WS, offline
fallback = Mail), v UI jen samostatná záložka. Přidán helper `isScopedChannel`:
guild je „scoped" (vázaný na guildId), global ne. Další kanály (frakční, party)
lze přidat bez refaktoru — kanál je datový atribut.

### Guild chat (scoped)

`chat_messages` dostalo nullable `scope_id` (migrace `0029`): guildId pro
`guild`, `NULL` pro `global`. Index `(channel, scope_id, created_at)` pro výběr
historie. `ChatService` při guild kanálu ověří členství (`GuildRepository.
membershipOf`) a vrátí guildId jako scope; non-member → `Forbidden`. Realtime
fan-out jde do **room jen dané guildy** (`chat:guild:<guildId>`), ne do globální
room → členové cizích guild guild chat nevidí. REST zůstává autoritativní
fallback (`?channel=guild`).

### Online presence

Nová abstrakce `PresenceStore` (`presence.store.ts`) — **stejný vzor jako
`MatchmakingQueue`**: `RedisPresenceStore` pro produkci (sdílený stav napříč
instancemi, viz multi-instance ADR 0010), `InMemoryPresenceStore` pro testy/běh
bez Redisu.

- **Refcount model:** jedna postava může mít víc socketů (víc záložek, layout +
  bublina + `/social` každý drží vlastní socket). `join`/`leave` inkrementují/
  dekrementují čítač (`presence:char:<id>`); postava je online, dokud je > 0.
  `join`/`leave` vrací, zda došlo k **přechodu** (0→1 / 1→0) → broadcast přátelům
  jen při reálné změně.
- **TTL pojistka** (12 h, obnovovaná při `join`) proti „leaknutým" online stavům
  po pádu instance (clean disconnect dekrementuje, crash ne).
- Gateway zapíná presence na `social:subscribe` (po ověření vlastnictví) a vypíná
  na `disconnect`; přepnutí aktivní postavy na témže socketu korektně opustí
  starou room + presence.
- `GET /characters/:id/social` doplnil `online` flag per přítel (jeden
  `filterOnline` dotaz) a řadí **online přátele první**. Realtime změny letí jako
  `social:presence` do room přátel (best-effort; getSocial je autoritativní).

### Frontend

- **Chat bublina** přepsaná na záložky **Global / Guild / Whispers** (guild jen
  pro člena guildy), nepřečtené **per-záložka** + souhrnný odznak. Whispers =
  seznam konverzací (per postava) s vlastními nepřečtenými a reply oknem; offline
  whisper nabídne Mail. Design system tokeny.
- **`/social`** přepsaná na design system: avatary, **zelená/šedá tečka** online
  stavu (živě překlápěná přes `social:presence`), počet online, whisper tlačítko,
  inspect, remove. Globální chat panel zachován jako „plný" pohled.

## Důsledky

- **+** Guild dostává vlastní komunikační kanál; přátelé jdou poznat online; chat
  je přehledný a v jednotném vizuálu.
- **+** Presence i guild chat jsou multi-instance-ready (Redis), bez per-proces
  stavu (ADR 0003) a testovatelné bez Redisu (in-memory).
- **−** Presence je „best-effort" (TTL pojistka, refcount může teoreticky leaknout
  při tvrdém pádu) — pro „zelenou tečku" plně dostačující, není to herní stav.
- **Follow-up:** guild MOTD/perky (ADR 0017 follow-up), whisper historie napříč
  sezeními (zatím jen v rámci běžícího klienta), případně guild roster s online
  stavem.

## Alternativy

- **Whisper jako persistovaný kanál** — zamítnuto: 1:1 efemérní zprávy patří k
  online-only modelu z M9 (offline = Mail), persistovat je zbytečné.
- **Presence přes DB `last_seen`** — zamítnuto: heartbeat zápisy do Postgresu jsou
  drahé a nepřesné; Redis čítač je levný a přirozeně multi-instance.
- **Sdílení jednoho socketu napříč layoutem/bublinou/`/social`** — odloženo: víc
  socketů je dnešní vzor a refcount presence to zvládá; sjednocení je čistě
  optimalizace (méně spojení).
