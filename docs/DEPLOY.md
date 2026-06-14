# Deployment — UGREEN NAS (a jakýkoli Docker host)

Tento návod popisuje nasazení hry na **self-hosted Docker** (cíleno na UGREEN NAS, ale platí obecně). Nepotřebuješ na serveru git ani zdrojový kód — image se stahují z **GHCR** (GitHub Container Registry). Architektura viz [`adr/0004-deployment.md`](adr/0004-deployment.md).

## Jak to funguje (princip)

- CI při každém pushi postaví image **`api`** a **`web`** a nahraje je do GHCR (`ghcr.io/ondreu/unheard-scorified-api`, `…-web`, tag `latest` + `sha-<commit>`).
- Na serveru běží `docker-compose.prod.yml`, který image **jen stahuje** (žádný build).
- **Watchtower** na serveru každých 5 min kouká do GHCR a jakmile je nový `latest`, sám stáhne a restartuje `api`/`web`. (Postgres/Redis/Caddy se automaticky neaktualizují.)
- **Schéma databáze se vytvoří samo** — API při startu spustí Drizzle migrace (`AUTO_MIGRATE`, default zapnuto). Žádný ruční `db:migrate` netřeba.

Na server tak stačí dostat **3 soubory**: `docker-compose.prod.yml`, `Caddyfile`, `.env`.

---

## Krok 0 — Viditelnost GHCR balíčků (jednou)

Po prvním běhu CI vzniknou v GitHubu balíčky. Vyber jednu variantu:

