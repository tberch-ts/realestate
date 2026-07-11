# Handoff — multifamily-analyzer → TalkStud.io merge

Written 2026-04-18 for the engineer merging this project into TalkStud.io. This is the cold-start primer. You should be productive within ~30 min of reading this end to end.

## TL;DR — live right now

- **App URL:** https://re.talkstud.io (basic auth: `mfa` / `Sunrise-Crane-Altitude-8421`)
- **Default ingress:** https://multifamily-analyzer-fo2fs.ondigitalocean.app (same app)
- **GitHub:** https://github.com/tberch-ts/realestate (branch `main`, auto-deploys)
- **DO App Platform ID:** `181c506b-52e2-43b8-848b-2bd46dca9a15`
- **DO Managed PG cluster ID:** `044f3ed0-8906-4c72-ac59-f3629afe4b79` (standalone, `mfa-postgres`, nyc3, db-s-1vcpu-1gb)
- **Monthly cost:** ~$40 — $5 (api) + $5 (web) + $15 (PG) + $15 (PostGrid ~10 letters) + $0-2 bandwidth

## What this app actually does

Multifamily (5+ unit) off-market deal analyzer focused on **Denver metro**, with:

1. **Address lookup** → aggregated snapshot (assessor, Census, BLS, HUD FMR, FBI crime, landlord-friendliness)
2. **BuyBox scoring** (market + deal-form criteria → A/B/C/D grade)
3. **Underwriting calculator** + saved deals
4. **LOI PDF generator** with autosave drafts
5. **Denver deal-zone heat map** (78 neighborhoods scored + clickable)
6. **Denver portfolio view** (100+ unit buildings, absentee-owner filter, owner clusters)
7. **Follow-up candidate lists** per hot zone
8. **Colorado SOS** entity unmask (for LLC owners)
9. **SEC EDGAR Form D** browser — active sponsors raising capital in any state
10. **CRM** — contacts, interactions, follow-ups, linked to Form D filings + portfolio owners
11. **PostGrid postal mail** — send physical letters from any contact, logged as interactions
12. **Outreach email composer** — mailto + auto-log (no SMTP yet)
13. **Market compare** — 20 metros ranked vs Denver baseline (similarity + investability)

See [../README.md](../README.md) for feature-by-feature walkthrough.

## Architecture

```
┌──────────── DigitalOcean App Platform ─────────────┐
│                                                    │
│  web (nginx)     ──── basic auth at edge           │
│  :80 public      ──── proxies /api/* to api:4000   │
│  routes /*       ──── /healthz unauthed for probes │
│                                                    │
│  api (node 20)   ──── internal only (:4000)        │
│                  ──── basic auth middleware too    │
│                  ──── health check /health unauthed│
│                                                    │
│  db-migrate job  ──── PRE_DEPLOY runs each deploy  │
│                                                    │
└────────────────────────────────────────────────────┘
            │ TLS to sslmode=require
            ▼
    Standalone DO Managed PG (outside spec)
    cluster: mfa-postgres, doadmin owner
```

**Why a standalone PG and not inline App Platform DB?** The inline DB binding user has CONNECT only — no CREATE — so DDL migrations always fail. Documented exhaustively in [ROADMAP.md](ROADMAP.md) and the commit history. Standalone gives us doadmin from day one.

**Dockerfiles**: prod images at [infra/Dockerfile.api.prod](../infra/Dockerfile.api.prod) and [infra/Dockerfile.web.prod](../infra/Dockerfile.web.prod). Dev compose at `docker-compose.yml`, prod mirror at `docker-compose.prod.yml`.

## Code layout

