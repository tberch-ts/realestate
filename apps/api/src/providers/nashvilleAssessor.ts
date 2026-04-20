import type { AssessorRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// Metro Nashville / Davidson County — free ArcGIS MapServer published by
// the Metro Nashville GIS group at maps.nashville.gov. The Cadastral
// service exposes an Ownership Parcels layer with APN, owner, situs,
// assessed values, and year built. No API key.
//
// We hit Cadastral/Parcels_SP which is the spatial-projected variant
// (WGS84) — same schema as /Cadastral/Parcels but friendlier for us.
const NASHVILLE_PARCELS =
  'https://maps.nashville.gov/arcgis/rest/services/Cadastral/Parcels_SP/MapServer/0/query';

// Field names pulled from the layer's metadata. Nashville's schema is
// simpler than Denver's — no separate commercial/residential columns,
// but year built and square footage can be missing on vacant parcels.
interface DavidsonParcelAttrs {
  APN?: string;                   // Parcel ID (primary key, printed "###-##-#-###")
  PROP_ADDR?: string;             // Situs address
  PROP_ZIP?: string;
  OWNER_NAME?: string;
  OWNER_ADDR_1?: string;
  OWNER_ADDR_2?: string;
  OWNER_CITY?: string;
  OWNER_STATE?: string;
  OWNER_ZIP?: string;
  LAND_USE?: string;              // Use code / description (e.g. 'APARTMENT >10 UNITS')
  LAND_USE_DESC?: string;
  // Value/area fields
  LAND_VALUE?: number;
  IMPROVE_VALUE?: number;
  TOTAL_VALUE?: number;
  ASSESSED_VALUE?: number;
  BLDG_SQ_FT?: number;
  LOT_SIZE?: number;              // Square feet
  YEAR_BUILT?: number;
  NO_UNITS?: number;
  // Sale — Nashville publishes DATE as epoch ms, PRICE as numeric.
  SALE_DATE?: number;
  SALE_PRICE?: number;
}

interface FeatureServerResponse {
  features?: Array<{ attributes: DavidsonParcelAttrs }>;
  error?: { message: string };
}

export async function fetchNashvilleAssessor(
  geocode: GeocodedAddress
): Promise<ProviderResult<AssessorRecord>> {
  const provider = 'nashville_assessor';
  if (geocode.stateCode !== 'TN') {
    return {
      provider,
      status: 'not_available',
      message: 'Davidson County Assessor only covers addresses in TN',
    };
  }

  try {
    const street = geocode.components?.route ?? '';
    const number = geocode.components?.street_number ?? '';
    const addr = `${number} ${street}`.trim().toUpperCase();
    if (!addr) {
      return { provider, status: 'not_available', message: 'Geocode missing street components' };
    }

    const url = new URL(NASHVILLE_PARCELS);
    url.searchParams.set('where', `PROP_ADDR LIKE '${addr.replace(/'/g, "''")}%'`);
    url.searchParams.set('outFields', '*');
    url.searchParams.set('f', 'json');
    url.searchParams.set('resultRecordCount', '1');

    const res = await fetch(url);
    if (!res.ok) {
      return { provider, status: 'error', message: `Nashville ArcGIS HTTP ${res.status}` };
    }
    const body = (await res.json()) as FeatureServerResponse;
    if (body.error) {
      return { provider, status: 'error', message: body.error.message };
    }
    if (!body.features || body.features.length === 0) {
      return { provider, status: 'not_available', message: 'No Davidson County parcel matched this address' };
    }

    const record = toRecord(body.features[0].attributes);
    return { provider, status: 'ok', data: record, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

function toRecord(a: DavidsonParcelAttrs): AssessorRecord {
  const saleDate = a.SALE_DATE ? new Date(a.SALE_DATE).toISOString().slice(0, 10) : undefined;

  return {
    parcelId: str(a.APN),
    owner: str(a.OWNER_NAME),
    assessedValue: num(a.TOTAL_VALUE) ?? num(a.ASSESSED_VALUE),
    yearBuilt: num(a.YEAR_BUILT),
    units: num(a.NO_UNITS),
    sqft: num(a.BLDG_SQ_FT),
    lotSqft: num(a.LOT_SIZE),
    propertyClass: str(a.LAND_USE_DESC) ?? str(a.LAND_USE),
    lastSalePrice: a.SALE_PRICE && a.SALE_PRICE > 0 ? a.SALE_PRICE : undefined,
    lastSaleDate: saleDate,
    source: 'davidson_tn',
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
