# Geographic Expansion — From Denver to Multi-MSA

> **Status (April 2026):** Denver is the only fully-supported market. This
> document defines what "supported" means, audits where Denver is hard-
> coded across the stack, and breaks the multi-MSA build into shippable
> phases so we can light up Phoenix, Austin, Nashville, Charlotte, Tampa,
> and Raleigh against our buy box without a year-long rewrite.

---

## What "supported" means for a market

A market is **supported** when, given an address inside it, the platform
can deliver every feature in the dealmaker loop:

| Feature | Provider needed | Per-MSA work? |
|---|---|---|
| Geocoding | Google Geocoding | No — national |
| Property assessor record | County / city open-data ArcGIS | **Yes — per county** |
| Census demographics | Census ACS | No — national, by tract |
| HUD FMR rents | HUD | No — national, by metro |
| Crime rate | FBI UCR | No — national, by jurisdiction |
| Landlord-friendliness | Internal scoring | No — keyed by state |
| BLS employment | BLS LAUS | No — national, by MSA code |
| Submarket / hot zones | County / city neighborhoods polygons | **Yes — per city** |
| Owner follow-up (long-held, out-of-state) | County assessor + ownership patterns | **Yes — per county** |
| Owner portfolio rollup | County assessor (group by owner) | **Yes — per county** |
| Secretary of State LLC lookup | Per-state SoS API | **Yes — per state** |
| SEC Form D filings | EDGAR | No — national |
| LOI / wizard / PDF / mail | Internal | No — works anywhere |

Three things are per-MSA: **assessor**, **submarket polygons**,
**ownership rollups**. One thing is per-state: **SoS lookup**. Everything
else is national or already keyed by FIPS / metro code.

---

## Buy-box markets we want to light up next

Pulled from the saved buy box (growing, landlord-friendly, A/B class,
100+ unit, 1990+, $30–100M deals). Ranked by population growth × LTV-
appetite × landlord-friendliness:

| MSA | County(ies) | State | Priority | Why |
|---|---|---|---|---|
| Denver | Denver County | CO | ✅ done | Home market |
| Phoenix | Maricopa County | AZ | 1 | Friendliest law in West, 100k+ units in pipeline |
| Austin | Travis County | TX | 2 | TX no-state-tax, agency-friendly, but supply heavy |
| Nashville | Davidson County | TN | 3 | TN landlord-friendly, music-economy halo |
| Charlotte | Mecklenburg County | NC | 4 | Top SE growth corridor |
| Tampa | Hillsborough County | FL | 5 | FL landlord-friendly, insurance pricing risk |
| Raleigh | Wake County | NC | 6 | RTP tech corridor |

Mock-data hooks already exist for Phoenix, Austin, Nashville (see
`apps/web/src/mfa/lib/mockBackend.ts` — sample property snapshots
labeled with these MSAs). They drive the demo experience but aren't
wired to live providers.

---

## Audit: where Denver is hard-coded today

### Backend (`apps/api/src/`)

**Provider modules — each will need a sibling per MSA:**

```
providers/denverAssessor.ts        → maricopaAssessor.ts, travisAssessor.ts, …
providers/denverFollowup.ts        → per-county ownership pattern detector
providers/denverNeighborhoods.ts   → per-city neighborhood polygons + scoring
providers/denverPortfolio.ts       → per-county portfolio rollup
providers/coloradoSos.ts           → arizonaSos.ts, texasSos.ts, …
```

**Routes — namespaced as `/denver`, will become `/:msa`:**

```
routes/hotspots.ts     GET /api/hotspots/denver, /api/hotspots/denver/ranked
routes/followup.ts     GET /api/followup/denver
routes/portfolio.ts    GET /api/portfolio/denver/owners, /denver/owner
```

**Warmup hooks (`index.ts`):**

```ts
warmDenverHotspots();  warmDenverPortfolio();
```

