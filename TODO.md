# TODO — Phase 6: Deploy to DigitalOcean App Platform

> **For the next Claude Code session:** The user approved this plan on 2026-04-17 but the previous session was running in the wrong worktree (`presence-react` under `MultiFamily`). Resume execution from **this** directory (`C:\Users\Tom\Documents\GitHub\multifamily-analyzer`). All four open questions are already answered below — **do not re-ask**.

## Locked-in answers (from user, 2026-04-17)

| Question | Answer |
|---|---|
| GitHub repo | `tberch-ts/realestate` (already pushed) |
| Custom domain | `re.talkstud.io` |
| Basic auth creds | Claude picks. **Use:** user `mfa`, pass `Sunrise-Crane-Altitude-8421`. Surface them to the user in the first response, and note they rotate via App Platform env vars. |
| Persistent cache volume | Yes — attach per-component disk to `api` at `/app/apps/api/.cache` (~$1/mo). |

## Decisions locked in

- **Platform:** App Platform (PaaS), not DOKS. No k8s manifests, no DOCR, no `doctl` scripts beyond `apps create`.
- **Source:** GitHub auto-deploy on push to `main`. App Platform builds Dockerfiles directly.
- **Environments:** prod only (no staging).
- **Access control:** Basic auth at the nginx web container; same creds enforced in Express middleware on the API.
- **DB:** App Platform managed Postgres dev tier ($15/mo). `DATABASE_URL` injected via binding `${mfa-db.DATABASE_URL}`.
- **Routing:** one domain. `web` serves `/` and proxies `/api/*` to internal `api:4000`. API has no public route.
- **TLS:** App Platform auto-manages certs (default subdomain + `re.talkstud.io`).

## Architecture

```
GitHub (main) ──auto-deploy──▶  App Platform
                                   │
                                   ├─ web  (Dockerfile: infra/Dockerfile.web.prod)
                                   │   nginx + Vite static + htpasswd
                                   │   route: /*
                                   │   proxy /api → http://api:4000
                                   │
                                   ├─ api  (Dockerfile: infra/Dockerfile.api.prod)
                                   │   node + express, internal only on :4000
                                   │   basic-auth middleware (skips /health)
                                   │   persistent disk at /app/apps/api/.cache
                                   │
                                   └─ mfa-db  (managed Postgres dev tier)
                                       DATABASE_URL binding → api
```

## Files to create

- [ ] `infra/Dockerfile.api.prod` — multi-stage Node 20 alpine, non-root, `node dist/index.js`
- [ ] `infra/Dockerfile.web.prod` — Vite build stage, `nginx:1.27-alpine` runtime
- [ ] `infra/nginx.conf` — auth_basic on `/`, proxy `/api/` → `http://api:4000`, forward `Authorization` header
- [ ] `infra/docker-entrypoint-web.sh` — writes `/usr/share/nginx/html/env.js` + `/etc/nginx/.htpasswd` at container start
- [ ] `apps/web/src/lib/runtimeEnv.ts` — exports `API_URL`, `GOOGLE_MAPS_API_KEY`; reads `window.__ENV__` first, `import.meta.env.VITE_*` fallback
- [ ] `apps/api/src/middleware/basicAuth.ts` — checks `Authorization: Basic`, skips `/health`, compares against `BASIC_AUTH_USER`/`BASIC_AUTH_PASS`
- [ ] `.do/app.yaml` — App Spec (see below)
- [ ] `docker-compose.prod.yml` — local smoke test mirror
- [ ] `project-docs/DEPLOY.md` — first-time setup notes (create app from spec, set secrets, custom domain DNS)

## Files to modify

- [ ] `apps/web/index.html` — add `<script src="/env.js"></script>` before main bundle
- [ ] `apps/web/src/lib/api.ts` — import from `runtimeEnv` instead of `import.meta.env`
- [ ] `apps/web/src/pages/Hotspots.tsx` — same
- [ ] `apps/web/src/pages/Home.tsx` — same
- [ ] `apps/api/src/index.ts` — mount basic-auth middleware
- [ ] `apps/api/src/db/migrate.ts` — verify idempotent (`CREATE TABLE IF NOT EXISTS`)
- [ ] `apps/api/package.json` — confirm `build` + `start` prod scripts
- [ ] `README.md` — deploy section

## `.do/app.yaml` spec (reference — adjust paths/versions to match current repo state)

