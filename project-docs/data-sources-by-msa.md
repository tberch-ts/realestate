# Free Data Sources by MSA

> Per-MSA catalog of the free (or free-tier) endpoints powering each
> supported market. This is the tactical reference — strategy and phase
> plan live in [`AREA_EXPANSION.md`](./AREA_EXPANSION.md). When you add
> or change a provider, update the matching section here.
>
> **Scope:** assessor, Secretary of State, neighborhoods, follow-up,
> portfolio. National providers (Census, HUD, BLS, FBI UCR, ATTOM,
> RentCast, Google Geocoding, EDGAR) are not repeated per-MSA.
>
> **Conventions**
> - Every endpoint URL matches the constant baked into the matching
>   `apps/api/src/providers/*.ts` file — change one, change both.
> - Status meanings follow `ProviderResult<T>`:
>   `ok` / `needs_credentials` / `needs_credits` / `not_available` / `error`.
> - ArcGIS field names are written exactly as the server returns them
>   (upper/snake case). Assessors rename fields without warning; if a
>   provider suddenly returns null values, re-pull the layer metadata at
>   `<ENDPOINT>?f=json` and reconcile.

---

## Index

| MSA | State | County | Assessor | SoS | Neighborhoods | Follow-up | Portfolio |
|---|---|---|---|---|---|---|---|
| Denver | CO | Denver | ok | ok | ok | ok | ok |
| Phoenix | AZ | Maricopa | ok (⚠ see below) | not_available | **ok** | deferred | deferred |
| Austin | TX | Travis | not_available | needs_credentials | deferred | deferred | deferred |
| Nashville | TN | Davidson | ok (⚠ see below) | not_available | **ok** | deferred | deferred |
| Charlotte | NC | Mecklenburg | ok (⚠ see below) | not_available | **ok** | deferred | deferred |
| Tampa | FL | Hillsborough | ok (⚠ see below) | ok | **ok** | deferred | deferred |
| Raleigh | NC | Wake | ok | not_available | deferred | deferred | deferred |

`deferred` = the per-MSA provider isn't implemented yet but the data
source has been scoped (see each MSA section). Frontend gates those
tabs off the `*Supported` flags in
[`apps/api/src/config/markets.ts`](../apps/api/src/config/markets.ts).

**Neighborhoods update (this round):** Phoenix, Nashville, Charlotte, and
Tampa are now real and live — see "Neighborhoods — verification notes"
below for the boundary sources used and how they were verified. Follow-up
and Portfolio stay `deferred` for those four: while auditing this, the
assessor FeatureServers marked "ok" above for Phoenix/Nashville/Charlotte/
Tampa were re-checked directly (not just re-read from this doc) and found
to have drifted — flagged `⚠` in the table. The per-address point lookup
(`fetchPhoenixAssessor` etc.) may still be silently returning
`not_available` in production; someone should re-verify against a real
address and, if broken, treat this as its own bug independent of the
neighborhoods work in this round. Specifics:

- **Phoenix** (`phoenixAssessor.ts`): `PHOENIX_PARCELS` at
  `services6.arcgis.com/.../Parcels/FeatureServer/0` now 400s
  (`"Invalid URL"`). The live layer as of this writing is
  `https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/0`
  — but its schema is completely different (`OWNER_NAME`, `MAIL_STATE`,
  `PHYSICAL_ADDRESS`, `CONST_YEAR` as a **string**, `PUC` use-code) and,
  critically, **has no unit-count field at all**, so it can't drive a
  100+-unit follow-up/portfolio filter even once repointed.
- **Nashville** (`nashvilleAssessor.ts`): `Cadastral/Parcels_SP/MapServer`
  now returns `Service ... not found` (500). `Cadastral/Parcels/MapServer`
  (no `_SP` suffix) still resolves and may be the fix, but wasn't
  reconciled field-by-field as part of this change.
- **Charlotte** (`charlotteAssessor.ts`): `meckgis.mecklenburgcountync.gov/
  server/rest/services/Parcels_Landmarks/MapServer/1` now 404s.
- **Tampa** (`tampaAssessor.ts`): `maps.hcpafl.org` has been replaced
  entirely by an unrelated React SPA ("HCPA GIS Web Map") — the whole
  `/arcgis/rest/services/...` path is gone, not just the specific layer.
  A new endpoint would need to be re-discovered from scratch.

---

## Neighborhoods — verification notes (this round)

