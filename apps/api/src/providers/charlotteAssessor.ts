import type { AssessorRecord, GeocodedAddress, ProviderResult } from '@mfa/shared';

// Mecklenburg County / Charlotte — free ArcGIS FeatureServer published
// by Mecklenburg County GIS. The POLARIS system (Property Ownership
// Land Records Information System) is the public-facing UI on top of
// this service. No API key.
//
// Mecklenburg publishes a `Parcels_Landmarks` FeatureServer with
// ownership-joined attributes. The exact FeatureServer slug has changed
// once historically (pre-2024); the Open Mapping catalog at
// gis.mecknc.gov/data-center is authoritative if this ever 404s.
const CHARLOTTE_PARCELS =
  'https://meckgis.mecklenburgcountync.gov/server/rest/services/Parcels_Landmarks/MapServer/1/query';

interface MecklenburgParcelAttrs {
  PID?: string;                   // Parcel ID (Mecklenburg's primary key)
  TAXPID?: string;                // Alternative — some layer versions use this
  OWNER?: string;                 // Owner name as-printed
  MAILADDR?: string;              // Owner mailing address
  MAILCITY?: string;
  MAILSTATE?: string;
  MAILZIP?: string;
  LOCADDR?: string;               // Situs / location address
  ZIP?: string;
  // Ownership details
  SALEPRICE?: number;
  SALEDATE?: number;              // epoch ms (most common) or string
  // Building details come from the assessor join table
  YEARBUILT?: number;
  HEATEDAREA?: number;            // Typical residential column
  BLDG_AREA?: number;             // Present on commercial
  LAND_AREA?: number;             // sqft
  NUM_UNITS?: number;
  UNITS?: number;                 // Some layer versions use UNITS
  // Valuation
  LANDVALUE?: number;
  BLDG_VALUE?: number;
  TOTAL_VALUE?: number;
  // Classification
  LAND_USE?: string;
  LAND_USE_DESC?: string;
  USECODE?: string;
}

interface FeatureServerResponse {
  features?: Array<{ attributes: MecklenburgParcelAttrs }>;
  error?: { message: string };
}

export async function fetchCharlotteAssessor(
  geocode: GeocodedAddress
): Promise<ProviderResult<AssessorRecord>> {
  const provider = 'charlotte_assessor';
  if (geocode.stateCode !== 'NC') {
    return {
      provider,
      status: 'not_available',
      message: 'Mecklenburg County Assessor only covers addresses in NC',
    };
  }

  try {
    const street = geocode.components?.route ?? '';
    const number = geocode.components?.street_number ?? '';
    const addr = `${number} ${street}`.trim().toUpperCase();
    if (!addr) {
      return { provider, status: 'not_available', message: 'Geocode missing street components' };
    }

    const url = new URL(CHARLOTTE_PARCELS);
    url.searchParams.set('where', `LOCADDR LIKE '${addr.replace(/'/g, "''")}%'`);
    url.searchParams.set('outFields', '*');
    url.searchParams.set('f', 'json');
    url.searchParams.set('resultRecordCount', '1');

    const res = await fetch(url);
    if (!res.ok) {
      return { provider, status: 'error', message: `Mecklenburg ArcGIS HTTP ${res.status}` };
    }
    const body = (await res.json()) as FeatureServerResponse;
    if (body.error) {
      return { provider, status: 'error', message: body.error.message };
    }
    if (!body.features || body.features.length === 0) {
      return { provider, status: 'not_available', message: 'No Mecklenburg parcel matched this address' };
    }

    const record = toRecord(body.features[0].attributes);
    return { provider, status: 'ok', data: record, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { provider, status: 'error', message: (err as Error).message };
  }
}

function toRecord(a: MecklenburgParcelAttrs): AssessorRecord {
  // Mecklenburg mixes date types — handle both epoch ms and ISO strings.
  let saleDate: string | undefined;
  if (a.SALEDATE != null) {
    if (typeof a.SALEDATE === 'number') {
      saleDate = new Date(a.SALEDATE).toISOString().slice(0, 10);
    } else if (typeof a.SALEDATE === 'string' && /^\d{4}-\d{2}-\d{2}/.test(a.SALEDATE)) {
      saleDate = (a.SALEDATE as string).slice(0, 10);
    }
  }

  // Prefer BLDG_AREA (commercial) then HEATEDAREA (residential).
  const sqft = num(a.BLDG_AREA) ?? num(a.HEATEDAREA);
  const units = num(a.NUM_UNITS) ?? num(a.UNITS);

  return {
    parcelId: str(a.PID) ?? str(a.TAXPID),
    owner: str(a.OWNER),
    assessedValue: num(a.TOTAL_VALUE),
    yearBuilt: num(a.YEARBUILT),
    units,
    sqft,
    lotSqft: num(a.LAND_AREA),
    propertyClass: str(a.LAND_USE_DESC) ?? str(a.LAND_USE) ?? str(a.USECODE),
    lastSalePrice: a.SALEPRICE && a.SALEPRICE > 0 ? a.SALEPRICE : undefined,
    lastSaleDate: saleDate,
    source: 'mecklenburg_nc',
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
