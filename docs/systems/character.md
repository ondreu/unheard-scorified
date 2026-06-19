# System: Postava (M1)

Stav: implementováno v M1. Zdroj pravdy pro data i vzorce: `packages/shared`.

## Datový model (Postgres / Drizzle — `apps/api/src/db/schema.ts`)

- **accounts**: `id` (uuid), `username` (unique), `email?`, `password_hash`, `created_at`.
- **characters**: `id` (uuid), `account_id` (fk→accounts, cascade), `name` (unique), `race`, `class`, `total_xp` (default 0), `created_at`. _(MR deWoWčení: sloupec `faction` odstraněn — migrace `0038`.)_

Perzistuje se jen minimum (rasa, classa, totalXp). Level a staty se **dopočítávají** deterministicky ze `shared` → žádná denormalizace, konzistence FE/BE.

## Rasy & classy (`packages/shared/src/data/`)

- **8 ras**: Human, Dwarf, Night Elf, Gnome (Aliance) · Orc, Tauren, Troll, Undead (Horda).
- **9 class**: Warrior, Paladin, Hunter, Rogue, Priest, Shaman, Mage, Warlock, Druid.
- **Race-class matice**: vanilla omezení (`RaceDef.allowedClasses`).
- **Frakce**: atribut rasy, zatím jen kosmetická (viz ADR 0003).

## Staty (`packages/shared/src/character.ts`)

- **Primární (5)**: Strength, Agility, Stamina, Intellect, Spirit.
- `baseStatsFor(race, class, level)` = `BASELINE_STAT(15)` + rasové modifikátory + class bonus (+3 primární, +1 stamina) + lineární růst za level.
- **Resource**: zjednodušený `ResourceType` (mana/energy/rage) **scrapnut** (ADR 0034) — jediný resource model = D&D spell sloty (`spell-slots.ts`, MR-4 / ADR 0029).
- `deriveStats()` (D&D, ADR 0032): `health` = literal hit dice (`dndMaxHp`); `casterType` + `spellSlots` (max) per třída+level.
- `buildCharacterSheet(race, class, totalXp)` složí level (z `leveling.ts`) + staty → `CharacterSheet`.

> ⚠️ Hodnoty statů jsou prozatímní; balanc se doladí v M9. Vše je v `shared` → změna na jednom místě.

## API (`apps/api/src/character/`, `src/auth/`)

- `POST /auth/register | login | refresh`, `GET /auth/me` (chráněné).
- `POST /characters`, `GET /characters`, `GET /characters/:id` — chráněné `JwtAuthGuard`, vázané na účet.
- Validace kombinace/jména přes `@game/shared`; unikátní jméno hlídá DB (23505 → 409).

## Testy

- `packages/shared`: unit testy validací a stat vzorců.
- `apps/api`: integrační test celého flow přes **pglite** (in-memory Postgres) — běží v CI bez Dockeru.