These pre-fetch Denver data on boot. Replacement: `warmHotspots(msaList)`
that takes the configured market set.

### Frontend (`apps/web/src/mfa/`)

**Hard-coded constants:**

```
pages/Hotspots.tsx        DENVER_CENTER = { lat: 39.7392, lng: -104.9903 }
pages/Hotspots.tsx        fetchHotspotsRanked() / fetchHotspotsGeoJson() — Denver-only API
pages/Followup.tsx        fetchFollowup(zone) where zone is a Denver neighborhood name
pages/Home.tsx            "Denver" labels + Denver hot-zones strip
pages/Portfolio.tsx       "Denver ownership clusters" header
lib/mockBackend.ts        MOCK_RANKED_ZONES — 10 Denver neighborhoods
```

**Property page is already MSA-agnostic** — it geocodes the address and
calls each provider; works for any address that returns a CO/AZ/TX/etc.
state code. The assessor provider just returns `not_available` for
unsupported counties (not an error, a graceful skip).

---

## Phase plan

### Phase A — MSA configuration foundation (no new markets yet)

Goal: stop hard-coding Denver. Replace with a config-driven list.
Doesn't add capability — pre-work for B and C.

1. New shared module `packages/shared/src/markets.ts`:
   ```ts
   export interface Market {
     id: string;              // 'denver' | 'phoenix' | ...
     msaName: string;         // 'Denver-Aurora-Lakewood, CO'
     stateCode: string;
     counties: string[];      // FIPS codes
     center: { lat: number; lng: number };  // map default
     assessor: { provider: 'denver_arcgis' | 'maricopa_arcgis' | ... };
   }
   export const MARKETS: Market[] = [/* denver only initially */];
   ```
2. Backend reads `MARKETS` and dispatches assessor / followup / hotspots
   queries to the matching provider based on the geocode's stateCode +
   county. Fallback for unsupported = `not_available` with a friendly
   "Coming soon — request this market" message.
3. Frontend swaps `DENVER_CENTER` for `marketByCenter(market.id).center`
   and uses a global `useActiveMarket()` hook. Defaults to Denver if
   the address isn't in a supported market.
4. Routes generalize:
   `/api/hotspots/:msa/ranked`, `/api/followup/:msa`,
   `/api/portfolio/:msa/owners`. Old `/denver` paths stay aliased for one
   deploy cycle so nothing breaks during the transition.

**Estimate:** ~2 days. Pure refactor; no new data integrations.

### Phase B — Phoenix (priority 1)

First new MSA. Tests the Phase-A abstraction by running it through one
non-Denver county.

1. **Maricopa County Assessor**: ArcGIS FeatureServer at
   `https://services.maricopa.gov/...` (verify exact URL when we start).
   Schema differs from Denver — separate parcel layer + separate
   ownership attributes. New `maricopaAssessor.ts` provider with the
   field-mapping pattern from `denverAssessor.ts` (see PR #4 for the
   shape).
2. **Phoenix neighborhoods**: City of Phoenix Open Data has
   "village planning areas" (15 villages). Use those as the equivalent of
   Denver's 78 neighborhoods. Or pull MaricopaAssociation of Governments
   submarkets if granular needed.
3. **Phoenix ownership rollup**: Same pattern as `denverPortfolio.ts` —
   group parcels by `OWNER_NAME`, sum units, flag out-of-state mailing.
4. **Arizona SoS**: arizona-corporations.azcc.gov has a public LLC
   search; thinly wrap as `arizonaSos.ts`. Lower priority — only used
   when CRM tries to enrich a contact from an LLC name.
5. **Add to MARKETS config** + warm-up.
6. **Frontend**: nothing changes — once an Arizona address geocodes,
   everything routes through the new providers automatically.

**Estimate:** ~3 days for Maricopa Assessor + neighborhoods +
portfolio. SoS is +1 day. Verify-and-deploy: +1 day.

### Phase C — Austin, Nashville (priorities 2-3)