Real, live boundary sources for the Hotspots choropleth, found and
curl-verified (`?f=json` for schema, `/query?...&f=geojson` for a sample)
while building this out. Config lives in
[`apps/api/src/providers/neighborhoodSources.ts`](../apps/api/src/providers/neighborhoodSources.ts);
scoring engine is [`neighborhoods.ts`](../apps/api/src/providers/neighborhoods.ts)
(generalized from the old Denver-only `denverNeighborhoods.ts`).

| Market | Layer | Count | Name field | Endpoint |
|---|---|---|---|---|
| Phoenix | Urban Villages | 15 | `NAME` | `maps.phoenix.gov/pub/rest/services/Public/Villages/MapServer/0` |
| Nashville | Community Planning Areas | 14 | `CommunityName` | `maps.nashville.gov/arcgis/rest/services/Boundaries/Boundaries/MapServer/1` |
| Charlotte | Community Planning Areas | 15 | `Name` | `services.arcgis.com/9Nl857LBlQVyzq54/.../CommunityPlanningArea/FeatureServer/0` |
| Tampa | Neighborhood associations (active only) | 107 | `AssocLabel` | `arcgis.tampagov.net/arcgis/rest/services/OpenData/Boundary/MapServer/5` (`where=NEIGHSTATUS='Active'`) |
| Raleigh | Citizens Advisory Council (CAC) | 18 | `CAC` | `maps.raleighnc.gov/arcgis/rest/services/Boundaries/MapServer/1` — **found, verified live, not yet wired up** (left for a follow-up PR to keep this change scoped to 4 markets) |

Rejected/considered-and-passed-on:

- **Charlotte "Neighborhood Profile Area" (NPA)** layers
  (`services.arcgis.com/.../NPA/FeatureServer` and
  `gis.charlottenc.gov/.../HNS/NPA_HLT`) — real and live, but ~458
  polygons county-wide. The Census tract-resolution step in
  `neighborhoods.ts` deliberately runs one-neighborhood-at-a-time
  (api.census.gov 503s on concurrent hits), so 458 sequential Census
  round-trips would take several minutes per cache warm. Community
  Planning Areas gives the same city-wide coverage at Denver-comparable
  granularity (15 areas) with real names instead of bare NPA numbers.
- **Austin "COA Neighborhood Planning Areas"** — not investigated this
  round since Austin's assessor is still `not_available` (no TCAD API);
  lighting up neighborhoods for a market with no working assessor is
  lower priority than Raleigh, which already has a working assessor.

Every score still comes from the same national Census ACS pull used by
Denver (median household income, population, median gross rent, rent
burden — B19013_001E/B01003_001E/B25064_001E/B25070_010E). Nothing about
the scoring math is per-market; only the polygon source is.

**Caveat inherited from Denver's own setup:** `CENSUS_API_KEY` must be
set for the ACS calls to return data — Census now hard-requires a key
("A valid key must be included with each data API request") rather than
just rate-limiting anonymous requests. Without it, every market's
Hotspots map still renders (boundaries + fallback mid-range scores) but
every neighborhood shows `medianIncome`/`medianRent`/etc. as blank. This
is not new to this change — it already applied to Denver — but is worth
calling out since it's easy to mistake for a bug in the new markets
specifically when smoke-testing without the key configured.

---

## Denver, CO — reference implementation

All subsequent MSAs follow Denver's shape.

### Assessor — `denverAssessor.ts`

| Field | Value |
|---|---|
| Endpoint | Denver Open Data ArcGIS FeatureServer (residential + commercial parcels) |
| Auth | None |
| Rate limit | ESRI FeatureServer default (~1000 req/hour, generous in practice) |
| Query shape | `?where=SITUS_ADDR LIKE '{addr}%'&outFields=*&f=json&resultRecordCount=1` |
| Cache | In-memory per address, 1-hour TTL |
| Source tag | `denver_residential` \| `denver_commercial` |

### Secretary of State — `coloradoSos.ts`

| Field | Value |
|---|---|
| Endpoint | `https://www.sos.state.co.us/biz/BusinessEntityCriteriaExt.do` |
| Auth | Session cookie + hidden `docWorkThruDt` token |
| Rate limit | Unthrottled but scrape-sensitive — we pace at ~1 req/sec |
| Cache | Disk-backed at `.cache/colorado_sos_entities.json`, 30-day TTL |
| Gaps | Entity search is name-based; no owner-reverse-lookup |

### Neighborhoods / Follow-up / Portfolio

All three built on Denver's parcel FeatureServer + Denver Open Data
neighborhood polygon layer. Documented in
[`AREA_EXPANSION.md`](./AREA_EXPANSION.md) section "Denver-specific
patterns to generalize".