- **Public (doporučeno, nejjednodušší):** GitHub → tvůj profil → **Packages** → `unheard-scorified-api` → **Package settings** → **Change visibility** → _Public_. Totéž pro `…-web`. Server pak nepotřebuje žádné přihlášení.
- **Private:** ponech privátní a na serveru se přihlas (viz [Private packages](#private-packages-volitelné) níže).

---

## Krok 1 — Dostat soubory na NAS (bez gitu)

### Varianta A — SSH (nejrychlejší)

```bash
mkdir -p ~/idlerpg && cd ~/idlerpg
curl -fsSL -o docker-compose.prod.yml https://raw.githubusercontent.com/ondreu/unheard-scorified/main/docker-compose.prod.yml
curl -fsSL -o Caddyfile             https://raw.githubusercontent.com/ondreu/unheard-scorified/main/Caddyfile
curl -fsSL -o .env                  https://raw.githubusercontent.com/ondreu/unheard-scorified/main/.env.example
```

### Varianta B — UGREEN File manager

Stáhni si tři soubory z GitHubu (tlačítko **Raw** → uložit) a nahraj je přes file manager do složky, např. `/volume1/docker/idlerpg/`:

- `docker-compose.prod.yml`
- `Caddyfile`
- `.env` (přejmenuj z `.env.example`)

---

## Krok 2 — Vyplnit `.env`

Otevři `.env` a nastav minimálně:

```dotenv
# Silné náhodné heslo! (např. `openssl rand -base64 32`)
JWT_SECRET=zmen-me-na-nahodny-retezec

# Přístup k webu (viz Krok 3 – sítě & HTTPS)
DOMAIN=:80
HTTP_PORT=80
HTTPS_PORT=443

# Databáze (klidně ponech, data jsou jen lokálně na NASu)
POSTGRES_USER=game
POSTGRES_PASSWORD=zmen-me-taky
POSTGRES_DB=game

# Který image tag běžet (necháš latest; pro rollback viz níže)
IMAGE_TAG=latest
```

> ⚠️ `JWT_SECRET` **musí** být nastaven, jinak se API nespustí (je to záměrná pojistka). Bez něj by tokeny nebyly bezpečné.

---

## Krok 3 — Spustit

### Varianta A — SSH

```bash
cd ~/idlerpg
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps        # stav služeb
docker compose -f docker-compose.prod.yml logs -f api   # log API (uvidíš "Migrace aplikovány")
```

### Varianta B — UGREEN Docker GUI

1. Otevři appku **Docker** → sekci **Projekt** (Compose / Stacks).
2. **Vytvořit projekt** → cesta ke složce `/volume1/docker/idlerpg` (kde leží `docker-compose.prod.yml`), nebo vlož obsah compose ručně.
3. UGREEN načte `.env` ze stejné složky. Zkontroluj proměnné a **Spustit**.
4. Sleduj logy kontejneru `api` — má vypsat `Migrace aplikovány` a `API běží na portu 3000`.

---

## Ověření

- **Web:** otevři `http://<IP-NASu>/` (nebo tvoji doménu). Uvidíš úvodní stránku → Registrace → vytvoř postavu.
- **API health:** `http://<IP-NASu>/api/health` → JSON se `status:"ok"` a `deps.postgres/redis: up`.

(`/api/*` Caddy směruje na API, vše ostatní na web.)

---

## Sítě & HTTPS (Caddy)

`Caddyfile` používá proměnnou `DOMAIN`:

- **LAN / jen IP (HTTP):** `DOMAIN=:80` → Caddy poslouchá na HTTP, přístup přes `http://<IP-NASu>`. Pro lokální zkoušení ideální. (Push notifikace v M3 budou chtít HTTPS — viz níže.)
- **Vlastní doména (auto-HTTPS):** `DOMAIN=hra.mojedomena.cz` + nasměruj DNS A-záznam na veřejnou IP a **probrojuj porty 80 a 443** na NAS. Caddy si sám vyřídí Let's Encrypt certifikát.

**Konflikt portů:** pokud NAS už používá 80/443 (admin UI), změň v `.env` `HTTP_PORT`/`HTTPS_PORT` (např. `8080`/`8443`) a přistupuj přes `http://<IP>:8080`.

**Data:** Postgres/Redis/Caddy si ukládají data do `./.data/` ve složce projektu (persistentní mezi restarty). Zálohuj tuto složku.

---

## Aktualizace

- **Automaticky:** nic neděláš. Po `git push` → CI postaví nový `latest` → Watchtower ho do ~5 min nasadí a restartuje `api`/`web`.
- **Ručně hned:**
  ```bash
  docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d
  ```
- **Rollback na konkrétní verzi:** v `.env` nastav `IMAGE_TAG=sha-<short>` (najdeš v GHCR / commit historii), pak `up -d`. `sha-` tagy jsou neměnné, takže Watchtower je nebude přepisovat.

---

## Private packages (volitelné)

Jen pokud jsi v Kroku 0 nechal balíčky **private**:

1. Vytvoř GitHub **PAT** (classic) s oprávněním `read:packages`.
2. Na serveru: `docker login ghcr.io -u <github-user>` (heslo = PAT).
3. V `docker-compose.prod.yml` u služby `watchtower` **odkomentuj** řádek s mountem docker configu:
   ```yaml
   - ${HOME}/.docker/config.json:/config.json:ro
   ```
   Watchtower tím získá přístup ke stahování privátních image.

---

## Troubleshooting

| Problém                                | Řešení                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `denied` / `manifest unknown` při pull | Balíčky jsou private → udělej je Public (Krok 0) nebo nastav `docker login` (viz výše).                     |
| API kontejner spadne hned po startu    | Chybí `JWT_SECRET` v `.env`, nebo Postgres ještě nastartoval — `api` čeká na healthcheck DB, dej mu chvíli. |
| `/api/health` hlásí `degraded`         | Postgres/Redis nejede — zkontroluj `docker compose ps` a logy daných služeb.                                |
| Web jede, ale registrace hlásí chybu   | Podívej se na log `api` (`logs -f api`) — typicky DB připojení nebo migrace.                                |
| Port 80/443 obsazený                   | Změň `HTTP_PORT`/`HTTPS_PORT` v `.env`.                                                                     |
| Watchtower neaktualizuje               | Běží jen pro služby s labelem `…watchtower.enable=true` (api, web). Zkontroluj `logs watchtower`.           |

---

## Co se NEdělá automaticky

- Aktualizace Postgres/Redis/Caddy (záměrně — stabilita a data). Měň ručně, když bude potřeba.
- Zálohy DB — zálohuj složku `./.data/postgres`.
