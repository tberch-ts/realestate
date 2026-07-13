import type { AssessorRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// Hillsborough County parcel data, free ArcGIS FeatureServer.
//
// The previous URL (maps.hcpafl.org/arcgis/rest/services/HCPA_Public/...)
// was never a real ArcGIS endpoint — maps.hcpafl.org is HCPA's own React
// SPA web map (it serves the app's index.html for any path, including
// `/arcgis/rest/services`), so every request against it silently 404'd
// through the SPA fallback. Verified live via curl 2026-07-13.
//
// The real free public endpoint is City of Tampa GIS's TaxParcel layer,
// whose description field states it carries "Hillsborough County
// Property Appraiser Data (City & county Parcels)" — i.e. it's the
// county-wide HCPA tax roll, just hosted on Tampa's ArcGIS Server rather
// than HCPA's own domain. Read-only (capabilities: "Query"), no auth.
//   https://arcgis.tampagov.net/arcgis/rest/services/Parcels/TaxParcel/FeatureServer/0
const TAMPA_PARCELS =
  'https://arcgis.tampagov.net/arcgis/rest/services/Parcels/TaxParcel/FeatureServer/0/query';

// IMPORTANT: this schema does NOT follow the Florida DR-501 statewide
// tax-roll column convention (FOLIO/JV/AV/TV/ACT_YR_BLT/TOT_LVG_AR/...)
// that the project docs assumed. It's a City-of-Tampa-curated layer with
// its own field names, confirmed by both the layer's field metadata
// (`?f=json`) and live query rows on 2026-07-13. Notably there's no
// unit-count column at all (no NO_UNITS/TOT_UNITS analog), and no direct
// land-sqft column — only ACREAGE. Do not assume future FL counties will
// share these field names; verify each one independently.
interface HillsboroughParcelAttrs {
  FOLIO?: string;                 // "Parcel Folio Number" (not zero-padded 12-digit; e.g. "8.0100")
  PIN?: string;                   // "Property Identification Number" (long human-readable form)
  STRAP?: string;                 // "Unformatted PIN" — stable alnum key, good parcelId fallback
  OWNER?: string;                 // "Owner Name"
  ADDR_1?: string;                // Owner mailing address line 1
  ADDR_2?: string;
  CITY?: string;
  STATE?: string;
  ZIP?: string;
  SITE_ADDR?: string;             // "Parcel Site Address" (situs)
  SITE_CITY?: string;
  SITE_ZIP?: string;
  TYPE?: string;                  // "Parcel Description" (often null)
  // Values
  JUST?: number;                  // "Market/Just Value"
  LAND?: number;                  // "Land Value"
  BLDG?: number;                  // "Buildings Value"
  ASD_VAL?: number;                // "Assessed Value" (after any cap)
  TAX_VAL?: number;                // "Taxable Value"
  // Building
  ACT?: number;                   // "Actual Year Built" (0 = no building / vacant)
  EFF?: number;                   // "Remodel Year" (0 = none)
  HEAT_AR?: number;               // "Living Area", sqft (0 = no building)
  STORIES?: number;
  // Land
  ACREAGE?: number;                // decimal acres — no direct sqft column exists
  // Use classification
  DOR_C?: string;                  // "DOR Use Code" (Florida DOR code, e.g. "0800" = multifamily <10 units)
  // Sale
  S_DATE?: number;                 // "Sale Date" — epoch ms (esriFieldTypeDate), null if no sale on record
  AMT?: number;                    // "Sale Amount" — 0 = no recorded sale (sentinel, same as Denver's SALE_PRICE)
  VI?: string;                     // Vacant/Improved flag
}

interface FeatureServerResponse {
  features?: Array<{ attributes: HillsboroughParcelAttrs }>;
  error?: { message: string };
}

export async function fetchTampaAssessor(
  geocode: GeocodedAddress
): Promise<ProviderResult<AssessorRecord>> {
  const provider = 'tampa_assessor';
  if (geocode.stateCode !== 'FL') {
    return {
      provider,
      status: 'not_available',
      message: 'HCPA only covers addresses in Hillsborough County, FL',
    };
  }

  try {
    const street = geocode.components?.route ?? '';
    const number = geocode.components?.street_number ?? '';
    const addr = `${number} ${street}`.trim().toUpperCase();
    if (!addr) {
      return { provider, status: 'not_available', message: 'Geocode missing street components' };
    }

    const url = new URL(TAMPA_PARCELS);
    url.searchParams.set('where', `SITE_ADDR LIKE '${addr.replace(/'/g, "''")}%'`);
    url.searchParams.set('outFields', '*');
    url.searchParams.set('f', 'json');
    url.searchParams.set('resultRecordCount', '1');

    const res = await fetch(url);
    if (!res.ok) {
      return { provider, status: 'error', message: `HCPA ArcGIS HTTP ${res.status}` };
    }
    const body = (await res.json()) as FeatureServerResponse;
    if (body.error) {
      return { provider, status: 'error', message: body.error.message };
    }
    if (!body.features || body.features.length === 0) {
      return { provider, status: 'not_available', message: 'No Hillsborough parcel matched this address' };
    }

    const record = toRecord(body.features[0].attributes);
    return { provider, status: 'ok', data: record, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

function toRecord(a: HillsboroughParcelAttrs): AssessorRecord {
  // Sale date arrives as epoch ms (esriFieldTypeDate), same shape as
  // Denver's SALE_DATE — convert to an ISO date string for the UI.
  const saleDate = a.S_DATE ? new Date(a.S_DATE).toISOString().slice(0, 10) : undefined;

  // No direct land-sqft column on this layer — convert from ACREAGE.
  const acres = num(a.ACREAGE);
  const lotSqft = acres != null ? Math.round(acres * 43560) : undefined;

  return {
    parcelId: str(a.FOLIO) ?? str(a.STRAP) ?? str(a.PIN),
    owner: str(a.OWNER),
    // Prefer Just Value (market) — it's the value most investors care
    // about; ASD_VAL can lag behind due to assessment caps.
    assessedValue: num(a.JUST) ?? num(a.ASD_VAL),
    // ACT/EFF report 0 (not null) on vacant/unbuilt parcels — treat 0 as
    // "no building" rather than a literal year-built-0.
    yearBuilt: numPositive(a.ACT) ?? numPositive(a.EFF),
    // This layer has no unit-count column at all (no NO_UNITS/TOT_UNITS
    // analog) — leave undefined rather than guessing.
    units: undefined,
    sqft: numPositive(a.HEAT_AR),
    lotSqft,
    propertyClass: str(a.DOR_C) ?? str(a.TYPE),
    // AMT = 0 is the sentinel for "no recorded sale" (mirrors Denver's
    // SALE_PRICE handling) — filter it so the UI doesn't show $0 sales.
    lastSalePrice: a.AMT && a.AMT > 0 ? a.AMT : undefined,
    lastSaleDate: saleDate,
    source: 'hillsborough_fl',
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
// Same as num(), but treats 0 as "no value" — several columns on this
// layer (ACT, EFF, HEAT_AR) use 0 rather than null as their "not
// applicable" sentinel for vacant/unbuilt parcels.
function numPositive(v: unknown): number | undefined {
  const n = num(v);
  return n && n > 0 ? n : undefined;
}
