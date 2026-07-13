import type { AssessorRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// Travis County TNR "Parcels" layer — sourced from Travis Central
// Appraisal District (TCAD) tax-roll data and republished monthly by
// Travis County Transportation & Natural Resources (TNR) as a public
// ArcGIS MapServer. No API key, no auth, default ArcGIS rate limit.
//
// This supersedes the old `not_available` stub. As of 4/2026 TCAD
// itself (traviscad.org) still had no public API — but Travis County's
// own GIS department publishes the TCAD tax-roll parcel layer for free,
// which we missed on the first pass. Re-verified live on 2026-07-13:
//   https://taxmaps.traviscountytx.gov/arcgis/rest/services/Parcels/MapServer/0
//   373,683 parcels; 354,093 have a non-zero market_value.
//   Sample: situs_num='1200' AND situs_address LIKE '%CONGRESS%' ->
//   PROP_ID 100851 "SOUTH CONGRESS PARTNERS LLC", market_value
//   $4,269,755, F1year_imprv 1915, land_type_desc "COMMERCIAL IMPROVED".
//
// Known gaps in this feed (confirmed against live pulls, not assumed):
//   - `assessed_val` / `appraised_val` are NULL for every row in the
//     layer (checked with a `returnCountOnly=true` query — 0 non-null
//     out of 373,683). TCAD does not expose the capped/assessed figure
//     through this GIS layer, only `market_value`. We use market_value
//     as the assessedValue proxy, same idea as Denver's appraised/
//     assessed coalesce.
//   - No building-characteristics columns (living area, unit count).
//     This is a cadastral/tax-roll layer, not TCAD's internal CAMA
//     database, so `units` and `sqft` are always undefined for Austin.
//   - No sale-price column anywhere in the feed. Texas is a
//     non-disclosure state — sale consideration is not required on a
//     recorded deed and TCAD does not publish it. `deed_date` exists
//     but records any deed change (trust/LLC/name transfers included),
//     not just arms-length sales, and with no price to pair it with we
//     leave lastSalePrice/lastSaleDate undefined rather than mislabel a
//     deed recording as a sale.
//   - `situs_street` is unreliable — every sampled row has it hard-set
//     to the literal string "TX" (a data-quality bug in the published
//     layer; the real street name only shows up inside the combined
//     `situs_address` string). We match on `situs_num` (exact) +
//     `situs_address` (CONTAINS on the stripped street name) instead of
//     trusting situs_street.
const AUSTIN_PARCELS =
  'https://taxmaps.traviscountytx.gov/arcgis/rest/services/Parcels/MapServer/0/query';

interface TravisParcelAttrs {
  PROP_ID?: number;
  geo_id?: string; // TCAD's public parcel/account number, e.g. "0101000318"
  py_owner_name?: string;
  situs_num?: string;
  situs_address?: string; // combined string; only reliable address field
  market_value?: number;
  appraised_val?: number; // always NULL in this feed — kept for completeness
  assessed_val?: number; // always NULL in this feed — kept for completeness
  F1year_imprv?: number; // "First year 1st Floor Improvement" — year-built proxy
  tcad_acres?: number;
  land_type_desc?: string;
  deed_date?: number; // epoch ms — deed recording date, not a verified sale date
}

interface FeatureServerResponse {
  features?: Array<{ attributes: TravisParcelAttrs }>;
  error?: { message: string };
}

// Street-suffix / directional tokens stripped before building the
// CONTAINS filter, so "301 Congress Ave" and "1220 S Congress Avenue"
// both search on the bare "CONGRESS" core — situs_address stores things
// like "S 1220 CONGRESS AVE   TX 78704" (direction prefix before the
// house number, no reliable suffix normalization), so a prefix match
// isn't viable; CONTAINS on the core token is.
const STRIP_TOKENS = new Set([
  'N', 'S', 'E', 'W', 'NORTH', 'SOUTH', 'EAST', 'WEST',
  'ST', 'STREET', 'AVE', 'AVENUE', 'BLVD', 'BOULEVARD', 'DR', 'DRIVE',
  'RD', 'ROAD', 'LN', 'LANE', 'CIR', 'CIRCLE', 'CT', 'COURT', 'PKWY',
  'PARKWAY', 'WAY', 'TRL', 'TRAIL', 'LOOP', 'HWY', 'HIGHWAY', 'PL',
  'PLACE', 'TER', 'TERRACE',
]);

export async function fetchAustinAssessor(
  geocode: GeocodedAddress
): Promise<ProviderResult<AssessorRecord>> {
  const provider = 'austin_assessor';
  if (geocode.stateCode !== 'TX') {
    return {
      provider,
      status: 'not_available',
      message: 'Travis County Assessor only covers addresses in Travis County, TX',
    };
  }

  try {
    const number = geocode.components?.street_number ?? '';
    const route = geocode.components?.route ?? '';
    if (!number || !route) {
      return { provider, status: 'not_available', message: 'Geocode missing street components' };
    }

    const core = route
      .toUpperCase()
      .split(/\s+/)
      .filter((tok) => tok && !STRIP_TOKENS.has(tok))
      .join(' ');
    if (!core) {
      return { provider, status: 'not_available', message: 'Could not derive a street name to query' };
    }

    const url = new URL(AUSTIN_PARCELS);
    const where =
      `situs_num='${number.replace(/'/g, "''")}' ` +
      `AND situs_address LIKE '%${core.replace(/'/g, "''")}%'`;
    url.searchParams.set('where', where);
    url.searchParams.set(
      'outFields',
      'PROP_ID,geo_id,py_owner_name,situs_num,situs_address,market_value,appraised_val,assessed_val,F1year_imprv,tcad_acres,land_type_desc,deed_date'
    );
    url.searchParams.set('f', 'json');
    url.searchParams.set('resultRecordCount', '1');

    const res = await fetch(url);
    if (!res.ok) {
      return { provider, status: 'error', message: `Travis County ArcGIS HTTP ${res.status}` };
    }
    const body = (await res.json()) as FeatureServerResponse;
    if (body.error) {
      return { provider, status: 'error', message: body.error.message };
    }
    if (!body.features || body.features.length === 0) {
      return { provider, status: 'not_available', message: 'No Travis County parcel matched this address' };
    }

    const record = toRecord(body.features[0].attributes);
    return { provider, status: 'ok', data: record, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

function toRecord(a: TravisParcelAttrs): AssessorRecord {
  const acres = num(a.tcad_acres);
  const lotSqft = acres != null ? Math.round(acres * 43560) : undefined;

  return {
    parcelId: str(a.geo_id) ?? (a.PROP_ID != null ? String(a.PROP_ID) : undefined),
    owner: str(a.py_owner_name),
    // assessed_val/appraised_val are NULL for every row in this layer
    // (confirmed live); market_value is the only populated valuation
    // figure TCAD publishes through it, so we use it as the proxy.
    assessedValue: num(a.market_value) ?? num(a.appraised_val) ?? num(a.assessed_val),
    yearBuilt: num(a.F1year_imprv),
    units: undefined, // not published in this cadastral layer
    sqft: undefined, // not published in this cadastral layer
    lotSqft,
    propertyClass: str(a.land_type_desc),
    // Texas is a non-disclosure state — no sale price is public record
    // anywhere. deed_date exists but isn't confirmed arms-length, so we
    // don't relabel a deed recording as a sale without a price.
    lastSalePrice: undefined,
    lastSaleDate: undefined,
    source: 'travis',
  };
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  return String(v).trim() || undefined;
}
function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
