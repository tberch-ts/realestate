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
| Phoenix | AZ | Maricopa | ok | not_available | ok | deferred | deferred |
| Austin | TX | Travis | ok | needs_credentials | deferred | deferred | deferred |
| Nashville | TN | Davidson | ok | not_available | ok | deferred | deferred |
| Charlotte | NC | Mecklenburg | ok | not_available | ok | deferred | deferred |
| Tampa | FL | Hillsborough | ok | ok | ok | deferred | deferred |
| Raleigh | NC | Wake | ok | not_available | deferred | deferred | deferred |

`deferred` = the per-MSA provider isn't implemented yet but the data
source has been scoped (see each MSA section). Frontend gates those
tabs off the `*Supported` flags in
[`apps/api/src/config/markets.ts`](../apps/api/src/config/markets.ts).

**Neighborhoods update:** Phoenix, Nashville, Charlotte, Tampa, and
Raleigh are all real and live — see "Neighborhoods — verification notes"
below for the boundary sources used and how they were verified. Only
Austin's hotspot map remains unwired.

**Assessor drift — resolved 7/2026.** An earlier pass through this doc
flagged Phoenix/Nashville/Charlotte/Tampa/Raleigh's assessor
FeatureServers as drifted (`⚠`) after finding them 400/404/500/token-gated
on re-check. All five (plus Denver, which had a related bug) have since
been re-verified live and repointed to working endpoints with real
field-by-field schema mapping — see each MSA's section above and the
provider files themselves for specifics. None of the `⚠` caveats below
still apply; kept only as a record of what broke and why, in case an
endpoint drifts again:

- **Denver** (`denverAssessor.ts`): the URL used `/ArcGIS/` instead of
  `/arcgis/` in the path — ArcGIS Online's gateway treats the capitalized
  path as a different, token-gated route and returned a misleading
  `"Token Required"` error instead of a 404, even though the service is
  genuinely public. One-character fix.
- **Phoenix** (`phoenixAssessor.ts`): the old `services6.arcgis.com/
  btCzjPTmhHGPvKkG/.../Parcels/FeatureServer/0` org id no longer resolved
  at all (`"Invalid URL"`). Repointed to Maricopa County GIS's real
  `Parcel_Data_View` FeatureServer (found via the ArcGIS Online Sharing
  REST API), field-mapped, and verified against a real 100+-unit
  apartment sale. No unit-count field exists in this layer, so
  `units` is left `undefined` rather than guessed.
- **Nashville** (`nashvilleAssessor.ts`): `Cadastral/Parcels_SP/MapServer`
  had moved; the real service is `Cadastral/Parcels/MapServer` (no `_SP`
  suffix). Repointed and field-mapped; this layer has no building
  characteristics at all (no year built/units/sqft), only
  parcel/ownership/valuation.
- **Charlotte** (`charlotteAssessor.ts`): `Parcels_Landmarks/MapServer/1`
  was gone; the real service is `TaxParcel_camadata` (a CAMA-joined
  layer with owner, sale, valuation, and building detail in one row).
  Repointed and verified against a real 61-unit complex.
- **Tampa** (`tampaAssessor.ts`): `maps.hcpafl.org` had been replaced
  entirely by an unrelated React SPA ("HCPA GIS Web Map") — the whole
  `/arcgis/rest/services/...` path was gone. Repointed to City of
  Tampa's own GIS (`arcgis.tampagov.net`), which republishes the same
  county tax-roll data. The FL DR-501 statewide field-name assumption
  did **not** hold for this layer — don't copy those field names to
  future FL counties without re-verifying.
- **Raleigh** (`raleighAssessor.ts`): `Parcels/MapServer/0` didn't exist;
  the real service is `Property/Property`. Repointed and verified
  against a real 578-unit downtown parcel.

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
| Raleigh | Citizens Advisory Council (CAC) | 18 | `CAC` | `maps.raleighnc.gov/arcgis/rest/services/Boundaries/MapServer/1` |

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

### Assessor — `phoenixAssessor.ts` — ✅ live (re-verified 2026-07-13)

