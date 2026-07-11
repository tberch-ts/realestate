# MultiFamily Analyzer

Off-market multi-family deal analysis. Enter an address → pull public data → underwrite → generate LOI.

Targeting **Denver metro** for v1.

## Stack

- **Web:** React + Vite + TypeScript + Tailwind
- **API:** Node + Express + TypeScript
- **DB:** PostgreSQL
- **Local:** Docker Compose
- **Prod:** Fly.io (api + web) + GitHub Pages (crm) — see [project-docs/DEPLOY_FLY.md](project-docs/DEPLOY_FLY.md), migrating off DigitalOcean ([project-docs/DEPLOY.md](project-docs/DEPLOY.md))

## Getting started

```bash
cp .env.example .env
# fill in GOOGLE_MAPS_API_KEY (required for geocoding)
# ATTOM_API_KEY / RENTCAST_API_KEY are optional — app shows "needs credentials" badges if missing

docker compose up --build
```

- Web: http://localhost:5173
- API: http://localhost:4000/health
- Postgres: localhost:5432 (user `mfa`, pass `mfa`, db `mfa`)

## Data providers

Pluggable. Each returns `{ status, data?, message? }`:

| Provider | Cost | Status in v1 |
|---|---|---|
| Google Maps Geocoding | free tier, key required | implemented |
| Denver Open Data (Assessor) | free | implemented |
| US Census ACS | free | implemented |
| HUD Fair Market Rents | free | implemented |
| ATTOM Data | paid | stub — shows "needs credentials" |
| RentCast | paid | stub — shows "needs credentials" |

Missing a key never crashes the app — the panel shows "Unlock with &lt;provider&gt; API key" instead.

## Layout

```
apps/web           React SPA (Denver deal analyzer)
apps/api           Express API
apps/crm           React SPA (SmartInvestorCRM marketing site + app), builds into docs/ for GitHub Pages
packages/shared    shared TS types
db/migrations      SQL migrations
infra/             deployment configs
docs/              apps/crm's built output — GitHub Pages source, do not hand-edit
project-docs/      project documentation (deploy guides, roadmap, handoff notes)
```

## Roadmap

- **Phase 1** ✓ monorepo + docker-compose + address search end-to-end
- **Phase 2** Denver assessor + Census + HUD providers + property detail page
- **Phase 3** Underwriting calculator + save-deal + deals list
- **Phase 4** LOI PDF generator
- **Phase 5** Paid provider stubs (ATTOM, RentCast)
- **Phase 6** ✓ deploy to DigitalOcean App Platform at `re.talkstud.io` (basic-auth gated)
- **v2** CRM for brokers/investors, partner directory, capital-raise tooling, auth
