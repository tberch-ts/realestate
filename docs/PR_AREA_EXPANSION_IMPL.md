# PR: Multi-MSA expansion — Phase A implementation

> **Branch plan:** `feat/area-expansion-impl` off `docs/area-expansion-plan`.
> Pair with the Phase-A planning doc already on that branch
> ([`AREA_EXPANSION.md`](./AREA_EXPANSION.md)) — this PR lights up the
> code behind the plan.

## Summary

Turns on 5 new MSAs for property-lookup (Phoenix, Nashville, Charlotte,
Tampa, Raleigh) and a 6th (Austin) as a structured `not_available`
placeholder. Adds a markets registry + dispatcher pattern so every
future MSA is one config entry + one provider file. Wires Florida
Sunbiz as the first non-Colorado SoS scraper.

After this change:

- An address in any of the 6 new metros resolves through
  `/api/property` and returns a real assessor record (except Austin,
  which falls back to ATTOM/RentCast).
- The frontend can `GET /api/markets` to discover supported markets
  and which features are live per market.
- `GET /api/sos/entity?state=FL&name=…` hits Sunbiz.
- TypeScript enforces that every dispatcher handles every market key
  (exhaustive switch).

## Files

**New (11)**

```
apps/api/src/config/markets.ts                       # MSA registry + routing
apps/api/src/providers/assessorDispatcher.ts         # Routes geocode → per-MSA assessor
apps/api/src/providers/sosDispatcher.ts              # Routes state → per-state SoS
apps/api/src/providers/phoenixAssessor.ts            # Maricopa County (AZ)
apps/api/src/providers/austinAssessor.ts             # Travis County stub (not_available)
apps/api/src/providers/nashvilleAssessor.ts          # Davidson County (TN)
apps/api/src/providers/charlotteAssessor.ts          # Mecklenburg County (NC)
apps/api/src/providers/tampaAssessor.ts              # Hillsborough County (FL)
apps/api/src/providers/raleighAssessor.ts            # Wake County (NC)
apps/api/src/providers/floridaSos.ts                 # Sunbiz scraper
docs/data-sources-by-msa.md                          # Per-MSA endpoint catalog
```

**Modified (4)**

```
packages/shared/src/index.ts      # Extend AssessorRecord.source union + MarketKey/MarketConfig types
apps/api/src/providers/index.ts   # Snapshot builder now uses fetchAssessor dispatcher
apps/api/src/routes/markets.ts    # Add GET / listing every market with support flags
apps/api/src/routes/sos.ts        # Accept ?state=CO|FL|...
```

## Design notes

**Markets registry as single source of truth.** `MARKETS` in
`apps/api/src/config/markets.ts` is the only place new MSAs get
registered. The assessor + SoS dispatchers both route off it.
`MarketConfig.*Supported` flags honestly reflect today's fidelity so
the frontend can gray out gated tabs instead of failing at runtime.

**Exhaustive switch pattern.** Both dispatchers end with

```ts
const _exhaustive: never = market.key;
void _exhaustive;
```

so adding a `MarketKey` without a matching case is a TypeScript error,
not a runtime 500.

**`ProviderResult<T>` envelope preserved.** Every new provider returns
`{ provider, status: 'ok' | 'not_available' | 'needs_credentials' |
'error', … }` — identical to the Denver pattern. No new result shapes.

**Austin is deliberately `not_available`, not missing.** TCAD has no
free public REST. Returning structured `not_available` with a message
that points at the portal keeps the snapshot builder working (ATTOM +
RentCast fill the gap) and makes the gap visible in the UI.

## Per-MSA status

| MSA | Assessor | SoS | Source |
|---|---|---|---|
| Denver | ✅ existing | ✅ existing | `denver_residential` / `denver_commercial` |
| Phoenix | ✅ new | 🚧 AZCC stub | `maricopa` |
| Austin | 🚧 TCAD stub | 🚧 SOSDirect stub (paid) | — |
| Nashville | ✅ new | 🚧 TN stub | `davidson_tn` |
| Charlotte | ✅ new | 🚧 NC stub | `mecklenburg_nc` |
| Tampa | ✅ new | ✅ Sunbiz | `hillsborough_fl` |
| Raleigh | ✅ new | 🚧 NC stub | `wake_nc` |

