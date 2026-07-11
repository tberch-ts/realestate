# Deploy — DigitalOcean App Platform (superseded)

> **This deployment is being retired.** The app is still online but can no
> longer be updated. See [DEPLOY_FLY.md](DEPLOY_FLY.md) for the current
> Fly.io + GitHub Pages setup. Kept here for reference until DO is fully
> decommissioned.

Target: `re.talkstud.io` · Repo: `tberch-ts/realestate` · Branch: `main`

## Architecture

Two services plus a managed Postgres, defined in [.do/app.yaml](../.do/app.yaml):

- **web** — nginx:1.27-alpine serving the Vite build. Handles basic auth at the edge, proxies `/api/*` to the internal `api` service.
- **api** — Node 20 + Express. No public route; only the web container reaches it on port 4000. Enforces basic auth again as defense-in-depth, with `/health` unauthed for App Platform health checks.
- **mfa-db** — managed Postgres 16 dev tier. `DATABASE_URL` is injected into the api service via `${mfa-db.DATABASE_URL}`.

## First deploy

### 1. Local smoke test (recommended)

```bash
# Start Docker Desktop first, then:
docker compose -f docker-compose.prod.yml up --build
```

Open `http://localhost:8080`. Browser prompts for basic auth — use `mfa` / `Sunrise-Crane-Altitude-8421`.

### 2. Create the App Platform app

```bash
doctl apps create --spec .do/app.yaml
```

Or: DO console → Apps → Create App → from spec → upload `.do/app.yaml`.

First build takes 8–12 min (both Dockerfiles + managed Postgres provisioning + predeploy migration).

### 3. Populate secrets

In the DO console (App → Settings → App-Level Environment Variables), set these `SECRET` values. Copy straight from your local `.env`:

| Key | Value |
|---|---|
| `GOOGLE_MAPS_API_KEY` | from `.env` (restrict to `re.talkstud.io` referrer in Google Cloud Console) |
| `CENSUS_API_KEY` | optional — leave blank for rate-limited free tier |
| `BLS_API_KEY` | optional |
| `FBI_API_KEY` | optional |
| `BASIC_AUTH_USER` | `mfa` |
| `BASIC_AUTH_PASS` | `Sunrise-Crane-Altitude-8421` |

These are set at the app level, so both `api` and `web` pick them up automatically.

### 4. Point DNS

In the App Platform console under Settings → Domains, DO shows the CNAME target (e.g. `<app-name>.ondigitalocean.app`). Create a CNAME record:

```
re.talkstud.io  CNAME  <app-name>.ondigitalocean.app
```

App Platform issues a Let's Encrypt cert automatically once the CNAME resolves. Usually ~2 min.

### 5. Verify

| Check | Expected |
|---|---|
| Hit `https://<app>.ondigitalocean.app` | Browser prompts for basic auth; enter `mfa` / `Sunrise-Crane-Altitude-8421` → homepage loads with hot-zone strip |
| Click a zone name → `/hotspots` | Google Map renders with Denver zones |
| `/portfolio?oos=1` | Absentee-owner table loads |
| `/owner?name=PBH+BREAKERS` → "Unmask owner" | SOS lookup returns data (confirms outbound HTTP works) |
| `/loi?address=...` → edit a field | Autosave succeeds (confirms DB + migration job ran) |
| `doctl apps logs <app-id> --type=run` | `[api] listening on :4000` + warm-cache log lines |
| Push a trivial change to `main` | App Platform auto-rebuilds + rolls over with no downtime |

## Operations

### Rotate basic auth creds

1. Update `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` in App-Level Environment Variables.
2. Redeploy (Settings → Force Rebuild). The nginx entrypoint rewrites `.htpasswd` on container start.

### Cost

| Component | Tier | Monthly |
|---|---|---|
| api service | basic-xs | $5 |
| web service | basic-xs | $5 |
| mfa-db | db-s-dev-database | $15 |
| api-cache disk | 1 GiB | ~$1 |
| Bandwidth | first 100 GB | $0 |
| **Total** | | **~$26** |

### Known caveats

- **Persistent disk (`disk:` block on api)** — if App Platform rejects the field at create time (possible on `basic-xs` depending on current DO policy), delete the whole `disk` block from `.do/app.yaml` and redeploy. The app still runs; the only loss is the Denver warm cache (rebuilt on startup, ~90s of cold latency after each deploy).
- **SSL to managed Postgres** — [apps/api/src/db/pool.ts](../apps/api/src/db/pool.ts) sets `ssl: { rejectUnauthorized: false }` when `NODE_ENV=production` or when `sslmode=require` is in the connection string. DO's managed PG uses a cert outside Node's default trust store; this is the standard DO pattern.
- **Shared package main field** — [packages/shared/package.json](../packages/shared/package.json) ships `main: src/index.ts` (so `npm run dev` + tsx work). The prod Dockerfile rewrites `main` to `dist/index.js` after building, so plain `node` resolves it correctly in production.
