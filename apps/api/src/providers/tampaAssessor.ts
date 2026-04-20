import type { AssessorRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// Hillsborough County Property Appraiser (HCPA) — free ArcGIS
// FeatureServer published via HCPA's ArcGIS Hub. Florida property
// appraisers are required by Fla. Stat. §195.022 to publish the tax
// roll annually; HCPA exposes it as a downloadable layer + REST API.
//
// The HCPA ArcGIS Hub catalog at
//   https://hcpafl-test-hillsborough.hub.arcgis.com/
// publishes the Parcels service. As of 2026 the current REST URL is:
const TAMPA_PARCELS =
  'https://maps.hcpafl.org/arcgis/rest/services/HCPA_Public/Parcel_Info/MapServer/0/query';

// Schema reflects Florida's DOR-standard columns (DR-501) plus HCPA
// specifics. Florida uses 'FOLIO' as the parcel ID.
interface HillsboroughParcelAttrs {
  FOLIO?: string;                 // 12-digit parcel ID
  PIN?: string;                   // alt parcel id on some layer versions
  OWNER_NAME?: string;
  OWNER_STREET?: string;
  OWNER_CITY?: string;
  OWNER_STATE?: string;
  OWNER_ZIP?: string;
  SITE_ADDR?: string;             // Situs (composed)
  SITE_ZIP?: string;
  // Values — FL DR-501 standard columns
  JV?: number;                    // Just Value (market value)
  AV?: number;                    // Assessed Value (after SOH cap)
  TV?: number;                    // Taxable Value
  // Building
  ACT_YR_BLT?: number;            // Actual year built
  EFF_YR_BLT?: number;            // Effective year built (post-reno)
  TOT_LVG_AR?: number;            // Total living area, sqft
  HEAT_AR?: number;               // Heated area, alt field
  TOT_AREA?: number;              // Gross area on commercial parcels
  NO_BULD?: number;               // Number of buildings
  NO_UNITS?: number;              // Unit count
  // Land
  LND_SQFOOT?: number;
  LND_ACRES?: number;
  // Use classification — Florida DOR Use Code (3-digit)
  DOR_UC?: string;
  PA_UC?: string;                 // HCPA's own use code override
  LAND_USE?: string;
  // Sale
  SALE_PRC1?: number;             // Most recent
  SALE_YR1?: number;
  SALE_MO1?: number;
  SALE_PRC2?: number;             // Prior
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
  // Sale date: Florida publishes year + month columns rather than epoch.
  // Use day=01 since the exact day isn't on the layer — matches how HCPA
  // itself formats sale dates in their public search.
  let saleDate: string | undefined;
  if (a.SALE_YR1 && a.SALE_MO1) {
    const mm = String(a.SALE_MO1).padStart(2, '0');
    saleDate = `${a.SALE_YR1}-${mm}-01`;
  } else if (a.SALE_YR1) {
    saleDate = `${a.SALE_YR1}-01-01`;
  }

  // Land sqft: use direct LND_SQFOOT, otherwise convert from acres.
  let lotSqft = num(a.LND_SQFOOT);
  if (lotSqft == null) {
    const acres = num(a.LND_ACRES);
    if (acres != null) lotSqft = Math.round(acres * 43560);
  }

  const sqft = num(a.TOT_AREA) ?? num(a.TOT_LVG_AR) ?? num(a.HEAT_AR);

  return {
    parcelId: str(a.FOLIO) ?? str(a.PIN),
    owner: str(a.OWNER_NAME),
    // Prefer Just Value (market) — it's the value most investors care
    // about. Florida's AV can lag due to Save-Our-Homes cap.
    assessedValue: num(a.JV) ?? num(a.AV),
    yearBuilt: num(a.ACT_YR_BLT) ?? num(a.EFF_YR_BLT),
    units: num(a.NO_UNITS),
    sqft,
    lotSqft,
    propertyClass: str(a.LAND_USE) ?? str(a.PA_UC) ?? str(a.DOR_UC),
    lastSalePrice: a.SALE_PRC1 && a.SALE_PRC1 > 0 ? a.SALE_PRC1 : undefined,
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