| Field | Value |
|---|---|
| Endpoint | `https://services.arcgis.com/ykpntM6e3tHvzKRJ/arcgis/rest/services/Parcel_Data_View/FeatureServer/0/query` |
| Auth | None |
| Rate limit | ESRI hosted FeatureServer default |
| State gate | `AZ` (short-circuits otherwise) |
| Query shape | `where=PropertyFullStreetAddress LIKE '{addr}%'` |
| Source tag | `maricopa` |

The previous endpoint (`services6.arcgis.com/btCzjPTmhHGPvKkG/ArcGIS/
rest/services/Parcels/FeatureServer/0`) is **dead** — that org id
(`btCzjPTmhHGPvKkG`) no longer resolves at all, even with the correct
lowercase `arcgis` path segment (`{"error":{"code":400,"message":"Invalid
URL"}}`). This was not the same class of bug as Denver's casing issue;
the org id itself is stale. Replacement found via the ArcGIS Online
Sharing REST API (`sharing/rest/search` scoped to Maricopa's org id
`ykpntM6e3tHvzKRJ`) — item **"Parcel Data"** (owner `MaricopaCountyGIS`,
item id `4c0a493411514600a6f7ffdc67d41e82`), a hosted view over the
Assessor's real parcel table (layer name `ASR_Parcels`).

**Verified live, with a real query** (not just metadata): queried
`PropertyCity='PHOENIX' AND PropertyUseDescription LIKE '%APARTMENT%'`
to find a real 100+ unit complex, then re-queried by
`PropertyFullStreetAddress LIKE '8130 W INDIAN SCHOOL RD%'` and got back
a genuine matching parcel — owner `MCP TIDES ON WEST INDIAN SCHOOL OWNER
LLC`, `PropertyUseDescription` = "APARTMENTS 100+ UNITS 2 STORY", sale
price $37,860,000, sale date 2021-03-01, `FullCashValue` $30,492,500,
`ConstructionYear` 1984.

**Confirmed real field names** (from `…/0?f=json`, cross-checked against
the live query above): `APN`, `OwnerName`, `OwnerAddressLine1/City/
State/ZipCode`, `PropertyFullStreetAddress`, `PropertyCity`,
`PropertyZipCode`, `ConstructionYear`, `LivableArea_SqFt`,
`LotSize_SqFt` (or `LotSize_Acre` — code converts), `PropertyUseCode`,
`PropertyUseDescription`, `FullCashValue` (preferred — uncapped market
value) / `AssessedFullCashValue` (capped, ratio-adjusted), `SalePrice`,
`SaleDate` (epoch ms).

**Caveats**
- **No unit-count field.** This layer has nothing equivalent to
  `TOTAL_UNITS` — `PropertyUseDescription` only carries bucketed text
  ranges ("APARTMENTS 25 - 99 UNITS", "APARTMENTS 100+ UNITS"), not an
  exact count. `AssessorRecord.units` is left `undefined` for Phoenix;
  don't parse the range text, it's not precise enough to trust.
- `LivableArea_SqFt` is frequently `null` for large multifamily/
  commercial parcels (confirmed on the verification record above) — the
  roll tracks those by improvement value instead. Expect `sqft` to be
  missing on most apartment-complex-sized records.
- Sales fields lag — expect 30-90 day delay on recent transactions.
- If this slug moves again, re-run the `sharing/rest/search` query
  (`q=owner:MaricopaCountyGIS AND type:"Feature Service"` against
  `https://www.arcgis.com/sharing/rest/search`) scoped to org id
  `ykpntM6e3tHvzKRJ` and update the constant.

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
  `OwnerName`. Same pattern as Denver — one owner → N parcels.
- Deferred because each is ~300 LOC and the buy-box value comes first
  from assessor lookup.

---

## Austin, TX (Travis County)

### Assessor — `austinAssessor.ts` — ✅ live (re-verified 7/2026)