---

## Phoenix, AZ (Maricopa County)

### Assessor — `phoenixAssessor.ts` — ✅ live

| Field | Value |
|---|---|
| Endpoint | `https://services6.arcgis.com/btCzjPTmhHGPvKkG/ArcGIS/rest/services/Parcels/FeatureServer/0/query` |
| Auth | None |
| Rate limit | ESRI hosted FeatureServer default |
| State gate | `AZ` (short-circuits otherwise) |
| Query shape | `where=SITUS_ADDRESS LIKE '{addr}%'` |
| Source tag | `maricopa` |

Expected fields (verify with `…/0?f=json` if results look empty):
`APN`, `OWNER_NAME`, `SITUS_ADDRESS`, `YEAR_BUILT`, `TOTAL_BLDG_SQFT`
(or `LIVING_AREA`), `LAND_AREA_SF` (or `LAND_AREA` in acres — code
detects and converts), `PROPERTY_USE_DESC`, `FULL_CASH_VALUE`,
`LOCKED_SALE_PRICE`, `SALE_DATE`.

**Caveats**
- Maricopa has moved this FeatureServer slug twice in the last 24
  months. If the endpoint 404s, search the Maricopa Open GIS portal
  ([mcassessor.maricopa.gov](https://mcassessor.maricopa.gov/)) for the
  current Parcels layer and update the constant.
- Sales fields lag — expect 30-90 day delay on recent transactions.

### Secretary of State — stub (`not_available`)

Arizona business entities live at the **Arizona Corporation
Commission**, not the SoS. Free portal, no public REST, no session
scraper yet built.

| Field | Value |
|---|---|
| Portal | `https://ecorp.azcc.gov/EntitySearch/Index` |
| Cost | Free |
| Plan | Port coloradoSos pattern (HTML scrape + session cookie) into `arizonaSos.ts`. ~1 day of work. |

### Neighborhoods / Follow-up / Portfolio — deferred

- **Neighborhoods:** City of Phoenix Open Data has a "Neighborhood
  Planning Areas" polygon layer; Maricopa County has "Planning Area"
  polygons. Either works as the base. ACS tract scoring is already
  national.
- **Follow-up / portfolio:** Maricopa FeatureServer supports group-by
  `OWNER_NAME`. Same pattern as Denver — one owner → N parcels.
- Deferred because each is ~300 LOC and the buy-box value comes first
  from assessor lookup.

---

## Austin, TX (Travis County)

### Assessor — stub (`not_available`)

TCAD (Travis Central Appraisal District) has **no public REST API**.

| Field | Value |
|---|---|
| Portal | `https://www.traviscad.org/property-search/` |
| Bulk data | Paid; mailto `public-information@tcad.org` |
| UT Austin Data | `dataverse.tdl.org` archives TCAD tax rolls — stale (2-3 year lag) |

**Fallback while deferred:** the snapshot builder routes through
ATTOM + RentCast when the assessor returns `not_available`. Austin
works, the data is just second-hand.

**Plan to light up:**
1. Apply for a TCAD API partner account (no public tier as of 4/2026)
2. *Or* subscribe to a Texas-state-wide CAD data aggregator (Regrid,
   DataTree — paid)
3. *Or* scrape the public portal per parcel (rate-limited, brittle)

### Secretary of State — stub (`needs_credentials`)

Texas SOSDirect charges **$1/search**. This isn't a free data source.
Provider returns `needs_credentials`. If ever wired up, the account +
session handling lives behind a paid-features flag.

| Field | Value |
|---|---|
| Portal | `https://www.sos.state.tx.us/corp/sosda/index.shtml` |
| Cost | $1 per entity search |

---

## Nashville, TN (Davidson County)

### Assessor — `nashvilleAssessor.ts` — ✅ live

| Field | Value |
|---|---|
| Endpoint | `https://maps.nashville.gov/arcgis/rest/services/Cadastral/Parcels_SP/MapServer/0/query` |
| Auth | None |
| Rate limit | MapServer default (tighter than FeatureServer — pace at ~1 req/sec for bulk) |
| State gate | `TN` |
| Source tag | `davidson_tn` |

Expected fields: `APN`, `PROP_ADDR`, `OWNER_NAME`, `LAND_USE_DESC`,
`TOTAL_VALUE`, `BLDG_SQ_FT`, `LOT_SIZE`, `YEAR_BUILT`, `NO_UNITS`,
`SALE_DATE` (epoch ms), `SALE_PRICE`.

**Caveats**
- `SALE_DATE` is ArcGIS-epoch (milliseconds since 1970). The provider
  converts via `new Date(n).toISOString()`.
- Davidson publishes through Metro Nashville GIS; the service root
  occasionally moves between `maps.nashville.gov` and
  `gisservices.nashville.gov`. Check both if the primary 404s.

### Secretary of State — stub (`not_available`)

Free portal, scraper not implemented.

| Field | Value |
|---|---|
| Portal | `https://tnbear.tn.gov/Ecommerce/FilingSearch.aspx` |
| Cost | Free |

---

## Charlotte, NC (Mecklenburg County)

### Assessor — `charlotteAssessor.ts` — ✅ live

| Field | Value |
|---|---|
| Endpoint | `https://meckgis.mecklenburgcountync.gov/server/rest/services/Parcels_Landmarks/MapServer/1/query` |
| Auth | None |
| State gate | `NC` + county `Mecklenburg` (Wake also `NC`) |
| Source tag | `mecklenburg_nc` |

Expected fields: `PID` / `TAXPID`, `OWNER`, `LOCADDR`, `YEARBUILT`,
`BLDG_AREA` (or `HEATEDAREA`), `LAND_AREA`, `NUM_UNITS` (or `UNITS`),
`TOTAL_VALUE`, `SALEDATE` (epoch **or** ISO string — both handled),
`SALEPRICE`.

**Caveats**
- Mecklenburg publishes **two** parcel services: the MapServer path
  above (pulled here) and a separate POLARIS REST at
  `https://polaris3g.mecklenburgcountync.gov/...` which has richer
  attributes but gates some fields behind login. Stick with MapServer
  for the free tier.
- `SALEDATE` inconsistency is deliberate upstream — some records were
  migrated as strings from a legacy system.

---

## Tampa, FL (Hillsborough County)

### Assessor — `tampaAssessor.ts` — ✅ live

| Field | Value |
|---|---|
| Endpoint | `https://maps.hcpafl.org/arcgis/rest/services/HCPA_Public/Parcel_Info/MapServer/0/query` |
| Auth | None |
| State gate | `FL` + county `Hillsborough` |
| Source tag | `hillsborough_fl` |

Schema follows the **Florida DR-501** statewide tax-roll standard,
which means the same field names apply to every FL county we ever add
(Miami-Dade, Orange, Broward, Palm Beach…): `FOLIO`, `JV` (Just
Value), `AV` (Assessed Value), `TV` (Taxable Value), `ACT_YR_BLT`,
`TOT_LVG_AR`, `LND_SQFOOT` (or `LND_ACRES` — convert), `DOR_UC` (use
code), `SALE_PRC1`, `SALE_YR1` + `SALE_MO1` (concat to ISO date with
day=01).

**Caveats**
- We prefer `JV` over `AV` for value display — JV is the uncapped
  market value; AV is after the Save-Our-Homes cap and is artificially
  low for long-held homesteads.
- Hillsborough doesn't expose day-of-sale, only year + month. Day is
  always reported as `01`.

### Secretary of State — `floridaSos.ts` — ✅ live (Sunbiz)

| Field | Value |
|---|---|
| Search URL | `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults` |
| Detail URL | Built from result link on search page |
| Auth | None |
| Cache | Disk at `.cache/florida_sos_entities.json`, 30-day TTL |
| Query shape | `?inquirytype=EntityName&searchNameOrder={NAME_UPPER}` |

Parsed blocks from the detail page: "Detail by Entity Name",
"Document Number", "Date Filed", "Status", "Principal Address",
"Registered Agent Name & Address", "Officer/Director Detail".

**Caveats**
- Sunbiz rate-limits aggressive scraping. We pace at 1 req/sec and
  cache 30 days.
- Entity names must be sent uppercased exactly; Sunbiz matches
  prefix-by-prefix on the `searchNameOrder` param.
- The page layout has been stable since at least 2018 but is still an
  HTML scrape — if it breaks, the `normalizeDate` helper usually
  surfaces it first (MM/DD/YYYY vs M/D/YYYY drift).

---

## Raleigh, NC (Wake County)

### Assessor — `raleighAssessor.ts` — ✅ live

| Field | Value |
|---|---|
| Endpoint | `https://maps.raleighnc.gov/arcgis/rest/services/Parcels/MapServer/0/query` |
| Auth | None |
| State gate | `NC` + county `Wake` |
| Source tag | `wake_nc` |

Expected fields: `REID` / `PIN`, `OWNER`, `SITE_ADDRESS`,
`TOTAL_VALUE_ASSD`, `YEAR_BUILT`, `UNITS`, `HEATED_AREA` (or
`TOTAL_SALES_AREA`), `DEEDED_ACREAGE` (provider converts acres →
sqft), `TOTSALPRICE`, `SALE_DATE` (epoch ms).

**Caveats**
- Wake + Mecklenburg both return `stateCode='NC'`; dispatcher
  disambiguates by county name (or FIPS 37119 vs 37183).
- City of Raleigh publishes the layer; Wake County separately
  publishes a richer `realestatesalesandimprovements` FeatureServer
  that we may layer in later for historical sales.

---

## Neighborhoods / Follow-up / Portfolio — status across new MSAs

**Neighborhoods is done for Phoenix, Nashville, Charlotte, and Tampa** —
see "Neighborhoods — verification notes" above. It turned out to need far
less per-market code than the original ~300 LOC/market estimate below,
because the Census/scoring half is now a single shared engine
(`neighborhoods.ts`) and the per-market half is just a ~10-line config
entry (`neighborhoodSources.ts`) once you've found the boundary layer.

Follow-up and Portfolio remain deferred for every non-Denver market:

- **Follow-up:** assessor group-by-owner query pulling parcels held
  10+ years with out-of-state mailing addresses. The query shape is
  portable — the per-MSA work is field-name mapping and mailing
  address extraction. Blocked on the assessor FeatureServer drift noted
  above (Phoenix/Nashville/Charlotte/Tampa all need their endpoint
  re-verified or re-pointed first — and Phoenix's current schema has no
  unit-count field at all).
- **Portfolio:** reverse index over the assessor — owner → parcels.
  Same group-by pattern and same blocker.

Priority order once assessor coverage is actually re-verified working:
**Phoenix → Tampa → Nashville → Charlotte → Raleigh → Austin**, matching
buy-box pipeline value. Austin waits on a real assessor source; Raleigh
also needs a token for its Parcels service (`Token Required` as of this
writing) in addition to a neighborhoods boundary source (already found,
see above).

---

## Adding a new MSA — checklist

1. Pick county + state, add entry to
   [`apps/api/src/config/markets.ts`](../apps/api/src/config/markets.ts)
   with `*Supported` flags all `false`.
2. Extend the `AssessorRecord['source']` union in
   `packages/shared/src/index.ts` with the new source tag (e.g.
   `"king_wa"`).
3. Pull the county's parcel FeatureServer/MapServer layer metadata
   (`<ENDPOINT>?f=json`) and write down the real field names.
4. Create `apps/api/src/providers/<msa>Assessor.ts` following the
   Phoenix template. Include a state gate + per-MSA county gate.
5. Wire into `assessorDispatcher.ts` with an exhaustive-switch case.
6. Flip `assessorSupported: true` in `markets.ts`.
7. Add a section to this doc with the real endpoint URL, fields,
   caveats, and any schema surprises.
8. For SoS: decide if the state has a free portal (`not_available`
   stub with URL in the message) or a paywall (`needs_credentials`).
   Only build the scraper when the buy-box value justifies the
   ~1-day effort.

---

## Known gaps / verification backlog

- **ArcGIS field-name verification.** All 6 new providers were typed
  against documented conventions (ESRI-common naming, FL DR-501
  statewide standard). Some field names are likely off by one
  underscore. First empty result in prod → re-pull the layer's
  `?f=json` and reconcile.
- **Sales-price lag.** Every county assessor lags current transactions
  by 30-90 days. For live deals layer RentCast/ATTOM on top.
- **Neighborhood polygon layers — resolved for 4 of 6.** Phoenix,
  Nashville, Charlotte, and Tampa are wired and live (see "Neighborhoods
  — verification notes" above; note the actual layers used differ from
  the original candidate list below, which was written before anyone had
  actually curl'd the endpoints). Still open:
  - Austin: `COA Neighborhood Planning Areas` — not investigated (no
    working assessor yet, lower priority)
  - Raleigh: Raleigh Citizens Advisory Council (CAC) — **found and
    verified live** (`maps.raleighnc.gov/arcgis/rest/services/
    Boundaries/MapServer/1`, 18 areas, field `CAC`), just not wired up
    yet in `neighborhoodSources.ts`
- **Austin assessor.** Still no path to a free machine-readable
  Travis CAD feed. Either sign a partner agreement or punt to a
  paid aggregator.