```
apps/
  api/                    Node 20 + Express + TypeScript
    src/
      index.ts            route mount point, basic-auth middleware mounted after /health
      middleware/         basicAuth.ts (timing-safe compare, skips /health)
      db/                 pool.ts, migrate.ts, *Repo.ts (contacts, interactions,
                          follow_ups, contact_links, letters, app_settings, loi_drafts)
      providers/          googleGeocode, denverAssessor, denverNeighborhoods,
                          denverPortfolio, denverFollowup, census, bls, hud,
                          fbiUcr, landlordFriendliness, coloradoSos,
                          edgarFormD, postgridClient, marketCompare, nameMatch,
                          attom(stub), rentcast(stub), index.ts (orchestrator)
      routes/             geocode, property, providers, deals, loi, loiDrafts,
                          hotspots, followup, portfolio, sos, markets, filings,
                          crm, postgrid
      buyBox.ts           A/B/C/D grading for deals
      loi.ts              pdfkit-based LOI generator
      underwriting.ts     cash-on-cash / IRR / NOI math

  web/                    React + Vite + TypeScript + Tailwind
    src/
      main.tsx            router mount
      pages/              Home, Property, Deal, Deals, Loi, Hotspots, Followup,
                          Portfolio, Owner, Filings, Contacts, ContactDetail,
                          Settings
      components/         ProviderPanel, BuyBoxCard, SponsorsInCityPanel
      lib/                api.ts (typed client, hundreds of lines), runtimeEnv.ts,
                          googleMaps.ts
      index.css, vite-env.d.ts

packages/
  shared/                 pure TypeScript types shared between api + web
    src/index.ts          GeocodedAddress, PropertySnapshot, OwnerCluster,
                          LoiDraft, DealInput, UnderwritingInput, etc.

db/
  migrations/             001_init, 002_deals, 003_loi_drafts, 004_crm, 005_postgrid

infra/
  Dockerfile.api          dev (tsx watch)
  Dockerfile.web          dev (vite --host)
  Dockerfile.api.prod     multi-stage, npm ci + build + shared package.json main rewrite
  Dockerfile.web.prod     vite build → nginx:1.27-alpine
  nginx.conf              basic_auth + proxy + SPA fallback + /healthz bypass
  docker-entrypoint-web.sh  runtime: writes /env.js + htpasswd

.do/
  app.yaml                App Spec (secrets intentionally blank in git; real
                          values injected via doctl apps update)

docs/
  DEPLOY.md               one-time stand-up playbook
  ROADMAP.md              deferred work + 20-city analysis
  HANDOFF.md              this file
```

## Database schema (live)

5 migrations, all idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). Runtime + migrator both pin `search_path = app, public` and create an `app` schema because PG 15+ restricts `public`.

```
properties          Address-centered parcel rows (currently only Denver-written)
property_data       Raw provider payload cache, keyed (property_id, provider)

deals               Saved deals with UW output
loi_drafts          In-progress LOI payloads w/ autosave

contacts            Unified person/firm with source tracking (manual/form_d/
                    portfolio/owner/loi) + status + tags
interactions        Timeline entries per contact (call/email/meeting/note/
                    outreach_sent/reply_received)
follow_ups          Tasks with due_date + status (open/done/skipped/snoozed)
contact_properties  Link contact↔property (relation: owner/prospect/broker/...)
contact_filings     Link contact↔SEC filing (relation: issuer/promoter/...)

app_settings        k/v JSONB (postgrid sender address, future app config)
letters             Physical mail history w/ PostGrid letter_id + sender/recipient
                    snapshots + carrier tracking + interaction link
```

## Secrets & env vars (canonical source of truth: DO App Platform)

The app spec on disk (`.do/app.yaml`) leaves all SECRET values blank. The live values live in DO and are rotated via spec update. The *canonical* retrieve/update pattern:

```bash
# Read current spec (with values encrypted as EV[...] for SECRET fields)
doctl apps spec get 181c506b-52e2-43b8-848b-2bd46dca9a15

# Inject / rotate a value — pull, edit, push back (see docs/ROADMAP.md Phase 9f
# for the full Python line-based injection helper; naive sed will misplace the
# env because DO serializes fields alphabetically so `name: api` is at the END
# of each service block, not the start)
```

**api service env (all SECRET unless marked)**:
- `NODE_ENV` = `production`
- `API_PORT` = `4000`
- `DATABASE_URL` — standalone PG, doadmin, sslmode=require
- `GOOGLE_MAPS_API_KEY` — restrict to re.talkstud.io referrer in Google Cloud Console
- `CENSUS_API_KEY` — bumps rate limit (without it, 500/day anonymous)
- `BLS_API_KEY` — bumps 25/day anonymous → 500/day registered
- `FBI_API_KEY` — api.data.gov key, 1000/hr
- `HUD_API_TOKEN` — JWT, long-lived
- `BASIC_AUTH_USER` = `mfa`
- `BASIC_AUTH_PASS` = `Sunrise-Crane-Altitude-8421`
- `POSTGRID_API_KEY` — currently `live_sk_*`, **letters are real** and charge ~$1.50/send

**web service env**:
- `API_URL` = `""` (empty — every call site already prefixes `/api`; non-empty here double-prefixes)
- `GOOGLE_MAPS_API_KEY` — client-side loads Maps JS
- `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` — entrypoint builds htpasswd from these

**db-migrate job env**: `NODE_ENV` + `DATABASE_URL`.

## Routing map (live today)

**SPA routes** (all gated by basic auth):
`/` · `/property?address=...` · `/deal` · `/deals` · `/loi` · `/hotspots?focus=...` · `/followup` · `/portfolio` · `/owner` · `/filings` · `/contacts` · `/contact/:id` · `/settings`