TCAD (Travis Central Appraisal District) itself still has **no public
REST API** as of this update — `traviscad.org/property-search/` is
still portal-only. What changed: **Travis County's own GIS department
(Transportation & Natural Resources) republishes the TCAD tax-roll
parcel layer for free** via ArcGIS. This was missed in the 4/2026 pass
(we only checked traviscad.org and Travis County's general open-data
hub, not the county's dedicated tax-maps ArcGIS host) and is confirmed
live now.

| Field | Value |
|---|---|
| Endpoint | `https://taxmaps.traviscountytx.gov/arcgis/rest/services/Parcels/MapServer/0/query` |
| Auth | None |
| Rate limit | ArcGIS MapServer default; `maxRecordCount` 2000 |
| Query shape | `?where=situs_num='{num}' AND situs_address LIKE '%{STREET_CORE}%'&outFields=*&f=json&resultRecordCount=1` |
| State gate | `TX` |
| Source tag | `travis` |
| Live check (2026-07-13) | 373,683 parcels total; 354,093 with non-zero `market_value`. `situs_num='1200' AND situs_address LIKE '%CONGRESS%'` → PROP_ID 100851, "SOUTH CONGRESS PARTNERS LLC", `market_value` $4,269,755, `F1year_imprv` 1915, `land_type_desc` "COMMERCIAL IMPROVED". |

**Coverage gaps in this feed (confirmed live, not assumed):**
- `assessed_val` / `appraised_val` are **NULL for every one of the
  373,683 rows** (checked with `returnCountOnly=true`). Only
  `market_value` is populated — the provider uses it as the
  `assessedValue` proxy.
- **No building-characteristics fields** — no living-area/sqft column,
  no unit-count column. This is a cadastral/tax-roll GIS layer, not
  TCAD's internal CAMA database. `units` and `sqft` are always
  `undefined` for Austin records.
- **No sale-price field**, and this isn't a feed gap — **Texas is a
  non-disclosure state**, so sale consideration is never required on a
  recorded deed and TCAD doesn't publish it anywhere public.
  `deed_date` exists in the layer but records any deed change (trust,
  LLC, name-change transfers included), not only arms-length sales, so
  the provider leaves `lastSalePrice`/`lastSaleDate` both `undefined`
  rather than mislabel a deed recording as a sale.
- `situs_street` is unreliable — every sampled row had it hard-set to
  the literal string `"TX"` (a data-quality bug in the published
  layer; the real street name only appears inside the combined
  `situs_address` string, e.g. `"S 1200 CONGRESS AVE   TX 78704"`).
  The provider queries `situs_num` (exact) + `situs_address` (CONTAINS
  on the stripped street-name core) instead of trusting `situs_street`.

**Fallback:** the snapshot builder still routes through ATTOM +
RentCast for sale price, unit count, and square footage, since this
feed can't supply them — Austin now gets a real owner/value/year-built/
lot-size baseline from TCAD instead of relying on ATTOM/RentCast for
everything.

**If a richer source ever appears:** a full CAMA-style feed (with
sqft/units/sale price) would still require either a TCAD API partner
account (no public tier as of this writing) or a paid state-wide CAD
aggregator (Regrid, DataTree). Not pursued since the free parcel feed
above already covers the core fields.

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

### Assessor — `nashvilleAssessor.ts` — ✅ live (re-verified 2026-07-13)

The previously documented `Cadastral/Parcels_SP/MapServer/0` path does not
exist on `maps.nashville.gov` — hitting it returns a real ArcGIS HTTP 500
`{"error":{"code":500,"message":"Service Cadastral/Parcels_SP/MapServer
not found "}}`, i.e. the service/folder moved, not a casing/token-gateway
issue like Denver's bug. Walked the catalog
(`/arcgis/rest/services?f=json` → `Cadastral` folder → `?f=json`) and
found the real, live service:

| Field | Value |
|---|---|
| Endpoint | `https://maps.nashville.gov/arcgis/rest/services/Cadastral/Parcels/MapServer/0/query` |
| Layer | `0` — "Ownership Parcels" |
| Auth | None |
| Rate limit | MapServer default (tighter than FeatureServer — pace at ~1 req/sec for bulk) |
| State gate | `TN` |
| Source tag | `davidson_tn` |

Verified live via curl: `.../Cadastral/Parcels/MapServer/0?f=json` returns
real layer metadata (55 fields), and
`.../query?where=PropAddr LIKE '400 STAR BLVD%'&outFields=*&f=json`
returns a real matching parcel (Graybrook Apartments, 400 Star Blvd —
owner, `TotlAssd`/`TotlAppr` values, `LUDesc`, sale price/date). Confirmed
data, not just metadata.

Real field names (confirmed against live `?f=json` schema + sample
queries): `APN`, `Owner`, `OwnAddr1/2/3`, `OwnCity`, `OwnState`, `OwnZip`,
`PropAddr`, `PropHouse`, `PropStreet`, `PropCity`, `PropState`, `PropZip`,
`LUCode`, `LUDesc` (e.g. `"APARTMENT: LOW RISE (BUILT SINCE 1960)"`),
`LandAppr`, `ImprAppr`, `TotlAppr`, `LandAssd`, `ImprAssd`, `TotlAssd`,
`Acres`, `StatedArea`, `DeededAcreage`, `SalePrice`, `OwnDate` (epoch ms).

**Caveats**
- This layer has **no building-characteristics columns** — no year
  built, no unit count, no building square footage. It's a
  parcel/ownership/valuation (CAMA-adjacent) dataset, not a full
  building record. The provider leaves `yearBuilt`, `units`, and `sqft`
  undefined; only `lotSqft` is populated, derived from `Acres` (× 43,560).
- `OwnDate` is ArcGIS-epoch (milliseconds since 1970). The provider
  converts via `new Date(n).toISOString()`.
- `TotlAssd` is `0` for some parcels (e.g. government/exempt); the
  provider falls back to `TotlAppr` in that case.
- Match on `PropAddr` (full situs address), not `PropStreet` — the
  latter sometimes carries a stray leading space in this dataset
  (e.g. `" BROADWAY"`).
- Davidson publishes through Metro Nashville GIS; the service root
  occasionally moves between `maps.nashville.gov` and
  `gisservices.nashville.gov`. Check both if the primary 404s, and
  re-walk `/arcgis/rest/services?f=json` to find the current path if the
  folder/service name changes again.

### Secretary of State — stub (`not_available`)

Free portal, scraper not implemented.

| Field | Value |
|---|---|
| Portal | `https://tnbear.tn.gov/Ecommerce/FilingSearch.aspx` |
| Cost | Free |

---

## Charlotte, NC (Mecklenburg County)

### Assessor — `charlotteAssessor.ts` — ✅ live (fixed 2026-07-13)

The previously hardcoded endpoint
(`.../server/rest/services/Parcels_Landmarks/MapServer/1/query`) 404'd
with `{"error":{"code":404,"message":"Service not found"}}` — that
service no longer exists on Mecklenburg's self-hosted ArcGIS Server
(this is a plain 404, not the ArcGIS-Online-gateway capitalization bug
seen on Denver). Found the current live service by browsing the
catalog root (`.../server/rest/services?f=json`) and matching against
the real field list via a live `resultRecordCount=1` query — the
`OWNER`/`PID`/`LOCADDR`/`YEARBUILT`/etc. fields the old code guessed
never matched this service's actual (lowercase, differently-named)
schema.

| Field | Value |
|---|---|
| Endpoint | `https://meckgis.mecklenburgcountync.gov/server/rest/services/TaxParcel_camadata/FeatureServer/0/query` |
| Auth | None |
| State gate | `NC` + county `Mecklenburg` (routed via `market.key === 'charlotte'` in `assessorDispatcher.ts`; the file's own state check is a secondary guard) |
| Source tag | `mecklenburg_nc` |

Verified live fields (lowercase, unlike the old guessed schema):
`pid` / `parcelid`, `address` (full situs string, used for the `LIKE`
match), `streetnumber`/`streetname`, `ownrlstnme`/`ownrfrstnme`,
`yearbuilt`, `heatedarea` (sqft, falls back to `finarea`/`totalarea`),
`gisacres`/`legalacres` (lot size in **acres**, converted to sqft ×
43,560 — there is no native lot-sqft field), `resunits`/`comunits`,
`totalvalue`/`totmarkval`, `landuse_description`/`lusecode`,
`saleprice`, `saledate` (epoch ms).

**Caveats**
- This layer has **one row per building**, not one row per parcel. A
  multi-building apartment parcel (verified example: PID `22323141` on
  Atkins Circle Dr, 2004-built, "MULTI FAMILY") returns multiple rows
  with different `resunits`/`heatedarea` per building. The provider
  takes the first match (same best-effort pattern as the other
  per-county providers), so unit/sqft totals on multi-building
  complexes may reflect a single building rather than the parcel
  total.
- Mecklenburg also publishes a POLARIS UI at
  `https://polaris3g.mecklenburgcountync.gov/` (property-record search
  front end) and a separate ownership/value layer
  (`TaxParcel_Camaownershipvalues`) — not used here since
  `TaxParcel_camadata` already carries both ownership and building
  detail in one row.

---

## Tampa, FL (Hillsborough County)

### Assessor — `tampaAssessor.ts` — ✅ live (fixed 2026-07-13, previously dead)

| Field | Value |
|---|---|
| Endpoint | `https://arcgis.tampagov.net/arcgis/rest/services/Parcels/TaxParcel/FeatureServer/0/query` |
| Auth | None (read-only, `capabilities: "Query"`) |
| State gate | `FL` + county `Hillsborough` |
| Source tag | `hillsborough_fl` |

**This was broken and has been fixed.** The old URL
(`maps.hcpafl.org/arcgis/rest/services/HCPA_Public/Parcel_Info/MapServer/0/query`)
was never a real ArcGIS endpoint — `maps.hcpafl.org` is HCPA's own React
SPA web map; any path on that host, including `/arcgis/rest/services/...`,
returns the SPA's `index.html` (HTTP 200, `<!doctype html>...HCPA GIS Web
Map`), not JSON. It looks like this URL was never verified against a live
service. The real free public endpoint is **City of Tampa GIS's
`Parcels/TaxParcel` layer**, whose metadata `description` field states it
carries "Hillsborough County Property Appraiser Data (City & county
Parcels)" — i.e. it's the same county-wide HCPA tax roll, just hosted on
Tampa's ArcGIS Server instead of HCPA's own domain. Verified live via
curl on 2026-07-13: metadata call, a bulk sample query, and an
address-match query using the exact `SITE_ADDR LIKE '<addr>%'` pattern
the code issues all returned real feature rows.

**The FL DR-501 field-name assumption did NOT hold.** The doc previously
claimed the standard DR-501 columns (`FOLIO`, `JV`, `AV`, `TV`,
`ACT_YR_BLT`, `TOT_LVG_AR`, `LND_SQFOOT`/`LND_ACRES`, `DOR_UC`,
`SALE_PRC1`, `SALE_YR1`/`SALE_MO1`) would carry over to every future FL
county. The live Hillsborough/Tampa layer uses its own, differently
named schema instead: `FOLIO` (present, but not zero-padded 12-digit —
values like `"8.0100"`; `STRAP` is the more reliable stable parcel key),
`OWNER`, `JUST` (Just/Market Value), `ASD_VAL` (Assessed Value), `TAX_VAL`
(Taxable Value), `ACT` (Actual Year Built), `EFF` (Remodel Year),
`HEAT_AR` (Living Area sqft), `ACREAGE` (decimal acres — **no direct
land-sqft column exists**, must convert), `DOR_C` (DOR Use Code),
`S_DATE` (Sale Date — **epoch ms**, not year+month columns), `AMT` (Sale
Amount). There is also **no unit-count column at all** (no
`NO_UNITS`/`TOT_UNITS` analog), so `units` is always left undefined for
this provider. **Conclusion: do not assume DR-501 field names for future
FL counties (Miami-Dade, Orange, Broward, Palm Beach…) — verify each
county's live endpoint and schema independently, same as every other
market.**

**Caveats**
- We prefer `JUST` (Just/Market Value) over `ASD_VAL` for value display —
  `JUST` is the uncapped market value; `ASD_VAL` can lag due to
  assessment caps (e.g. Save-Our-Homes for homesteaded residential).
- `ACT`/`EFF`/`HEAT_AR` report `0` (not null) on vacant/unbuilt parcels —
  treated as "no value" rather than a literal year-built-0 or 0 sqft.
- `S_DATE` is an epoch-ms date field (same shape as Denver's
  `SALE_DATE`), not Hillsborough's old assumed year+month columns.
- `AMT` (sale amount) of `0` is the sentinel for "no recorded sale" and
  is filtered out, same handling as Denver's `SALE_PRICE`.

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
| Endpoint | `https://maps.raleighnc.gov/arcgis/rest/services/Property/Property/FeatureServer/0/query` |
| Auth | None |
| State gate | `NC` + county `Wake` |
| Source tag | `wake_nc` |

**2026-07-13 fix:** the previously hardcoded URL
(`.../Parcels/MapServer/0/query`) doesn't exist on this host — that
service/folder combo returns `{"error":{"code":499,"message":"Token
Required"}}`, which looks like an auth failure but is actually ArcGIS
Server's way of saying "no such resource" for this particular
misconfiguration (the host already used lowercase `arcgis` in the
path, so this is a different failure mode than the Denver casing bug).
Browsing the catalog root
(`https://maps.raleighnc.gov/arcgis/rest/services?f=json`) shows no
top-level `Parcels` service; the real parcel layer lives in the
`Property` folder as `Property/Property`, published as both a
MapServer and a FeatureServer. Verified live via curl on 2026-07-13:
`Property/Property/FeatureServer/0?f=json` returns real layer metadata
with no token, and querying layer 0 (`where=SITE_ADDRESS LIKE
'421 FAYETTEVILLE%'`) returns real parcel attributes anonymously
(e.g. a 578-unit downtown Raleigh office/parking parcel with full
ownership + valuation data).

Verified fields (from the live layer-0 schema): `REID` (primary key,
falls back to `PIN_NUM`), `OWNER`, `SITE_ADDRESS`,
`TOTAL_VALUE_ASSD`, `YEAR_BUILT`, `TOTUNITS`, `HEATEDAREA` (sqft),
`DEED_ACRES` (provider converts acres → sqft for `lotSqft`),
`TOTSALPRICE`, `SALE_DATE` (epoch ms), `TYPE_USE_DECODE` /
`PROPDESC` / `LAND_CLASS_DECODE` (property classification, in
preference order).

**Caveats**
- Wake + Mecklenburg both return `stateCode='NC'`; dispatcher
  disambiguates by county name (or FIPS 37183 vs 37119).
- City of Raleigh publishes this layer; Wake County separately
  publishes a richer `realestatesalesandimprovements` FeatureServer
  that we may layer in later for historical sales — that one is
  unverified and was NOT used here.

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
  Same group-by pattern; the per-MSA piece is UI-surface owner-name
  normalization (Maricopa uses `OwnerName`, Mecklenburg uses `ownrlstnme`,
  Wake uses `OWNER`, Hillsborough uses `OWNER`, Davidson uses `Owner`,
  Austin uses `py_owner_name`).

Priority order once portfolio/follow-up land: **Phoenix → Tampa →
Nashville → Charlotte → Raleigh → Austin**, matching buy-box pipeline
value. Every market's assessor is now live (see per-MSA sections
above) and Raleigh's neighborhoods boundary source has also been
found and verified — see "Neighborhood polygon layers" below.
Follow-up/portfolio remain the only deferred pieces across all 6
non-Denver markets.

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
  `?f=json` and reconcile. **Phoenix is no longer in this bucket** — its
  endpoint and schema were re-verified live 2026-07-13 (see the Phoenix
  section above); the old org id had gone dead and was swapped for a
  confirmed-working one with real query results checked field-by-field.
- **Sales-price lag.** Every county assessor lags current transactions
  by 30-90 days. For live deals layer RentCast/ATTOM on top.
- **Neighborhood polygon layers — resolved for 4 of 6, Raleigh added.**
  Phoenix, Nashville, Charlotte, and Tampa were wired first (see
  "Neighborhoods — verification notes" above; note the actual layers
  used differ from the original candidate list below, which was written
  before anyone had actually curl'd the endpoints). Raleigh's Citizens
  Advisory Council (CAC) layer — found and verified live
  (`maps.raleighnc.gov/arcgis/rest/services/Boundaries/MapServer/1`, 18
  areas, field `CAC`) — is now wired up too, so 5 of 6 non-Denver
  markets have a live hotspot map. Still open:
  - Austin: `COA Neighborhood Planning Areas` — not investigated. Was
    lower priority while the assessor was unresolved; the assessor is
    now live (see Austin section above), so this is unblocked whenever
    someone picks it up.
- **Austin assessor — resolved 7/2026.** Travis County TNR's public
  parcel feed (`taxmaps.traviscountytx.gov`) covers owner/market
  value/year-built/lot-size/property-class. It has no unit count, sqft,
  or sale price (Texas non-disclosure state + no CAMA data in this
  layer) — those still come from ATTOM/RentCast. A full CAMA-style feed
  would still need a TCAD partner agreement or a paid aggregator, but
  isn't worth pursuing given the free feed already covers the core
  fields.
