# Deploy — Fly.io (api + web) + GitHub Pages (crm)

Replaces the DigitalOcean setup in [DEPLOY.md](DEPLOY.md) (kept for reference —
that deployment is being retired). Same split used in `tberch-ts/beakon`: a
small always-on backend on Fly.io, plus a free static frontend on GitHub Pages
for anything that's just a marketing page.

## Architecture

- **mfa-api** (Fly, [fly.api.toml](../fly.api.toml)) — the same Express API
  used today, unchanged Dockerfile (`infra/Dockerfile.api.prod`). Public HTTPS
  endpoint (`https://mfa-api.fly.dev`) for direct browser calls from
  GitHub-Pages-hosted `apps/crm`, plus Fly's private `mfa-api.internal:4000`
  address for `mfa-web`'s nginx proxy.
- **mfa-web** (Fly, [fly.web.toml](../fly.web.toml)) — the Denver deal analyzer
  (`apps/web`), same nginx image (`infra/Dockerfile.web.prod`), same basic-auth
  gate. `infra/nginx.conf` now proxies `/api/*` to `mfa-api.internal:4000`
  (Fly's private 6PN networking) instead of DO's internal `api:4000` — the only
  code change needed to port this piece over.
- **mfa-postgres** (Fly Postgres) — replaces the DO managed cluster.
- **apps/crm** (GitHub Pages) — the SmartInvestorCRM marketing site, built with
  Vite and committed into [`../docs/`](../docs) at the repo root for Pages to
  serve directly, no CI build step. Calls `mfa-api` cross-origin (CORS), not
  proxied. **Important:** `docs/` at the repo root is now reserved exclusively
  for this built output (Vite's `emptyOutDir: true` wipes it on every build) —
  that's why this documentation set lives in `project-docs/` instead of the
  `docs/` folder it used to be in.

## First deploy

### 0. Install & auth the Fly CLI (one-time, per machine)

```bash
curl -L https://fly.io/install.sh | sh   # or: iwr https://fly.io/install.ps1 -useb | iex   on Windows
fly auth login
```

### 1. Provision & deploy the API

```bash
fly launch -c fly.api.toml --no-deploy --copy-config   # registers the app, keeps fly.api.toml as-is
fly postgres create --name mfa-postgres --region ord
fly postgres attach --app mfa-api mfa-postgres          # injects DATABASE_URL secret automatically
fly secrets set --app mfa-api \
  GOOGLE_MAPS_API_KEY="..." CENSUS_API_KEY="..." BLS_API_KEY="..." \
  FBI_API_KEY="..." HUD_API_TOKEN="..." \
  BASIC_AUTH_USER="mfa" BASIC_AUTH_PASS="..." \
  AUTH_MODE="both" \
  CORS_ALLOWED_ORIGINS="https://mfa-web.fly.dev,https://re.talkstud.io,https://smartinvestorcrm.com,https://<github-username>.github.io" \
  POSTGRID_API_KEY="live_sk_..." POSTGRID_API_KEY_TEST="test_sk_..." \
  STRIPE_SECRET_KEY="sk_live_..." STRIPE_WEBHOOK_SECRET="whsec_..." STRIPE_V2_WEBHOOK_SECRET="whsec_..." \
  STRIPE_PRICE_PRO="price_..." STRIPE_PRICE_TEAM="price_..."
fly deploy -c fly.api.toml
curl https://mfa-api.fly.dev/health   # expect {"ok":true,...}
```

Migrations: `fly ssh console -a mfa-api -C "node apps/api/dist/db/migrate.js"`,
or run `npm run db:migrate` locally against the Fly Postgres connection string
(`fly postgres connect -a mfa-postgres` to get it / open a psql shell).

PostGrid keys come from https://dashboard.postgrid.com/ (Settings > API Keys).
After deploying, set the sender address once (required before any letter can
be created) — either through the web UI Settings page, or directly:
```bash
curl -X PUT https://mfa-api.fly.dev/api/postgrid/sender \
  -H "Content-Type: application/json" \
  -d '{"addressLine1":"...","city":"...","provinceOrState":"...","postalOrZip":"...","companyName":"..."}'
```
Check `curl https://mfa-api.fly.dev/api/postgrid/status` to confirm both live
and test keys are recognized before mailing a real LOI.

### 2. Provision & deploy the web app

```bash
fly launch -c fly.web.toml --no-deploy --copy-config
fly secrets set --app mfa-web BASIC_AUTH_USER="mfa" BASIC_AUTH_PASS="..." GOOGLE_MAPS_API_KEY="..."
fly deploy -c fly.web.toml
```

Requires `mfa-api` to be deployed first and in the **same Fly org**, so
`mfa-api.internal` resolves over 6PN.

### 3. Cut over `re.talkstud.io` DNS

```bash
fly certs add re.talkstud.io --app mfa-web
fly certs show re.talkstud.io --app mfa-web   # prints the exact A/AAAA or CNAME records to add
```
Add those records at your DNS registrar. Once the cert issues (~a few minutes
after DNS propagates), `re.talkstud.io` serves from Fly. Only after confirming
this works end-to-end, decommission the DO app (`doctl apps delete <id>`) and
its managed Postgres cluster.

### 4. Publish `apps/crm` to GitHub Pages

```bash
gh api -X PUT repos/tberch-ts/realestate/pages -f "source[branch]=main" -f "source[path]=/docs"
```
Or manually: repo **Settings → Pages → Source: Deploy from a branch**, branch
`main`, folder `/docs`. Add custom domain `smartinvestorcrm.com` in the same
screen; DNS at the registrar per GitHub's Pages instructions (A records to
GitHub's IPs, or CNAME for a subdomain) — `apps/crm/public/CNAME` pins the
domain and Vite copies it into `docs/CNAME` on every build, so it survives
rebuilds.

Content workflow: `npm -w @mfa/crm run build` from repo root regenerates
`docs/` — commit that alongside any `apps/crm` source change. There is no CI
build step (matches beakon's simplicity); a GitHub Actions workflow to
automate this is a reasonable future upgrade, not done here.

Needs `VITE_GOOGLE_MAPS_API_KEY` (and optionally `VITE_API_URL`) in a repo-root
`.env` for Hotspots/Property Search to work on the built site — Vite's
`envDir` in `apps/crm/vite.config.ts` points at the repo root, same file
`apps/api`/`apps/web` use for local dev. That file's `NODE_ENV=development`
used to leak into this build and ship an unminified dev-mode React bundle
(4x the size) — `apps/crm`'s `build` script now forces
`NODE_ENV=production` via `cross-env` so this can't regress silently.

### 5. Verify

| Check | Expected |
|---|---|
| `curl https://mfa-api.fly.dev/health` | `{"ok":true,...}` |
| Browse `https://mfa-web.fly.dev` (then `re.talkstud.io` post-DNS) | Denver analyzer loads, `/api/*` calls succeed |
| Browse `https://<username>.github.io/realestate/` (then `smartinvestorcrm.com` post-DNS) | Landing renders, icons/pricing show correctly |
| `fly logs -a mfa-api` | `[api] listening on :4000` + warm-cache lines |
| Push a change to `main` | Fly apps redeploy via `fly deploy`; Pages republishes automatically once `docs/` changes land on `main` |

## Cost (rough)

| Component | Notes | Monthly |
|---|---|---|
| mfa-api | shared-cpu-1x, 512mb, always-on | ~$5-7 |
| mfa-web | shared-cpu-1x, 256mb, always-on | ~$3-5 |
| mfa-postgres | Fly Postgres, smallest single-node | ~$0 (free allowance) – $10 depending on size |
| GitHub Pages | static hosting | $0 |
| **Total** | | **~$10-20**, likely cheaper than the ~$26/mo DO setup |

## Known caveats

- **`mfa-web` ↔ `mfa-api` must share a Fly org** for `mfa-api.internal` DNS to
  resolve — if they're ever split across orgs, switch `infra/nginx.conf` back
  to a public URL + CORS instead of the private proxy.
- **SSL to Fly Postgres** — `apps/api/src/db/pool.ts`'s SSL-stripping logic was
  written for DO's self-signed cert; Fly Postgres also requires SSL, so this
  should carry over unchanged, but verify on first connect.
- **`docs/` is a build artifact, not hand-edited** — don't add hand-written
  content there; it gets wiped (`emptyOutDir: true`) on every `apps/crm` build.
  Project documentation lives in `project-docs/` instead.
- **No CI for `apps/crm`** — matches the beakon pattern (simplicity over
  automation). Every content change needs a local rebuild + commit of `docs/`.
