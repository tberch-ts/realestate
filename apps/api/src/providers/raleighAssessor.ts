import type { AssessorRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// Wake County / Raleigh — free ArcGIS service published by the City of
// Raleigh at maps.raleighnc.gov/arcgis/rest/services/. Data comes from
// the Wake County Revenue Department's CAMA system (iMAPS is the public
// UI). No API key.
//
// IMPORTANT: the service is NOT at `Parcels/MapServer` (that path
// 404s-as-499 — ArcGIS Server returns `{"error":{"code":499,"message":
// "Token Required"}}` for a nonexistent service/folder combo instead of
// a clean 404, which looks identical to a real auth failure). The
// catalog root (`/arcgis/rest/services?f=json`) shows the actual
// service lives in the `Property` folder as `Property/Property`, both
// as a MapServer and a FeatureServer. Confirmed live via curl on
// 2026-07-13: `Property/Property/FeatureServer/0?f=json` returns real
// metadata with no token, and a live query against layer 0 returns
// parcel attributes anonymously.
//
// Layer 0 ("Property") is the parcel polygon layer with ownership +
// CAMA attributes joined in.
const RALEIGH_PARCELS =
  'https://maps.raleighnc.gov/arcgis/rest/services/Property/Property/FeatureServer/0/query';

// Schema reflects the live field list from the Property/Property
// FeatureServer (layer 0), verified via `?f=json` on the layer and a
// sample query. Wake uses REID (Real Estate Identification) as the
// primary key — distinct from Mecklenburg's PID — with PIN_NUM as the
// secondary tax-roll id.
interface WakeParcelAttrs {
  REID?: string;                  // 7-digit Real Estate ID
  PIN_NUM?: string;                // 11-digit parcel ID (tax roll)
  OWNER?: string;
  ADDR1?: string;                  // Mailing address line 1
  ADDR2?: string;                  // Mailing address line 2 (city/state/zip)
  ADDR3?: string;
  SITE_ADDRESS?: string;           // Full situs, e.g. "1060 S MAIN ST"
  CITY_DECODE?: string;
  // Valuation
  TOTAL_VALUE_ASSD?: number;
  BLDG_VAL?: number;
  LAND_VAL?: number;
  // Building
  YEAR_BUILT?: number;
  TOTSTRUCTS?: number;
  TOTUNITS?: number;
  HEATEDAREA?: number;             // Heated/finished area, sqft
  // Land
  DEED_ACRES?: number;             // Acres
  LAND_CLASS_DECODE?: string;
  // Use classification
  TYPE_USE_DECODE?: string;
  PROPDESC?: string;
  BILLING_CLASS_DECODE?: string;
  // Sale
  TOTSALPRICE?: number;
  SALE_DATE?: number;              // epoch ms
}

interface FeatureServerResponse {
  features?: Array<{ attributes: WakeParcelAttrs }>;
  error?: { message: string };
}

export async function fetchRaleighAssessor(
  geocode: GeocodedAddress
): Promise<ProviderResult<AssessorRecord>> {
  const provider = 'raleigh_assessor';
  if (geocode.stateCode !== 'NC') {
    return {
      provider,
      status: 'not_available',
      message: 'Wake County Assessor only covers addresses in NC',
    };
  }

  try {
    const street = geocode.components?.route ?? '';
    const number = geocode.components?.street_number ?? '';
    const addr = `${number} ${street}`.trim().toUpperCase();
    if (!addr) {
      return { provider, status: 'not_available', message: 'Geocode missing street components' };
    }

    const url = new URL(RALEIGH_PARCELS);
    url.searchParams.set('where', `SITE_ADDRESS LIKE '${addr.replace(/'/g, "''")}%'`);
    url.searchParams.set('outFields', '*');
    url.searchParams.set('f', 'json');
    url.searchParams.set('resultRecordCount', '1');

    const res = await fetch(url);
    if (!res.ok) {
      return { provider, status: 'error', message: `Wake ArcGIS HTTP ${res.status}` };
    }
    const body = (await res.json()) as FeatureServerResponse;
    if (body.error) {
      return { provider, status: 'error', message: body.error.message };
    }
    if (!body.features || body.features.length === 0) {
      return { provider, status: 'not_available', message: 'No Wake County parcel matched this address' };
    }

    const record = toRecord(body.features[0].attributes);
    return { provider, status: 'ok', data: record, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

function toRecord(a: WakeParcelAttrs): AssessorRecord {
  const saleDate = a.SALE_DATE ? new Date(a.SALE_DATE).toISOString().slice(0, 10) : undefined;

  // Land area comes as acres in Wake's schema. Convert to sqft to match
  // the AssessorRecord contract.
  let lotSqft: number | undefined;
  const acres = num(a.DEED_ACRES);
  if (acres != null) lotSqft = Math.round(acres * 43560);

  return {
    parcelId: str(a.REID) ?? str(a.PIN_NUM),
    owner: str(a.OWNER),
    assessedValue: num(a.TOTAL_VALUE_ASSD),
    yearBuilt: num(a.YEAR_BUILT),
    units: num(a.TOTUNITS),
    sqft: num(a.HEATEDAREA),
    lotSqft,
    propertyClass: str(a.TYPE_USE_DECODE) ?? str(a.PROPDESC) ?? str(a.LAND_CLASS_DECODE),
    lastSalePrice: a.TOTSALPRICE && a.TOTSALPRICE > 0 ? a.TOTSALPRICE : undefined,
    lastSaleDate: saleDate,
    source: 'wake_nc',
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
