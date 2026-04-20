import type { AssessorRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// Denver Open Data parcels — unified dataset (April 2026 migration).
//
// Denver retired the split commercial/residential FeatureServers
// (ODC_REAL_PROPERTY_COMMERCIAL_P / RESIDENTIAL_P) in early 2026 and
// consolidated everything into one ArcGIS layer with both commercial
// and residential rows. The new layer carries 70+ fields including
// owner mailing address, both COM_* and RES_* year-built / square-
// footage variants, and the full appraised+assessed value lattice.
//
// Layer id is 245 (yes, three digits — that's how Denver registered it
// after the migration). Same host as before; just renamed services.
const DENVER_PARCELS =
  'https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/ArcGIS/rest/services/ODC_PROP_PARCELS_A/FeatureServer/245/query';

interface DenverParcelAttrs {
  SCHEDNUM?: string;
  OWNER_NAME?: string;
  OWNER_ADDRESS_LINE1?: string;
  OWNER_ADDRESS_LINE2?: string;
  OWNER_CITY?: string;
  OWNER_STATE?: string;
  OWNER_ZIP?: string;
  SITUS_ADDRESS_LINE1?: string;
  SITUS_ADDRESS_LINE2?: string;
  // Year built lives in two columns — commercial vs. residential. For
  // mixed-use we take whichever is non-null, preferring commercial since
  // 100+ unit multifamily lands in the commercial bucket.
  COM_ORIG_YEAR_BUILT?: number;
  RES_ORIG_YEAR_BUILT?: number;
  // Same dual-column pattern for building square footage.
  COM_GROSS_AREA?: number;
  COM_NET_AREA?: number;
  RES_ABOVE_GRADE_AREA?: number;
  LAND_AREA?: number;
  // Property classification — D_CLASS is the 3-digit code (e.g. 214 =
  // 100+ unit multifamily); D_CLASS_CN is the human label.
  D_CLASS?: string;
  D_CLASS_CN?: string;
  PROP_CLASS?: string;
  // Total unit count — 0 or null for non-residential parcels.
  TOT_UNITS?: number;
  APPRAISED_TOTAL_VALUE?: number;
  ASSESSED_TOTAL_VALUE_LOCAL?: number;
  SALE_PRICE?: number;
  SALE_DATE?: number; // epoch ms
}

interface FeatureServerResponse {
  features?: Array<{ attributes: DenverParcelAttrs }>;
  error?: { message: string };
}

export async function fetchDenverAssessor(
  geocode: GeocodedAddress
): Promise<ProviderResult<AssessorRecord>> {
  const provider = 'denver_assessor';
  const stateCode = geocode.stateCode;
  if (stateCode !== 'CO') {
    return {
      provider,
      status: 'not_available',
      message: 'Denver Assessor only covers Denver County, CO',
    };
  }

  try {
    const street = geocode.components?.route ?? '';
    const number = geocode.components?.street_number ?? '';
    const addr = `${number} ${street}`.trim().toUpperCase();
    if (!addr) {
      return { provider, status: 'not_available', message: 'Geocode missing street components' };
    }

    const url = new URL(DENVER_PARCELS);
    // SITUS_ADDRESS_LINE1 in the new schema (was SITUS_ADDRESS in the
    // old split datasets). We do a prefix LIKE so unit numbers don't
    // break the match — "901 N COLORADO BLVD UNIT 100" still matches
    // "901 N COLORADO BLVD%".
    url.searchParams.set('where', `SITUS_ADDRESS_LINE1 LIKE '${addr.replace(/'/g, "''")}%'`);
    url.searchParams.set('outFields', '*');
    url.searchParams.set('f', 'json');
    url.searchParams.set('resultRecordCount', '1');

    const res = await fetch(url);
    if (!res.ok) {
      return { provider, status: 'error', message: `Denver ArcGIS HTTP ${res.status}` };
    }
    const body = (await res.json()) as FeatureServerResponse;
    if (body.error) {
      return { provider, status: 'error', message: body.error.message };
    }
    if (!body.features || body.features.length === 0) {
      return { provider, status: 'not_available', message: 'No Denver parcel matched this address' };
    }

    const record = toRecord(body.features[0].attributes);
    return { provider, status: 'ok', data: record, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

/**
 * Maps the unified ODC_PROP_PARCELS_A schema into our normalized
 * AssessorRecord. Coalesces the COM_ and RES_ parallel column families
 * (year built, sqft) based on which side is populated for this parcel.
 */
function toRecord(a: DenverParcelAttrs): AssessorRecord {
  // Prefer commercial year/area for parcels that have both (mixed-use
  // or large multifamily classified commercial). Fall back to residential.
  const yearBuilt = num(a.COM_ORIG_YEAR_BUILT) ?? num(a.RES_ORIG_YEAR_BUILT);
  const sqft = num(a.COM_GROSS_AREA) ?? num(a.COM_NET_AREA) ?? num(a.RES_ABOVE_GRADE_AREA);

  // Source label reflects which side of the schema actually had data.
  // Lets the frontend show "denver_commercial" for institutional rows
  // and "denver_residential" for SFR rows without us re-querying.
  const source: AssessorRecord['source'] =
    a.COM_ORIG_YEAR_BUILT != null || a.COM_GROSS_AREA != null
      ? 'denver_commercial'
      : 'denver_residential';

  // Sale date arrives as epoch ms; convert to ISO date string for the UI.
  const saleDate = a.SALE_DATE ? new Date(a.SALE_DATE).toISOString().slice(0, 10) : undefined;

  return {
    parcelId: str(a.SCHEDNUM),
    owner: str(a.OWNER_NAME),
    assessedValue: num(a.APPRAISED_TOTAL_VALUE) ?? num(a.ASSESSED_TOTAL_VALUE_LOCAL),
    yearBuilt,
    units: num(a.TOT_UNITS),
    sqft,
    lotSqft: num(a.LAND_AREA),
    propertyClass: str(a.D_CLASS_CN) ?? str(a.D_CLASS) ?? str(a.PROP_CLASS),
    // SALE_PRICE = 0 is the assessor's "no recorded sale" sentinel. Filter
    // it out so the UI doesn't show $0 sales as if they were real transfers.
    lastSalePrice: a.SALE_PRICE && a.SALE_PRICE > 0 ? a.SALE_PRICE : undefined,
    lastSaleDate: saleDate,
    source,
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