**API routes** (all behind basic auth except `/health`):
```
/health                                         api health probe, unauthed
/api/geocode                                    Google geocode
/api/property?address=                          aggregated snapshot
/api/providers/status                           which providers are ok/needs_credentials
/api/deals/*                                    CRUD + underwrite preview
/api/loi                                        generate LOI PDF
/api/loi/drafts/*                               autosave
/api/hotspots/denver, /denver/ranked            GeoJSON + ranked list
/api/followup/denver                            Denver candidates per zone
/api/portfolio/denver/owners, /owner            clusters + detail
/api/sos/entity?name=                           Colorado SOS scrape
/api/markets/compare[?force=1]                  20-metro ranking
/api/filings/form-d[?state=&keyword=&...]       SEC Form D search
/api/filings/form-d/:accession?cik=             single Form D detail (XML parsed)
/api/crm/contacts + /:id (+ interactions, follow-ups, properties, filings)
/api/crm/contacts/from-form-d                   idempotent bulk import
/api/crm/contacts/:id/match-portfolio           retroactive Denver portfolio link
/api/crm/match-portfolio-all                    batch over firms
/api/postgrid/status, /sender (GET+PUT)         configuration
/api/postgrid/letters/from-contact              POST — creates + mails letter
/api/postgrid/letters?contactId=                list per contact
/api/postgrid/letters/:id/refresh               pull latest status from PostGrid
```

Nginx web service has `/healthz` unauthed (for DO probes).

## Local dev

```bash
cp .env.example .env
# fill GOOGLE_MAPS_API_KEY + VITE_GOOGLE_MAPS_API_KEY (required)
# optional: CENSUS_API_KEY, FBI_API_KEY, HUD_API_TOKEN, BLS_API_KEY
docker compose up --build
```

Web: http://localhost:5173 · API: http://localhost:4000/health · PG on `localhost:5432` (user/db/pass all `mfa`).

Prod-mirror smoke test: `docker compose -f docker-compose.prod.yml up --build` → http://localhost:8080 with basic auth.

## Production operations

| Task | Command |
|---|---|
| Deploy | `git push origin main` (auto, ~1 min w/ cache) |
| Force rebuild | `doctl apps create-deployment 181c506b-...` |
| Watch phase | `doctl apps get-deployment <app-id> <deploy-id> --format Phase,Progress` |
| Read logs | `doctl apps logs <app-id> --type=build\|deploy\|run` |
| Edit secrets | `doctl apps spec get <id> > /tmp/s.yaml; edit; doctl apps update <id> --spec /tmp/s.yaml` |
| DB connect as doadmin | URI in DO console → Databases → mfa-postgres → Connection Details |

## Known gotchas (learned the hard way — documented so you don't)

