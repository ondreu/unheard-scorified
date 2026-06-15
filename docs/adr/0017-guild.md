# ADR 0017 — Guild (M9 social)

- Status: Accepted
- Datum: 2026-06-15
- Kontext milníku: **M9 — Polish, balanc, pixel grafika, sociální**

## Kontext

Navazuje na M9 social základ (friends + chat, ADR 0016). Guild je druhý sociální
stavební kámen a další gatekeeper pro odložené ruční formace:

- **M8.5-B** — raid leader + lobby (pozvánky přes guild).
- **M8.5-C** — týmové arény (parťáci z guildy/friends).

Tento ADR pokrývá **guild základ**: členství, ranky, pozvánky a správa. Guild
chat / banka / perky jsou pozdější nadstavby.

## Rozhodnutí

### 1. Guild je per-postava (jako friends)

Členství spojuje **postavu** s guildou (ne účet) → konzistentní s
character-centric architekturou a s budoucím zváním konkrétních postav do
týmů/raidů. `guild_members.character_id` je **unikátní** → postava je nejvýše v
jedné guildě.

### 2. Tři tabulky, disband = cascade

```
guilds(id, name UNIQUE, leader_character_id, created_at)
guild_members(guild_id, character_id UNIQUE, rank, joined_at)
guild_invites(id, guild_id, character_id, invited_by_character_id, created_at,
              UNIQUE(guild_id, character_id))
```

`leader_character_id` je rychlý odkaz na vůdce (redundantní s `rank='leader'`).
Rozpuštění guildy = smazání řádku `guilds` → cascade smaže členy i pozvánky.

### 3. Ranky a oprávnění (čisté helpery v `@game/shared`)

`member` < `officer` < `leader`. Pravidla jako **čisté, testovatelné funkce**
(shodné BE i FE pro gating UI i autorizaci):

- `canInvite(rank)` — officer+.
- `canManageMember(actor, target)` — officer+ **a striktně vyšší** rank než target
  (officer nesmí na officera/leadera; leader na kohokoli pod sebou). Platí pro
  kick i změnu ranku.
- Změna ranku jen vůdcem a jen `member ↔ officer` (leadera nelze takto měnit).

### 4. Vůdce nikdy nenechá guildu bez vedení

Když **vůdce odejde** a zůstávají členové, vedení se **automaticky předá**
nejvhodnějšímu nástupci (nejvyšší rank, pak nejdříve vstoupivší). Když je vůdce
poslední, guilda se **rozpustí**. Tím nikdy nevznikne guilda bez vůdce a hráč
není „uvězněn" jako vůdce.

### 5. Stejné vzory jako zbytek social modulu

`GuildController` (tenký) → `GuildService` (logika, ownership, autorizace) →
`GuildRepository` (Drizzle). Vše stateless. Realtime pozvánka (`guild:invite`)
přes sdílený `SocialEventsRelay` (best-effort; REST je zdroj pravdy).

## Důsledky

- **Pozitivní**: odemyká M8.5-B/C; oprávnění testovatelná bez DB; model snadno
  rozšiřitelný (guild chat kanál, banka, perky, MOTD).
- **Kompromisy**: per-postava (ne per-účet) — hráč s více postavami je v guildách
  zvlášť (záměrné). Žádná historie/audit log akcí (later). Auto-promote nástupce
  je deterministický, ne volený (jednoduché pro idle hru).

## Testy

- `@game/shared` unit: `guild.test.ts` (ranky, `canManageMember`, `canInvite`,
  validace jména).
- API integrační: `guild.flow.test.ts` (pglite) — create/invite/accept, rank
  gating, kick oprávnění, leave s auto-promote i disband, ownership.
