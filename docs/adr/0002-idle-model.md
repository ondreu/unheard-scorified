# ADR 0002 — Idle & real-time model

**Status:** Accepted · **Datum:** 2026-06-14

## Kontext

Hra je idle: hráč je většinou offline, ale aktivity (questy, profese, dungeony) běží v reálném čase. Musí fungovat offline progres, push notifikace a živé MP události (areny, raidy).

## Rozhodnutí

**Server-authoritative hybrid — lazy + tick:**

1. Aktivita = `start_at` + typ + parametry; deterministický průběh.
2. **Lazy dopočet** při čtení/přihlášení → offline progres bez stálé zátěže.
3. **BullMQ scheduled jobs** pro dokončení i bez hráče → odměny + push notifikace.
4. **Tick loop** jen pro živé události (combat dungeon/raid/arena) → WebSocket pub/sub.
5. **Matchmaking** přes Redis fronty; deterministicky simulovaný boj.

Veškerá náhoda přes **seedovaný RNG** (`SeededRng` v `@game/shared`) → reprodukovatelnost a server-side validace (anti-cheat, konzistence FE/BE).

## Důsledky

- Žádný `Math.random()` v herní logice.
- Combat/loot jsou čisté funkce stavu + seedu → snadno testovatelné.
- Klient nikdy není autorita; jen zobrazuje a posílá záměry.