1. **DO serializes App Spec YAML alphabetically** per field. `name: api` appears at the END of each service block (after `dockerfile_path`, `envs`, `github`, ...). Injecting env vars with a naive `sed "after name: api"` puts them in the next (web) service.
2. **PG 15+ public schema** is owned by `pg_database_owner`. Bound App Platform dev-DB users can't CREATE there. Standalone cluster + `app` schema route avoids this.
3. **`pg-connection-string` v2.7+ upgrades `sslmode=require` to `verify-full`.** Must strip `sslmode` from URL and pass `ssl: { rejectUnauthorized: false }` explicitly for DO PG self-signed cert.
4. **Vite `API_URL` env must be `""` (empty string)** not `"/api"` — every call site prefixes `/api/...` so a non-empty value double-prefixes to `/api/api/...`. Similarly `runtimeEnv.ts` uses `??` not `||` so empty-string doesn't fall through to localhost fallback.
5. **Windows CRLF breaks alpine scripts.** `.gitattributes` pins `*.sh`, `Dockerfile*`, `*.yml`, `*.conf` to LF.
6. **FBI date format is `MM-YYYY`** not `YYYY`. Took a round-trip to figure out from the API's error message.
7. **Denver PD ORI is `CODPD0000`**, not `CO0010100` (that's Aurora). Per-city ORIs live in `apps/api/src/providers/marketCompare.ts METROS` with `oriOverride` for non-standard naming (Las Vegas Metropolitan, Metropolitan Nashville, Charlotte-Mecklenburg).
8. **HUD FMR MSA codes drift** (previous stale: `METRO19740MM0000`, current: `METRO19740M19740`). Re-verify via `GET /hudapi/public/fmr/listMetroAreas?year=YYYY` if HUD returns 404.
9. **`locationCode=CO` on EDGAR's search-index isn't actually honored.** Must filter `biz_states` client-side.
10. **PostGrid `x-api-key` header**, not Bearer. Letter creation takes `pdf` (URL) OR `html` OR `template` — exactly one.

## Merge into TalkStud.io — decision points

Without knowing TalkStud.io's architecture, here are the likely paths and what to weigh:

### Option A — keep this as a separate app, share nothing

Simplest. `re.talkstud.io` stays live with its own basic-auth gate and own PG. TalkStud.io stays its own thing. Just document the relationship.

**When to pick:** If TalkStud.io doesn't need to share users, data, or UI with the analyzer.

### Option B — fold into TalkStud.io monorepo, shared auth

Move `apps/api`, `apps/web`, `packages/shared`, `db/migrations` under TalkStud.io's repo. Drop the basic-auth gate — use TalkStud.io's auth instead.

**When to pick:** If TalkStud.io already has real user auth and the analyzer is "one tab in a bigger app". Requires:
- Replace [apps/api/src/middleware/basicAuth.ts](../apps/api/src/middleware/basicAuth.ts) with TalkStud.io's auth middleware
- Remove htpasswd generation from [infra/docker-entrypoint-web.sh](../infra/docker-entrypoint-web.sh)
- Replace nginx `auth_basic` with TalkStud.io's auth edge
- Migrate the 11 app-owned tables into TalkStud.io's DB (rename `deals` / `contacts` / `interactions` if collisions) — or keep them in a separate schema (we already use `app.*`)

### Option C — keep infra separate, share only the DB

Run the analyzer as its own deployment but connect to TalkStud.io's PG cluster.

**When to pick:** If TalkStud.io already has a dedicated PG and you want the analyzer's CRM tables to live alongside TalkStud.io's user data. Simplest integration for CRM sharing.

### Option D — publish as a TalkStud.io plugin/module

Extract `apps/api/src/providers/*` and `packages/shared` as a reusable library TalkStud.io imports. Analyzer UI becomes an embedded route/iframe in TalkStud.io.

**When to pick:** TalkStud.io is user-extensible and other deals-analysis modules might follow.

### My read

If you're pressed, **Option B is the right north star** but **Option A or C today** while you figure out user auth strategy. The analyzer's value is in its data + CRM logic — both are portable.

## Files worth reading first, in order

1. [README.md](../README.md) — 2 min
2. [docs/DEPLOY.md](DEPLOY.md) — infra + first-deploy playbook
3. [docs/ROADMAP.md](ROADMAP.md) — deferred Phase 9d + research already done
4. [apps/api/src/index.ts](../apps/api/src/index.ts) — route list, entry point
5. [apps/api/src/providers/edgarFormD.ts](../apps/api/src/providers/edgarFormD.ts) — representative integration pattern (search + detail + disk cache + type-safe wrapper)
6. [apps/api/src/routes/crm.ts](../apps/api/src/routes/crm.ts) — the CRM + Form D import flow
7. [apps/web/src/pages/ContactDetail.tsx](../apps/web/src/pages/ContactDetail.tsx) — the most feature-dense UI page
8. [db/migrations/004_crm.sql](../db/migrations/004_crm.sql) — canonical CRM schema

## Still-open items at handoff time

See [ROADMAP.md](ROADMAP.md) for full details.

- [ ] **9d — Geographic expansion** beyond Denver. RentCast ($49/mo) or per-city free. Blocked on product decision + likely a network-probing session for per-city.
- [ ] **LOI "Mail via PostGrid" button** on the LOI page — closes the analyzer→LOI→send loop. ~20 min build.
- [ ] **CRM dedup** — current "ALL PRO CAPITAL LLC" in 3 filings makes 3 contacts (intentional for now since each has a different sourceRef; collapse logic is optional).
- [ ] **Hotspots zoom UX improvements** — zoom level tuning, smooth pan, keyboard nav.
- [ ] **Web bundle > 500kB** — route-based code splitting eventually.
- [ ] **Gmail OAuth + IMAP** — upgrade email outreach from mailto to real send + reply sync.
- [ ] **Property `contacts` lookup** — when a property's owner is already in CRM, surface the contact inline.
- [ ] **Smaller-operator portfolio dataset** — current filter is 100+ units; ALL PRO-scale syndicators fall below the cutoff and don't auto-link.

## Contact

Author of this codebase during the 2026-04-17 through 2026-04-18 build: Claude Opus 4.7 (via Claude Code) with Tom Bercher driving. All commits are signed `Co-Authored-By: Claude Opus 4.7`. Commit history is clean and narratable — `git log --oneline main` walks Phase 1 through Phase 10 in order.
