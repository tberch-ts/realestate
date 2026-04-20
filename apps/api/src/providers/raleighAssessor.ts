import type { AssessorRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// Wake County / Raleigh — free ArcGIS service shared by Wake County GIS
// and the City of Raleigh at maps.raleighnc.gov/arcgis/rest/services/.
// Data comes from the Wake County Revenue Department's CAMA system
// (iMAPS is the public UI). No API key.
//
// Wake publishes a `Parcels` MapServer that joins ownership + CAMA
// attributes. The feature layer we want is layer 0 of the public
// Parcels service.
const RALEIGH_PARCELS =
  'https://maps.raleighnc.gov/arcgis/rest/services/Parcels/MapServer/0/query';

// Schema reflects Wake's CAMA column names. Note that Wake uses REID
// (Real Estate Identification) as the primary key — distinct from
// Mecklenburg's PID.
interface WakeParcelAttrs {
  REID?: string;                  // 7-digit Real Estate ID
  PIN?: string;                   // 10-digit parcel ID (tax roll)
  OWNER?: string;
  MAILING_ADDRESS_1?: string;
  MAILING_ADDRESS_2?: string;
  MAILING_CITY?: string;
  MAILING_STATE?: string;
  MAILING_ZIP?: string;
  SITE_ADDRESS?: string;          // Full situs
  PROPERTY_STREET_NUMBER?: string;
  PROPERTY_STREET_NAME?: string;
  PROPERTY_CITY?: string;
  // Valuation
  TOTAL_VALUE_ASSD?: number;
  BUILDING_VALUE_ASSD?: number;
  LAND_VALUE_ASSD?: number;
  // Building
  YEAR_BUILT?: number;
  TOTAL_STRUCTURES?: number;
  UNITS?: number;
  HEATED_AREA?: number;           // Common residential field
  TOTAL_SALES_AREA?: number;      // Gross area on commercial
  PHYSICAL_CITY?: string;
  // Land
  DEEDED_ACREAGE?: number;        // Acres
  LAND_CLASS?: string;
  // Use classification — Wake uses SPECIAL_DISTRICTS + LAND_CLASS
  PROPERTY_USE?: string;
  PROPERTY_DESC?: string;
  // Sale
  TOTSALPRICE?: number;
  SALE_DATE?: number;             // epoch ms
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
  const acres = num(a.DEEDED_ACREAGE);
  if (acres != null) lotSqft = Math.round(acres * 43560);

  const sqft = num(a.TOTAL_SALES_AREA) ?? num(a.HEATED_AREA);

  return {
    parcelId: str(a.REID) ?? str(a.PIN),
    owner: str(a.OWNER),
    assessedValue: num(a.TOTAL_VALUE_ASSD),
    yearBuilt: num(a.YEAR_BUILT),
    units: num(a.UNITS),
    sqft,
    lotSqft,
    propertyClass: str(a.PROPERTY_DESC) ?? str(a.PROPERTY_USE) ?? str(a.LAND_CLASS),
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