`🚧` returns structured `not_available` / `needs_credentials` — not a
runtime error. See [`data-sources-by-msa.md`](./data-sources-by-msa.md)
for endpoints and enablement plans.

## Verification

- `npm -w @mfa/shared run build` — ✅ clean
- `tsc --noEmit` on `apps/api` (with `@mfa/shared` pointed at the
  built `.d.ts`) — ✅ 0 errors
- No live endpoint spot-checks — the dev sandbox can't reach ArcGIS
  hosts. First in-prod pull per provider will tell us if any ArcGIS
  field names drifted. Recovery pattern documented in
  `data-sources-by-msa.md`.

## Deferred (tracked, not in this PR)

- Per-MSA **neighborhoods / follow-up / portfolio** providers (Phase
  B). Each needs ~300 LOC + a polygon layer.
- **Arizona Corporation Commission** scraper (AZ equivalent of
  Sunbiz). Same pattern as `floridaSos.ts` — 1 day of work when we
  need it.
- **TN / NC SoS scrapers.** Both portals are free; scrapers not yet
  implemented.
- **Travis CAD** real data feed. Needs a partner agreement or a paid
  aggregator — punted.

## How to commit (from your machine)

The sandbox can't remove `.git/index.lock` (Windows-owned). From a
PowerShell / git-bash terminal on your machine:

```bash
cd C:\Users\Tom\Documents\GitHub\multifamily-analyzer

# If index.lock is stale (no git process actually running), remove it:
Remove-Item .git\index.lock -ErrorAction SilentlyContinue

# Reset the stale index then start clean on a feature branch off docs/area-expansion-plan:
git checkout docs/area-expansion-plan
git reset --mixed HEAD
git checkout -b feat/area-expansion-impl

# Stage the new + modified files
git add apps/api/src/config/markets.ts \
        apps/api/src/providers/assessorDispatcher.ts \
        apps/api/src/providers/sosDispatcher.ts \
        apps/api/src/providers/phoenixAssessor.ts \
        apps/api/src/providers/austinAssessor.ts \
        apps/api/src/providers/nashvilleAssessor.ts \
        apps/api/src/providers/charlotteAssessor.ts \
        apps/api/src/providers/tampaAssessor.ts \
        apps/api/src/providers/raleighAssessor.ts \
        apps/api/src/providers/floridaSos.ts \
        apps/api/src/providers/index.ts \
        apps/api/src/routes/markets.ts \
        apps/api/src/routes/sos.ts \
        packages/shared/src/index.ts \
        docs/data-sources-by-msa.md \
        docs/PR_AREA_EXPANSION_IMPL.md

# (Intentionally leaving out apps/api/tsconfig.build.json — it's a
#  temporary typecheck-override scaffold from the verification pass.
#  Delete it: Remove-Item apps\api\tsconfig.build.json)

git commit -m "feat(multi-msa): add 6 MSAs behind markets registry + dispatchers

- Markets registry (apps/api/src/config/markets.ts) with per-MSA
  capability flags
- Assessor providers: Phoenix/Maricopa, Nashville/Davidson,
  Charlotte/Mecklenburg, Tampa/Hillsborough, Raleigh/Wake
- Austin/Travis CAD returns structured not_available (no public REST)
- Florida Sunbiz SoS scraper
- Dispatcher pattern with exhaustive-switch TypeScript enforcement
- Per-MSA data-source catalog (docs/data-sources-by-msa.md)

Closes Phase A of docs/AREA_EXPANSION.md."

git push -u origin feat/area-expansion-impl
```

Then open a PR from `feat/area-expansion-impl` → `main`.
