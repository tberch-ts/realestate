import type { AssessorRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// Maricopa County Assessor — free ArcGIS FeatureServer published by the
// Maricopa County Recorder's/Assessor's office via their Open Data portal
// (data-maricopa.opendata.arcgis.com).
//
// The parcel layer carries owner, situs address, year built, square
// footage, living area, tax roll value, last sale info, and land use.
// No API key required; polite rate limit (default ArcGIS quota).
//
// NOTE on layer URL: Maricopa republishes the layer periodically and the
// exact service slug has changed. The stable public URL lives in the
// Open Data catalog at:
//   https://data-maricopa.opendata.arcgis.com/datasets/c937f17330f64e64abd41976fc8bb17f
// which currently points at the `Parcels` FeatureServer below. If the
// slug changes, bump PHOENIX_PARCELS — no other code needs to move.
const PHOENIX_PARCELS =
  'https://services6.arcgis.com/btCzjPTmhHGPvKkG/ArcGIS/rest/services/Parcels/FeatureServer/0/query';

// Field names mirror the public layer schema. Not every field is
// guaranteed to be present across all parcel types (commercial vs
// residential differ); we coalesce on read.
interface MaricopaParcelAttrs {
  APN?: string;                    // 8-digit Assessor Parcel Number (primary key)
  OWNER_NAME?: string;
  OWNER_ADDRESS?: string;
  OWNER_CITY?: string;
  OWNER_STATE?: string;
  OWNER_ZIP?: string;
  // Situs (property) address components — Maricopa splits number/street
  SITUS_HSNO?: string;             // House number
  SITUS_HSSUF?: string;            // Suffix (A, 1/2 etc)
  SITUS_STDIR?: string;            // N/S/E/W
  SITUS_STREET?: string;
  SITUS_SUFFIX?: string;           // RD/ST/AVE
  SITUS_CITY?: string;
  SITUS_ZIP?: string;
  // Situs as a single prejoined string (exists on some layer versions).
  SITUS_ADDRESS?: string;
  YEAR_BUILT?: number;
  // Building area variants — commercial parcels populate TOTAL_BLDG_SQFT,
  // residential parcels populate LIVING_AREA.
  TOTAL_BLDG_SQFT?: number;
  LIVING_AREA?: number;
  LAND_AREA?: number;              // In acres on this layer; we convert
  LAND_AREA_SF?: number;           // Sometimes pre-converted
  // Use code classification — 1xxx residential, 3xxx commercial, 7xxx
  // vacant land. 13xx is multifamily.
  PROPERTY_USE_CODE?: string;
  PROPERTY_USE_DESC?: string;
  TOTAL_UNITS?: number;
  ASSESSED_VALUE?: number;
  FULL_CASH_VALUE?: number;        // Market value per the roll
  // Last sale columns — LOCKED_SALE_PRICE is the one used for tax
  // purposes, SALE_PRICE can be blank for non-arms-length transfers.
  LOCKED_SALE_PRICE?: number;
  SALE_PRICE?: number;
  SALE_DATE?: number;              // epoch ms
}

interface FeatureServerResponse {
  features?: Array<{ attributes: MaricopaParcelAttrs }>;
  error?: { message: string };
}

export async function fetchPhoenixAssessor(
  geocode: GeocodedAddress
): Promise<ProviderResult<AssessorRecord>> {
  const provider = 'phoenix_assessor';
  if (geocode.stateCode !== 'AZ') {
    return {
      provider,
      status: 'not_available',
      message: 'Maricopa County Assessor only covers addresses in AZ',
    };
  }

  try {
    const street = geocode.components?.route ?? '';
    const number = geocode.components?.street_number ?? '';
    const addr = `${number} ${street}`.trim().toUpperCase();
    if (!addr) {
      return { provider, status: 'not_available', message: 'Geocode missing street components' };
    }

    const url = new URL(PHOENIX_PARCELS);
    // Maricopa's layer carries SITUS_ADDRESS as a composed string. Prefix
    // LIKE so "101 N CENTRAL AVE #1500" still matches "101 N CENTRAL AVE%".
    // If a future layer version drops SITUS_ADDRESS we'll need to OR on
    // SITUS_HSNO + SITUS_STREET — easy swap, not needed today.
    const where = `SITUS_ADDRESS LIKE '${addr.replace(/'/g, "''")}%'`;
    url.searchParams.set('where', where);
    url.searchParams.set('outFields', '*');
    url.searchParams.set('f', 'json');
    url.searchParams.set('resultRecordCount', '1');

    const res = await fetch(url);
    if (!res.ok) {
      return { provider, status: 'error', message: `Maricopa ArcGIS HTTP ${res.status}` };
    }
    const body = (await res.json()) as FeatureServerResponse;
    if (body.error) {
      return { provider, status: 'error', message: body.error.message };
    }
    if (!body.features || body.features.length === 0) {
      return { provider, status: 'not_available', message: 'No Maricopa parcel matched this address' };
    }

    const record = toRecord(body.features[0].attributes);
    return { provider, status: 'ok', data: record, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

function toRecord(a: MaricopaParcelAttrs): AssessorRecord {
  // Square footage: prefer the commercial gross area, fall back to
  // residential living area. Same coalesce pattern as Denver.
  const sqft = num(a.TOTAL_BLDG_SQFT) ?? num(a.LIVING_AREA);

  // Land area: layer sometimes publishes acres (LAND_AREA) and sometimes
  // square feet (LAND_AREA_SF). Convert acres → sqft if that's what we got.
  let lotSqft = num(a.LAND_AREA_SF);
  if (lotSqft == null) {
    const acres = num(a.LAND_AREA);
    if (acres != null) lotSqft = Math.round(acres * 43560);
  }

  // Sale price: LOCKED_SALE_PRICE is the tax-roll figure and is usually
  // non-zero for real transfers. Fall back to SALE_PRICE. Filter 0s.
  const salePrice = num(a.LOCKED_SALE_PRICE) ?? num(a.SALE_PRICE);
  const saleDate = a.SALE_DATE ? new Date(a.SALE_DATE).toISOString().slice(0, 10) : undefined;

  return {
    parcelId: str(a.APN),
    owner: str(a.OWNER_NAME),
    assessedValue: num(a.FULL_CASH_VALUE) ?? num(a.ASSESSED_VALUE),
    yearBuilt: num(a.YEAR_BUILT),
    units: num(a.TOTAL_UNITS),
    sqft,
    lotSqft,
    propertyClass: str(a.PROPERTY_USE_DESC) ?? str(a.PROPERTY_USE_CODE),
    lastSalePrice: salePrice && salePrice > 0 ? salePrice : undefined,
    lastSaleDate: saleDate,
    source: 'maricopa',
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