```yaml
name: multifamily-analyzer
region: nyc

databases:
  - name: mfa-db
    engine: PG
    version: "16"
    size: db-s-dev-database
    num_nodes: 1
    production: false

services:
  - name: api
    dockerfile_path: infra/Dockerfile.api.prod
    source_dir: /
    github:
      repo: tberch-ts/realestate
      branch: main
      deploy_on_push: true
    http_port: 4000
    instance_size_slug: basic-xs
    instance_count: 1
    health_check:
      http_path: /health
      initial_delay_seconds: 15
    disk:
      # persistent cache volume — user opted in
      name: api-cache
      mount_path: /app/apps/api/.cache
      size_gib: 1
    envs:
      - { key: NODE_ENV, value: production, scope: RUN_TIME }
      - { key: DATABASE_URL, value: "${mfa-db.DATABASE_URL}", scope: RUN_TIME }
      - { key: GOOGLE_MAPS_API_KEY, scope: RUN_TIME, type: SECRET }
      - { key: CENSUS_API_KEY, scope: RUN_TIME, type: SECRET }
      - { key: BLS_API_KEY, scope: RUN_TIME, type: SECRET }
      - { key: FBI_API_KEY, scope: RUN_TIME, type: SECRET }
      - { key: BASIC_AUTH_USER, scope: RUN_TIME, type: SECRET }
      - { key: BASIC_AUTH_PASS, scope: RUN_TIME, type: SECRET }

  - name: web
    dockerfile_path: infra/Dockerfile.web.prod
    source_dir: /
    github:
      repo: tberch-ts/realestate
      branch: main
      deploy_on_push: true
    http_port: 80
    instance_size_slug: basic-xs
    instance_count: 1
    routes:
      - path: /
    envs:
      - { key: API_URL, value: "/api", scope: RUN_TIME }
      - { key: GOOGLE_MAPS_API_KEY, scope: RUN_TIME, type: SECRET }
      - { key: BASIC_AUTH_USER, scope: RUN_TIME, type: SECRET }
      - { key: BASIC_AUTH_PASS, scope: RUN_TIME, type: SECRET }

jobs:
  - name: db-migrate
    kind: PRE_DEPLOY
    dockerfile_path: infra/Dockerfile.api.prod
    run_command: node apps/api/dist/db/migrate.js
    envs:
      - { key: DATABASE_URL, value: "${mfa-db.DATABASE_URL}", scope: RUN_TIME }

domains:
  - domain: re.talkstud.io
    type: PRIMARY
```

> **Note on `disk:`** — confirm the exact App Spec syntax against current DO docs; if the key differs, adjust. The semantic intent is a 1 GiB persistent volume mounted at `/app/apps/api/.cache` on the api service.

## Execution order

1. Verify the repo at `C:\Users\Tom\Documents\GitHub\multifamily-analyzer` is on a clean branch and tracking `tberch-ts/realestate`. If not, fix that first.
2. Create prod Dockerfiles + nginx config + web entrypoint.
3. Add runtime env shim (`runtimeEnv.ts`) + update `index.html` + refactor the 3 call sites.
4. Add basic-auth middleware to the API; mount it in `index.ts` ahead of all routes except `/health`.
5. Verify `migrate.ts` is idempotent.
6. Write `.do/app.yaml` with the repo, domain, and disk values above.
7. Write `docker-compose.prod.yml` and run `docker compose -f docker-compose.prod.yml up --build` to smoke-test the prod topology locally.
8. Write `project-docs/DEPLOY.md`.
9. Commit, push to `main`.
10. Tell the user to run `doctl apps create --spec .do/app.yaml` (or click-through the DO console), then populate the SECRET env vars — including the basic-auth creds above — and point `re.talkstud.io` CNAME at the App Platform target.

## Verification (after first deploy)

1. Visit the generated `*.ondigitalocean.app` URL → browser prompts for basic auth → enter `mfa` / `Sunrise-Crane-Altitude-8421` → homepage loads.
2. Hot-zone strip renders; `/hotspots` map loads.
3. `/portfolio?oos=1` shows absentee owners; click PBH BREAKERS → `/owner` → "Unmask owner" pulls SOS data (confirms outbound HTTP from App Platform).
4. Start an LOI at `/loi?address=...` → autosave succeeds (confirms managed DB + basic-auth + migrate job all wired).
5. Push a trivial change to `main` → App Platform auto-rebuilds and rolls over with zero downtime.
6. `doctl apps logs <app-id> --type=run` shows structured API logs.
7. Once `re.talkstud.io` CNAME propagates and App Platform issues the cert, https works on the custom domain.

## Cost (v1 scale)

| Component | Tier | Cost |
|---|---|---|
| api service | basic-xs | $5 |
| web service | basic-xs | $5 |
| mfa-db (managed Postgres) | dev database | $15 |
| api-cache persistent disk | 1 GiB | ~$1 |
| Bandwidth | first 100 GB | $0 |
| **Total** | | **~$26/mo** |

## Deliver-to-user once push lands

```
Deploy spec pushed. To stand up the app:

  doctl apps create --spec .do/app.yaml

Then in the DO console (App → Settings → App-Level Environment Variables),
populate these SECRET values:

  GOOGLE_MAPS_API_KEY   = (from your local .env)
  CENSUS_API_KEY        = (optional)
  BLS_API_KEY           = (optional)
  FBI_API_KEY           = (optional)
  BASIC_AUTH_USER       = mfa
  BASIC_AUTH_PASS       = Sunrise-Crane-Altitude-8421

DNS: point `re.talkstud.io` CNAME at the App Platform target shown
under App → Settings → Domains. App Platform provisions TLS automatically.

First deploy takes 8–12 min. Hit the ondigitalocean.app URL to confirm
before DNS cuts over.
```
