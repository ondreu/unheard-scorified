# ADR 0004 — Deployment & CI/CD (GHCR + Watchtower)

**Status:** Accepted · **Datum:** 2026-06-14

## Kontext

Hra běží na self-hosted Dockeru PM. Dev je řízený AI agenty s častými pushi. Chceme automatický update běžícího nasazení bez příchozího přístupu k serveru.

## Rozhodnutí

**CI → GHCR → Watchtower (server si sám stahuje):**

- **CI** (`.github/workflows/release.yml`): po zelené bráně kvality (build/test/lint/typecheck) postaví image `api` a `web` (existující Dockerfiles) a pushne do **GitHub Container Registry**.
  - Image: `ghcr.io/ondreu/unheard-scorified-api`, `…-web`.
  - Tagy: `latest` + `sha-<short>` (rollback na konkrétní commit).
  - Auth: `GITHUB_TOKEN` (`packages: write`), build cache přes GitHub Actions cache.
- **Produkční běh** (`docker-compose.prod.yml`): služby `api`/`web` táhnou image z GHCR (žádný `build:`), `pull_policy: always`.
- **Watchtower** na serveru periodicky (interval 300 s) kontroluje GHCR a u kontejnerů s labelem `com.centurylinklabs.watchtower.enable=true` (jen `api`, `web`) stáhne nový `:latest` a restartuje. `--cleanup` maže staré image. Postgres/Redis/Caddy se neaktualizují automaticky (data/stabilita).

## Tagovací strategie & větve

- `:latest` se aktualizuje při pushi na `main` a (zatím) na aktivní vývojovou větev `claude/great-albattani-kclq98`.
- Po zavedení `main` jako stabilní větve omezit `:latest` jen na `main` (produkce), vývojové větve nasazovat zvlášť nebo přes `sha-` tagy.

## Private vs public packages

- **Default: private.** Watchtower potřebuje creds → na serveru `docker login ghcr.io` (PAT s `read:packages`) a odkomentovat mount `~/.docker/config.json:/config.json:ro` v `docker-compose.prod.yml`.
- **Public** (jednodušší, bez auth): nastavit viditelnost balíčku na public v GitHub Packages; mount configu pak netřeba.

## Důsledky

- Žádný příchozí přístup k serveru; jen outbound polling GHCR.
- Update = `git push` → CI → GHCR → (do 5 min) Watchtower nasadí.
- Migrace DB se zatím spouští ručně (`pnpm db:migrate`); automatizace migrací je samostatné rozhodnutí (zváží se v M1, až vznikne schéma).