Same pattern as Phase B, repeated. Each MSA is ~3-4 days of work once
the abstraction is solid:

- **Travis County (Austin)**: TCAD ArcGIS at travis.app.tcad.org — well-
  documented. TX SoS at sos.state.tx.us.
- **Davidson County (Nashville)**: Property Assessor at
  padctn.org/maps; layer naming closer to Denver's old split commercial/
  residential pattern. TN SoS at tnsos.org.

**Estimate:** ~4 days per MSA. Run in parallel if we can pair on it.

### Phase D — Charlotte, Tampa, Raleigh (priorities 4-6)

Same pattern. Each:
- Mecklenburg / Hillsborough / Wake assessor providers
- Each city's neighborhood polygons
- NC / FL / NC SoS wrappers (NC reused for both Charlotte + Raleigh)

**Estimate:** ~3 days per MSA (NC SoS write-once benefits Charlotte +
Raleigh).

### Phase E — Generic county-grade fallback

For any address NOT in a supported MSA, fall back to:

1. ATTOM Data API — paid national property database. Already integrated
   for richer comps; expand usage to be the universal-assessor fallback.
2. RentCast — already integrated; multifamily comps anywhere.
3. National census + HUD + BLS continue working.

User experience: "Generic data only — request full support for this
market" CTA. Captures demand signals so we know which MSA to do next.

**Estimate:** ~2 days. Mostly UX work; ATTOM + RentCast already
return data.

---

## Done so far (the ledger)

What has actually shipped toward expansion as of April 2026:

- ✅ **All non-MSA-specific providers built and abstracted**: Census,
  HUD, BLS, FBI UCR, Google Geocode, EDGAR Form D, ATTOM, RentCast,
  landlord-friendliness scoring. These work for any US address today.
- ✅ **Property snapshot is MSA-agnostic** — assembles whatever providers
  return data; missing per-MSA providers just return `not_available`
  without breaking the page.
- ✅ **Frontend mock backend has Phoenix / Austin / Nashville stubs**
  (`apps/web/src/mfa/lib/mockBackend.ts`) — used in mock mode to
  demonstrate the multi-MSA UX without backend work.
- ✅ **Denver Assessor migration to new ArcGIS layer** (PR #4) — proves
  the per-MSA refresh pattern. The new layer carries a richer schema
  (owner mailing address, COM_/RES_ split) that future MSAs may not have
  → `maricopaAssessor.ts` will need its own field-mapping function.
- ✅ **LOI drafts user-scoped** (PR #5) — unrelated to expansion but
  unblocks multi-tenant deployments.

What has **not** been done:

- ❌ Phase A foundation (config-driven MSA list)
- ❌ Any non-Denver assessor provider
- ❌ Any non-Denver neighborhood polygons
- ❌ Any non-Colorado SoS wrapper
- ❌ Frontend `useActiveMarket()` hook
- ❌ Routes generalized off `/denver`

---

## Open questions (decide before Phase A)

1. **Market discovery UX**: when a user enters a Phoenix address, do we
   silently switch the active market, or prompt "Switch to Phoenix
   view?". I'd argue silent — the address itself tells us the MSA.
2. **Hotspots map default**: currently centers on Denver. If the user has
   a saved deal in Phoenix, should map default to Phoenix? Probably yes —
   `useLastActiveMarket()` with fallback to user's profile.
3. **Per-MSA tier gating**: are some MSAs gated to higher tiers (e.g.
   coastal premium markets locked to Elite)? Default no — but worth
   confirming as a pricing lever.
4. **Soft-launch markets**: ATTOM-only (Phase E) markets show up as
   "supported with limitations" — do we want a separate visual treatment
   so users know it's not a first-class market yet?

---

## Tracking

This document lives in `docs/AREA_EXPANSION.md`. Update the **Done so
far** section as PRs merge so anyone joining the project sees the
current state without spelunking the git log.
